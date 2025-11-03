import { randomBytes } from 'crypto';

// PII patterns per blueprint
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const API_KEY_REGEX = /\b[A-Za-z0-9_-]{32,}\b/g;
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

export interface RedactionMap {
  [placeholder: string]: string;
}

export interface RedactionResult {
  redacted: string;
  map: RedactionMap | null;
  hadPII: boolean;
}

function generatePlaceholder(type: string): string {
  const id = randomBytes(4).toString('hex');
  return `[${type.toUpperCase()}_${id}]`;
}

/**
 * Redact PII from text with reversible mapping
 * Returns: { redacted: string, map: RedactionMap | null, hadPII: boolean }
 */
export function redactPII(text: string): RedactionResult {
  let redacted = text;
  const map: RedactionMap = {};
  let hadPII = false;

  // Email
  redacted = redacted.replace(EMAIL_REGEX, (match) => {
    hadPII = true;
    const placeholder = generatePlaceholder('email');
    map[placeholder] = match;
    return placeholder;
  });

  // Phone
  redacted = redacted.replace(PHONE_REGEX, (match) => {
    hadPII = true;
    const placeholder = generatePlaceholder('phone');
    map[placeholder] = match;
    return placeholder;
  });

  // SSN
  redacted = redacted.replace(SSN_REGEX, (match) => {
    hadPII = true;
    const placeholder = generatePlaceholder('ssn');
    map[placeholder] = match;
    return placeholder;
  });

  // Credit card
  redacted = redacted.replace(CREDIT_CARD_REGEX, (match) => {
    hadPII = true;
    const placeholder = generatePlaceholder('card');
    map[placeholder] = match;
    return placeholder;
  });

  // JWT
  redacted = redacted.replace(JWT_REGEX, (match) => {
    hadPII = true;
    const placeholder = generatePlaceholder('jwt');
    map[placeholder] = match;
    return placeholder;
  });

  // API keys (only if 32+ chars and looks like a key)
  redacted = redacted.replace(API_KEY_REGEX, (match) => {
    // Skip common words
    if (/^[A-Za-z]+$/.test(match)) return match;
    hadPII = true;
    const placeholder = generatePlaceholder('apikey');
    map[placeholder] = match;
    return placeholder;
  });

  // IPv4
  redacted = redacted.replace(IPV4_REGEX, (match) => {
    // Skip localhost and common private ranges if desired
    if (match === '127.0.0.1' || match.startsWith('192.168.') || match.startsWith('10.')) {
      return match;
    }
    hadPII = true;
    const placeholder = generatePlaceholder('ip');
    map[placeholder] = match;
    return placeholder;
  });

  return {
    redacted,
    map: hadPII ? map : null,
    hadPII,
  };
}

/**
 * Restore PII from redacted text using the map
 */
export function restorePII(redacted: string, map: RedactionMap | null): string {
  if (!map) return redacted;

  let restored = redacted;
  for (const [placeholder, original] of Object.entries(map)) {
    restored = restored.replace(placeholder, original);
  }

  return restored;
}

/**
 * Check if text is entirely redacted (all PII, nothing left)
 */
export function isAllRedacted(text: string): boolean {
  const trimmed = text.trim();
  // Check if only placeholders remain
  return /^\[(?:EMAIL|PHONE|SSN|CARD|JWT|APIKEY|IP)_[a-f0-9]+\](\s+\[(?:EMAIL|PHONE|SSN|CARD|JWT|APIKEY|IP)_[a-f0-9]+\])*$/.test(trimmed);
}
