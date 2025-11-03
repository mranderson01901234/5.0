import { describe, it, expect } from 'vitest';
import { redactPII, restorePII, isAllRedacted } from '../src/redaction.js';

describe('PII Redaction', () => {
  it('should redact email addresses', () => {
    const result = redactPII('Contact me at john.doe@example.com');

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[EMAIL_[a-f0-9]+\]/);
    expect(result.redacted).not.toContain('john.doe@example.com');
    expect(result.map).toBeTruthy();
  });

  it('should redact phone numbers', () => {
    const result = redactPII('Call me at 555-123-4567 or (555) 123-4567');

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[PHONE_[a-f0-9]+\]/);
    expect(result.map).toBeTruthy();
  });

  it('should redact SSN', () => {
    const result = redactPII('My SSN is 123-45-6789');

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[SSN_[a-f0-9]+\]/);
    expect(result.redacted).not.toContain('123-45-6789');
  });

  it('should redact credit card numbers', () => {
    const result = redactPII('Card: 1234-5678-9012-3456');

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[CARD_[a-f0-9]+\]/);
  });

  it('should redact JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactPII(`Token: ${jwt}`);

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[JWT_[a-f0-9]+\]/);
  });

  it('should redact API keys', () => {
    const result = redactPII('API key: sk_test_example12345678901234567890');

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[APIKEY_[a-f0-9]+\]/);
  });

  it('should redact IPv4 addresses', () => {
    const result = redactPII('Server at 203.0.113.42');

    expect(result.hadPII).toBe(true);
    expect(result.redacted).toMatch(/\[IP_[a-f0-9]+\]/);
  });

  it('should not redact localhost or private IPs', () => {
    const result = redactPII('Server at 127.0.0.1 or 192.168.1.1');

    expect(result.hadPII).toBe(false);
    expect(result.redacted).toContain('127.0.0.1');
    expect(result.redacted).toContain('192.168.1.1');
  });

  it('should handle text with no PII', () => {
    const result = redactPII('I prefer using TypeScript for my projects');

    expect(result.hadPII).toBe(false);
    expect(result.map).toBeNull();
    expect(result.redacted).toBe('I prefer using TypeScript for my projects');
  });

  it('should restore PII from redacted text', () => {
    const original = 'Contact john@example.com or call 555-1234';
    const { redacted, map } = redactPII(original);
    const restored = restorePII(redacted, map);

    expect(restored).toContain('john@example.com');
    expect(restored).toContain('555-1234');
  });

  it('should handle multiple PII instances', () => {
    const text = 'Email: alice@test.com, bob@test.com Phone: 555-0001, 555-0002';
    const result = redactPII(text);

    expect(result.hadPII).toBe(true);
    expect(result.map).toBeTruthy();
    expect(Object.keys(result.map!).length).toBeGreaterThan(2);
  });

  it('should detect entirely redacted content', () => {
    const result = redactPII('john@example.com');
    expect(isAllRedacted(result.redacted)).toBe(true);
  });

  it('should not mark partially redacted as all redacted', () => {
    const result = redactPII('My email is john@example.com and I like TypeScript');
    expect(isAllRedacted(result.redacted)).toBe(false);
  });

  it('should create unique placeholders for each PII instance', () => {
    const result = redactPII('Email: test@a.com and test@b.com');
    const placeholders = Object.keys(result.map!);

    expect(new Set(placeholders).size).toBe(placeholders.length); // All unique
  });
});
