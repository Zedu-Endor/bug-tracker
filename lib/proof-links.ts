/** Split optional textarea input into trimmed non-empty lines. */
export function splitProofLinkLines(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates whether a given URL is a valid GitHub URL (e.g. issues, PRs, or resources).
 * Requires http(s) protocol, a GitHub host, and an actual path.
 */
export function isGitHubUrl(value: string): boolean {
  if (/[\[\]<>"\\^|]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    const isGitHubHost =
      host === "github.com" ||
      host === "www.github.com" ||
      host === "gist.github.com" ||
      host.endsWith(".github.com");

    if (!isGitHubHost) {
      return false;
    }

    const cleanPath = url.pathname.replace(/^\/+|\/+$/g, "");
    return cleanPath.length > 0;
  } catch {
    return false;
  }
}

