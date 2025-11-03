import { expose } from 'comlink';

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const URL_RX = /\b((?:https?:\/\/|mailto:)[^\s<>"'`]+|(?:www\.)[^\s<>"'`]+)\b/gi;

function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw, 'http://x');
    return SAFE_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

function linkify(text: string): string {
  return text.replace(URL_RX, (m) => {
    const href = m.startsWith('www.') ? `https://${m}` : m;
    if (!isSafeUrl(href)) return m;
    const display = m.length > 72 ? m.slice(0, 69) + '…' : m;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow ugc">${display}</a>`;
  });
}

const api = {
  linkifyMessage(input: string): string {
    return linkify(input);
  },
};

export type SanitizeWorkerApi = typeof api;

expose(api);
