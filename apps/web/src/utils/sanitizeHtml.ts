import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'b', 'i', 'em', 'strong', 'u',
  'p', 'br', 'ul', 'ol', 'li',
  'pre', 'code', 'span', 'div',
  'math', 'mi', 'mn', 'mo', 'mrow', 'msup', 'msub', 'msqrt', 'mfrac', 'msubsup',
  'a', // Allow anchor tags for linkification
];

const ALLOWED_ATTR = ['class', 'style', 'data-math', 'aria-label', 'role', 'href', 'target', 'rel'];

export function sanitizeHtml(input: string): string {
  if (!input) return '';

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    USE_PROFILES: { html: true },
  });
}

