const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw, 'http://x'); // base for relative parsing
    return SAFE_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

const URL_RX =
  /\b((?:https?:\/\/|mailto:)[^\s<>"'`]+|(?:www\.)[^\s<>"'`]+)\b/gi;

export function linkify(text: string): string {
  return text.replace(URL_RX, (m) => {
    const href = m.startsWith('www.') ? `https://${m}` : m;
    if (!isSafeUrl(href)) return m;
    const display = m.length > 72 ? m.slice(0, 69) + '…' : m;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow ugc">${display}</a>`;
  });
}

