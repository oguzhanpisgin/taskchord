const TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.\S+/g,
  /\b[0-9a-fA-F]{40,}\b/g,
];

const SECRET_ASSIGNMENT = /\b(token|secret|password|key|authorization)\b\s*[:=]\s*\S+/gi;
const WINDOWS_HOME = /[A-Za-z]:\\Users\\[^\\\s]+/gi;
const POSIX_HOME = /\/(?:home|Users)\/[^/\s]+/g;

export function redactText(value: string): string {
  let redacted = value.replace(WINDOWS_HOME, "~").replace(POSIX_HOME, "~");
  for (const pattern of TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted.replace(SECRET_ASSIGNMENT, "$1=[redacted]");
}

export function summarizeOutput(value: string, maxLength = 200): string {
  const firstLine = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const compact = redactText(firstLine ?? "").replace(/\s+/gu, " ");
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}
