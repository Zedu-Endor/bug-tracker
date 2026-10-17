import { createConnection, type Socket } from "net";
import { hostname as osHostname } from "os";
import { connect as tlsConnect, type TLSSocket } from "tls";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

type MailEnv = {
  SMTP_HOST?: string;
  SMTP_FROM?: string;
  NODE_ENV?: string;
  /** Override the hostname sent in EHLO; defaults to os.hostname() (#353). */
  SMTP_EHLO_NAME?: string;
  /** TCP connect timeout in ms (default 10 000) (#353). */
  SMTP_CONNECT_TIMEOUT_MS?: string;
  /** Per-command SMTP response timeout in ms (default 15 000) (#353). */
  SMTP_COMMAND_TIMEOUT_MS?: string;
};

export function smtpConfigured(env: MailEnv = process.env as MailEnv) {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

/**
 * Whether email can actually be delivered: SMTP is configured, or this is
 * local development, where messages go to the console instead (#210).
 */
export function canSendMail(env: MailEnv = process.env as MailEnv) {
  return smtpConfigured(env) || env.NODE_ENV !== "production";
}

/** Thrown by sendMail in production when SMTP isn't configured (#210). */
export class MailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured: set SMTP_HOST and SMTP_FROM.");
    this.name = "MailNotConfiguredError";
  }
}

function encodeSubject(subject: string) {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/**
 * Sends over SMTP (AUTH LOGIN + STARTTLS) when SMTP_HOST + SMTP_FROM are set.
 *
 * Without SMTP: in development the message is printed to the console; in
 * production it throws MailNotConfiguredError and logs nothing, so a reset
 * link (a live credential) never ends up in container logs (#210).
 */
export async function sendMail({ to, subject, text }: SendMailInput) {
  if (!smtpConfigured()) {
    if (!canSendMail()) {
      throw new MailNotConfiguredError();
    }
    console.info(`[mail:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }

  await sendSmtpMail({ to, subject, text });
}

async function sendSmtpMail({ to, subject, text }: SendMailInput) {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || "587");
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    port === 465;
  const from = process.env.SMTP_FROM!;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Prefer an explicit override; fall back to the machine's real hostname so
  // the EHLO greeting is RFC-5321-compliant instead of the literal "localhost"
  // which many mail servers treat as a spam signal (#353).
  const ehloName = getEhloName();
  const connectTimeoutMs = Number(process.env.SMTP_CONNECT_TIMEOUT_MS ?? "10000");
  const commandTimeoutMs = Number(process.env.SMTP_COMMAND_TIMEOUT_MS ?? "15000");

  const socket: Socket | TLSSocket = secure
    ? await connectTls(host, port, connectTimeoutMs)
    : await connectPlain(host, port, connectTimeoutMs);

  const session = new SmtpSession(socket, commandTimeoutMs);

  try {
    await session.expect(220);
    await session.command(`EHLO ${ehloName}`, 250);

    if (!secure) {
      await session.command("STARTTLS", 220);
      const upgraded = await upgradeToTls(socket as Socket, host, connectTimeoutMs);
      session.replaceSocket(upgraded);
      await session.command(`EHLO ${ehloName}`, 250);
    }

    if (user && pass) {
      await session.command("AUTH LOGIN", 334);
      await session.command(Buffer.from(user).toString("base64"), 334);
      await session.command(Buffer.from(pass).toString("base64"), 235);
    }

    const fromAddress = extractEmail(singleLine(from));
    await session.command(`MAIL FROM:<${fromAddress}>`, 250);
    await session.command(`RCPT TO:<${singleLine(to)}>`, 250);
    await session.command("DATA", 354);

    await session.command(buildSmtpData({ from, to, subject, text }), 250);
    await session.command("QUIT", 221);
  } finally {
    session.close();
  }
}

/**
 * Returns an RFC-5321 compliant EHLO name:
 * - Uses process.env.SMTP_EHLO_NAME if provided
 * - If OS hostname is a valid FQDN (contains dot), uses it
 * - If OS hostname is an address literal, uses it
 * - Otherwise falls back to address literal "[127.0.0.1]"
 */
export function getEhloName(override?: string, hostname?: string): string {
  const custom = override ?? process.env.SMTP_EHLO_NAME;
  if (custom && custom.trim()) {
    return custom.trim();
  }
  const host = (hostname ?? osHostname()).trim();
  if (/^\[.+\]$/.test(host)) {
    return host;
  }
  const isFqdn =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
      host,
    );
  if (isFqdn) {
    return host;
  }
  return "[127.0.0.1]";
}

/** Removes CR/LF so a value can't start a new header line (header injection). */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * The DATA payload, ending in the "." terminator line (#218).
 *
 * - Header values are flattened to one line, so a title like
 *   "Bug\r\nBcc: x@evil" can't inject headers.
 * - Body lines that start with "." are dot-stuffed (RFC 5321 §4.5.2);
 *   otherwise a line containing only "." would end the message early and
 *   the rest would be sent to the server as commands.
 */
export function buildSmtpData({ from, to, subject, text }: SendMailInput & { from: string }): string {
  const body = text
    .replace(/\r?\n/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");

  return [
    `From: ${singleLine(from)}`,
    `To: ${singleLine(to)}`,
    `Subject: ${encodeSubject(singleLine(subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    ".",
  ].join("\r\n");
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return match?.[1] ?? value.trim();
}

function connectPlain(host: string, port: number, timeoutMs: number) {
  return new Promise<Socket>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const socket = createConnection({ host, port }, () => {
      if (timer) clearTimeout(timer);
      resolve(socket);
    });
    socket.setEncoding("utf8");
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        socket.destroy(new Error(`SMTP connect timeout after ${timeoutMs}ms (${host}:${port})`));
      }, timeoutMs);
    }
    socket.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

function connectTls(host: string, port: number, timeoutMs: number) {
  return new Promise<TLSSocket>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const socket = tlsConnect({ host, port, servername: host }, () => {
      if (timer) clearTimeout(timer);
      resolve(socket);
    });
    socket.setEncoding("utf8");
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        socket.destroy(new Error(`SMTP TLS connect timeout after ${timeoutMs}ms (${host}:${port})`));
      }, timeoutMs);
    }
    socket.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

export function upgradeToTls(socket: Socket, host: string, timeoutMs: number) {
  return new Promise<TLSSocket>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const upgraded = tlsConnect({ socket, host, servername: host }, () => {
      if (timer) clearTimeout(timer);
      resolve(upgraded);
    });
    upgraded.setEncoding("utf8");
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        upgraded.destroy(new Error(`SMTP TLS handshake timeout after ${timeoutMs}ms (${host})`));
      }, timeoutMs);
    }
    upgraded.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

/** Exported for tests only. */
export class SmtpSession {
  private buffer = "";
  private waiters: Array<{
    code: number;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> | undefined;
  }> = [];

  /**
   * @param socket - The underlying TCP/TLS socket.
   * @param commandTimeoutMs - How long to wait for a server reply before
   *   rejecting the pending command (default: no timeout, for tests). (#353)
   */
  constructor(
    private socket: Socket | TLSSocket,
    private commandTimeoutMs = 0,
  ) {
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    this.socket.on("error", (err: Error) => {
      this.close(err);
    });
    this.socket.on("close", () => {
      this.close(new Error("SMTP socket closed"));
    });
  }

  replaceSocket(socket: Socket | TLSSocket) {
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.socket.removeAllListeners("close");
    this.socket = socket;
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    this.socket.on("error", (err: Error) => {
      this.close(err);
    });
    this.socket.on("close", () => {
      this.close(new Error("SMTP socket closed"));
    });
  }

  command(line: string, expectCode: number) {
    this.socket.write(`${line}\r\n`);
    return this.expect(expectCode);
  }

  expect(code: number) {
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (this.commandTimeoutMs > 0) {
        timer = setTimeout(() => {
          // Remove this waiter so flush() can't resolve it after timeout.
          const idx = this.waiters.findIndex((w) => w.timer === timer);
          if (idx !== -1) this.waiters.splice(idx, 1);
          reject(
            new Error(`SMTP command timeout: no response for code ${code} after ${this.commandTimeoutMs}ms`),
          );
        }, this.commandTimeoutMs);
      }
      this.waiters.push({ code, resolve, reject, timer });
      this.flush();
    });
  }

  close(error?: Error) {
    const err = error ?? new Error("SMTP session closed");
    // Cancel any outstanding timers and reject pending waiters
    for (const w of this.waiters) {
      if (w.timer !== undefined) clearTimeout(w.timer);
      w.reject(err);
    }
    this.waiters = [];
    try {
      this.socket.end();
    } catch {
      // socket might already be closed/destroyed
    }
  }

  private flush() {
    while (this.waiters.length > 0) {
      const lines = this.buffer.split(/\r?\n/);
      if (lines.length < 2) return;

      let end = -1;
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (/^\d{3} /.test(line)) {
          end = i;
          break;
        }
      }
      if (end < 0) return;

      const responseLines = lines.slice(0, end + 1);
      this.buffer = lines.slice(end + 1).join("\n");
      const last = responseLines[responseLines.length - 1] ?? "";
      const responseCode = Number(last.slice(0, 3));
      const waiter = this.waiters.shift()!;

      // Cancel the command timeout — we got a response.
      if (waiter.timer !== undefined) clearTimeout(waiter.timer);

      if (responseCode !== waiter.code) {
        waiter.reject(
          new Error(
            `SMTP expected ${waiter.code}, got ${responseCode}: ${responseLines.join(" | ")}`,
          ),
        );
      } else {
        waiter.resolve();
      }
    }
  }
}
