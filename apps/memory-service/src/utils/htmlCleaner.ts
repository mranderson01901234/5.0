/**
 * Universal HTML cleaner - use this everywhere to strip HTML/markdown
 */

/**
 * Strips ALL HTML tags, entities, and markdown from text
 * This is the single source of truth for HTML cleaning
 */
export function cleanHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Remove all HTML tags (including closing tags like </strong>)
    .replace(/<\/?[^>]+>/g, '') // Catches <strong>, </strong>, <strong class="...">, etc.
    .replace(/<[^>]*>/g, '') // Catch any remaining <tag> patterns
    // Handle HTML entities - decode then strip
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    // Strip tags again after decoding entities
    .replace(/<\/?[^>]+>/g, '')
    .replace(/<[^>]*>/g, '')
    // Remove markdown
    .replace(/\*\*/g, '') // Remove markdown bold
    .replace(/\*/g, '') // Remove any remaining asterisks
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

