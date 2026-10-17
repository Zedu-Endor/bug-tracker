import { EventEmitter } from "events";
import { describe, expect, it } from "vitest";
import { SmtpSession, buildSmtpData, getEhloName } from "./mail";

/** The hand-rolled SMTP pieces in lib/mail.ts (#218). */

class FakeSocket extends EventEmitter {
  written: string[] = [];
  ended = false;
  write(data: string) {
    this.written.push(data);
    return true;
  }
  end() {
    this.ended = true;
  }
  /** Server sends text, possibly split across chunks. */
  serverSays(...chunks: string[]) {
    for (const chunk of chunks) this.emit("data", chunk);
  }
}

function session() {
  const socket = new FakeSocket();
  // The session only uses on/write/end/removeAllListeners.
  return { socket, smtp: new SmtpSession(socket as never) };
}

describe("SmtpSession response parsing", () => {
  it("resolves on the expected code", async () => {
    const { socket, smtp } = session();
    const greeting = smtp.expect(220);
    socket.serverSays("220 mail.example ESMTP\r\n");
    await expect(greeting).resolves.toBeUndefined();
  });

  it("waits for the last line of a multi-line reply", async () => {
    const { socket, smtp } = session();
    const ehlo = smtp.command("EHLO localhost", 250);
    socket.serverSays("250-mail.example\r\n250-STARTTLS\r\n");
    let settled = false;
    ehlo.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    socket.serverSays("250 AUTH LOGIN\r\n");
    await expect(ehlo).resolves.toBeUndefined();
    expect(socket.written).toEqual(["EHLO localhost\r\n"]);
  });

  it("handles a reply split across packets", async () => {
    const { socket, smtp } = session();
    const ok = smtp.expect(250);
    socket.serverSays("25", "0 O", "K\r\n");
    await expect(ok).resolves.toBeUndefined();
  });

  it("rejects with the server's reply on an unexpected code", async () => {
    const { socket, smtp } = session();
    const rcpt = smtp.command("RCPT TO:<x@y>", 250);
    socket.serverSays("550 5.1.1 No such user\r\n");
    await expect(rcpt).rejects.toThrow("SMTP expected 250, got 550: 550 5.1.1 No such user");
  });

  it("matches queued replies to commands in order", async () => {
    const { socket, smtp } = session();
    const a = smtp.command("MAIL FROM:<a@x>", 250);
    const b = smtp.command("RCPT TO:<b@x>", 250);
    socket.serverSays("250 OK\r\n250 OK\r\n");
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
  });

  it("rejects with timeout when server fails to respond within commandTimeoutMs (#353)", async () => {
    const socket = new FakeSocket();
    const smtp = new SmtpSession(socket as never, 25);
    const cmd = smtp.command("EHLO test.example", 250);
    await expect(cmd).rejects.toThrow("SMTP command timeout: no response for code 250 after 25ms");
  });

  it("cleans up active timers and rejects pending expectations when close is called (#353)", async () => {
    const socket = new FakeSocket();
    const smtp = new SmtpSession(socket as never, 5000);
    const greeting = smtp.expect(220);
    smtp.close();
    expect(socket.ended).toBe(true);
    await expect(greeting).rejects.toThrow("SMTP session closed");
  });

  it("rejects pending expectations with explicit error when close is passed an error", async () => {
    const socket = new FakeSocket();
    const smtp = new SmtpSession(socket as never);
    const greeting = smtp.expect(220);
    smtp.close(new Error("Connection reset by peer"));
    await expect(greeting).rejects.toThrow("Connection reset by peer");
  });
});

describe("getEhloName", () => {
  it("uses custom override if provided", () => {
    expect(getEhloName("mail.custom.org", "localbox")).toBe("mail.custom.org");
  });

  it("uses process.env.SMTP_EHLO_NAME if set", () => {
    const old = process.env.SMTP_EHLO_NAME;
    try {
      process.env.SMTP_EHLO_NAME = "smtp.corp.internal";
      expect(getEhloName()).toBe("smtp.corp.internal");
    } finally {
      if (old !== undefined) {
        process.env.SMTP_EHLO_NAME = old;
      } else {
        delete process.env.SMTP_EHLO_NAME;
      }
    }
  });

  it("uses hostname when it is a valid FQDN", () => {
    expect(getEhloName(undefined, "server1.example.com")).toBe("server1.example.com");
  });

  it("uses hostname when it is an IPv4 or IPv6 address literal", () => {
    expect(getEhloName(undefined, "[192.168.1.100]")).toBe("[192.168.1.100]");
    expect(getEhloName(undefined, "[::1]")).toBe("[::1]");
  });

  it("falls back to [127.0.0.1] when hostname is an unqualified machine name", () => {
    expect(getEhloName(undefined, "docker-worker")).toBe("[127.0.0.1]");
    expect(getEhloName(undefined, "localhost")).toBe("[127.0.0.1]");
  });
});

describe("buildSmtpData", () => {
  const base = { from: "Zedu <noreply@zedu.chat>", to: "bob@x.dev", subject: "Hi", text: "Hello" };

  it("ends with the terminator line", () => {
    expect(buildSmtpData(base).endsWith("\r\n.")).toBe(true);
  });

  it("dot-stuffs body lines that start with a dot", () => {
    const data = buildSmtpData({ ...base, text: "line one\n.\n.hidden\nend" });
    const lines = data.split("\r\n");
    // Only the final line is a lone ".", so the message can't end early.
    expect(lines.filter((l) => l === ".")).toHaveLength(1);
    expect(lines).toContain("..");
    expect(lines).toContain("..hidden");
  });

  it("flattens CR/LF in headers so a title can't inject headers", () => {
    const data = buildSmtpData({ ...base, subject: "Bug\r\nBcc: attacker@evil.example", to: "bob@x.dev\r\nCc: x@y" });
    const headers = data.split("\r\n\r\n")[0].split("\r\n");
    expect(headers.some((h) => h.startsWith("Bcc:") || h.startsWith("Cc:"))).toBe(false);
    expect(headers).toContain("Subject: Bug Bcc: attacker@evil.example");
  });

  it("normalises body line endings to CRLF", () => {
    const body = buildSmtpData({ ...base, text: "a\nb\r\nc" }).split("\r\n\r\n")[1];
    expect(body).toBe("a\r\nb\r\nc\r\n.");
  });

  it("encodes a non-ASCII subject", () => {
    expect(buildSmtpData({ ...base, subject: "Ça marche" })).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});
