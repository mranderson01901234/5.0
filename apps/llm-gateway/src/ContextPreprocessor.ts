/**
 * Context Preprocessor - Transforms structured context blocks into natural narrative
 * 
 * Before LLM sees input, rewrite structured data into clean narrative form.
 * Example: `[Memory] user studied dopamine` → "You mentioned studying dopamine earlier."
 * 
 * This preserves continuity without exposing raw tags and metadata.
 */

/**
 * Preprocess context blocks by type
 */
export function preprocessContext(
  rawContext: string,
  contextType: 'memory' | 'ingestion' | 'rag' | 'conversation' | 'summary'
): string {
  if (!rawContext || !rawContext.trim()) {
    return '';
  }

  switch (contextType) {
    case 'memory':
      return preprocessMemoryContext(rawContext);
    case 'ingestion':
      return preprocessIngestionContext(rawContext);
    case 'rag':
      return preprocessRAGContext(rawContext);
    case 'conversation':
      return preprocessConversationContext(rawContext);
    case 'summary':
      return preprocessSummaryContext(rawContext);
    default:
      return rawContext;
  }
}

/**
 * Transform memory blocks: [Memory] content → natural narrative
 * Example: "[Memory] user studied dopamine" → "You mentioned studying dopamine earlier."
 */
function preprocessMemoryContext(text: string): string {
  // Remove header lines like "Relevant memories:" or "Relevant context:"
  let cleaned = text.replace(/^(Relevant\s+(memories|context):?\s*)/i, '').trim();
  
  // Split by newlines to handle multiple memory entries
  const lines = cleaned.split('\n').filter(line => line.trim());
  
  const narratives: string[] = [];
  
  for (const line of lines) {
    // Match [Memory] or [memory] or [type] patterns
    const memoryMatch = line.match(/^\[(?:Memory|memory|[\w]+)\]\s*(.+)$/);
    if (memoryMatch) {
      const content = memoryMatch[1].trim();
      if (content) {
        // Transform into natural narrative
        narratives.push(formatAsNarrative(content, 'memory'));
      }
    } else if (line.trim()) {
      // Fallback: if no bracket pattern, treat as raw content
      narratives.push(formatAsNarrative(line.trim(), 'memory'));
    }
  }
  
  return narratives.join('\n\n');
}

/**
 * Transform ingestion context: "title: summary (from domain)" → natural narrative
 * Example: "React Hooks: Learn about useState (from react.dev)" 
 * → "There's information about React Hooks, specifically useState, available from react.dev."
 */
function preprocessIngestionContext(text: string): string {
  // Remove header lines if present
  let cleaned = text.replace(/^(Relevant\s+recent\s+information:?\s*)/i, '').trim();
  
  if (!cleaned) return '';
  
  // Split by double newlines (items are separated by \n\n) or single newlines
  const items = cleaned.split(/\n\n+/).filter(item => item.trim());
  
  // If no double newlines, try splitting by single newlines (fallback)
  const finalItems = items.length > 1 ? items : cleaned.split('\n').filter(item => item.trim());
  
  const narratives: string[] = [];
  
  for (const item of finalItems) {
    // Pattern: "title: summary (from domain)" or just "title: summary"
    const domainMatch = item.match(/^(.+?)\s*\(from\s+(.+?)\)$/);
    if (domainMatch) {
      const content = domainMatch[1].trim();
      const domain = domainMatch[2].trim();
      narratives.push(formatIngestionItem(content, domain));
    } else if (item.trim()) {
      narratives.push(formatIngestionItem(item.trim()));
    }
  }
  
  return narratives.join('\n\n');
}

/**
 * Transform RAG context: [type] content → natural narrative
 * Similar to memory but handles multiple types (memory, vector, web)
 */
function preprocessRAGContext(text: string): string {
  // Remove header lines
  let cleaned = text.replace(/^(Relevant\s+context:?\s*)/i, '').trim();
  
  if (!cleaned) return '';
  
  const lines = cleaned.split('\n').filter(line => line.trim());
  const narratives: string[] = [];
  
  for (const line of lines) {
    // Match [type] content patterns
    const typeMatch = line.match(/^\[(\w+)\]\s*(.+)$/);
    if (typeMatch) {
      const type = typeMatch[1].toLowerCase();
      const content = typeMatch[2].trim();
      if (content) {
        narratives.push(formatAsNarrative(content, type as 'memory' | 'web' | 'vector'));
      }
    } else if (line.trim()) {
      narratives.push(formatAsNarrative(line.trim(), 'memory'));
    }
  }
  
  return narratives.join('\n\n');
}

/**
 * Transform conversation history: [Conversation N]: summary → natural narrative
 * Example: "[Conversation 1]: discussed React hooks"
 * → "In a previous conversation, you discussed React hooks."
 */
function preprocessConversationContext(text: string): string {
  // Remove header lines
  let cleaned = text.replace(/^(Recent\s+conversation\s+history:?\s*)/i, '').trim();
  
  if (!cleaned) return '';
  
  const lines = cleaned.split('\n').filter(line => line.trim());
  const narratives: string[] = [];
  
  for (const line of lines) {
    // Match [Conversation N]: summary
    const convMatch = line.match(/^\[Conversation\s+(\d+)\]:\s*(.+)$/i);
    if (convMatch) {
      const convNum = convMatch[1];
      const summary = convMatch[2].trim();
      narratives.push(formatConversationHistory(summary, parseInt(convNum)));
    } else if (line.trim()) {
      narratives.push(formatConversationHistory(line.trim()));
    }
  }
  
  return narratives.join('\n\n');
}

/**
 * Transform summary context: "Previous conversation summary: ..." → natural narrative
 */
function preprocessSummaryContext(text: string): string {
  // Remove header prefix
  let cleaned = text.replace(/^(Previous\s+conversation\s+summary:?\s*)/i, '').trim();
  
  if (!cleaned) return '';
  
  // If it's already in narrative form, return as-is
  // Otherwise, format it naturally
  if (cleaned.toLowerCase().startsWith('you') || cleaned.toLowerCase().startsWith('in') || cleaned.toLowerCase().startsWith('we')) {
    return cleaned;
  }
  
  return `Earlier in our conversation, ${cleaned.toLowerCase()}.`;
}

/**
 * Format content as natural narrative based on type
 */
function formatAsNarrative(content: string, type: 'memory' | 'web' | 'vector' = 'memory'): string {
  // Remove any remaining brackets or markers
  content = content.replace(/^\[.*?\]\s*/, '').trim();
  
  // Detect if it's already in first person ("you mentioned", "you studied")
  if (/^(you|you've|you're|you were)/i.test(content)) {
    return content;
  }
  
  // Detect if it's a statement about the user (case-insensitive)
  const lowerContent = content.toLowerCase();
  if (/^(user|the user|they|they've|they're)/i.test(content)) {
    // Replace "User" or "The user" at start with "you"
    let result = content.replace(/^(user|the user)\s+/i, 'you ').replace(/^(they|they've|they're)\s+/i, (match) => {
      return match.toLowerCase() === 'they' ? 'you ' : 
             match.toLowerCase() === 'they\'ve' ? 'you\'ve ' : 
             'you\'re ';
    });
    
    // Also handle "User prefers X" -> "You prefer X"
    result = result.replace(/^you prefers\s+/i, 'you prefer ');
    result = result.replace(/^you likes\s+/i, 'you like ');
    result = result.replace(/^you wants\s+/i, 'you want ');
    result = result.replace(/^you needs\s+/i, 'you need ');
    result = result.replace(/^you works\s+/i, 'you work ');
    result = result.replace(/^you uses\s+/i, 'you use ');
    result = result.replace(/^you is\s+/i, 'you are ');
    
    return result;
  }
  
  // Transform into natural narrative WITHOUT the "you mentioned" prefix
  // Just return the content as-is, slightly normalized
  if (/^[a-z]/.test(content)) {
    // Already lowercase, capitalize first letter
    return content.charAt(0).toUpperCase() + content.slice(1);
  }
  
  // Return as-is
  return content;
}

/**
 * Format ingestion item with optional domain
 */
function formatIngestionItem(content: string, domain?: string): string {
  // Handle "title: summary" format
  const colonIndex = content.indexOf(':');
  let title = '';
  let summary = '';
  
  if (colonIndex > 0 && colonIndex < content.length - 1) {
    title = content.substring(0, colonIndex).trim();
    summary = content.substring(colonIndex + 1).trim();
  } else {
    summary = content;
  }
  
  // Build concise narrative - prioritize content over metadata
  let narrative = '';
  if (summary) {
    // Use summary directly (most important content)
    narrative = summary;
  } else if (title) {
    // Fallback to title if no summary
    narrative = title;
  } else {
    return ''; // Empty content
  }
  
  // Skip domain for conciseness - the LLM doesn't need this metadata
  // Domain is only noise when generating concise responses
  
  // Only add period if it's not already there
  if (!narrative.endsWith('.')) {
    narrative += '.';
  }
  
  return narrative;
}

/**
 * Format conversation history entry
 */
function formatConversationHistory(summary: string, convNum?: number): string {
  // Remove any remaining markers
  summary = summary.replace(/^\[Conversation\s+\d+\]:\s*/i, '').trim();
  
  // If it's already narrative, use it
  if (/^(you|we|in|earlier|previously)/i.test(summary)) {
    if (convNum) {
      return `In a previous conversation, ${summary.toLowerCase()}.`;
    }
    return summary;
  }
  
  // Transform into narrative
  if (convNum) {
    return `In a previous conversation, you discussed ${summary.toLowerCase()}.`;
  }
  
  return `In a previous conversation, you discussed ${summary.toLowerCase()}.`;
}

/**
 * Preprocess all context blocks in a system message
 * Handles multiple context types in one message
 */
export function preprocessSystemMessage(content: string): string {
  if (!content || !content.trim()) {
    return content;
  }
  
  // Split by common header patterns to identify sections
  const sections: Array<{ type: string; content: string }> = [];
  let currentSection = content;
  
  // Try to split by known headers
  const headers = [
    /^(Relevant\s+memories?:?\s*)/i,
    /^(Relevant\s+context:?\s*)/i,
    /^(Relevant\s+recent\s+information:?\s*)/i,
    /^(Recent\s+conversation\s+history:?\s*)/i,
    /^(Previous\s+conversation\s+summary:?\s*)/i,
  ];
  
  // Find all header positions
  const headerMatches: Array<{ index: number; type: string; length: number }> = [];
  for (const header of headers) {
    const match = content.match(header);
    if (match && match.index !== undefined) {
      headerMatches.push({
        index: match.index,
        type: match[0],
        length: match[0].length,
      });
    }
  }
  
  // If no headers found, try to detect context types from content
  if (headerMatches.length === 0) {
    // Check for [Memory], [Conversation], etc. patterns
    if (/\[Memory\]|\[memory\]/i.test(content)) {
      return preprocessContext(content, 'memory');
    }
    if (/\[Conversation\s+\d+\]/i.test(content)) {
      return preprocessContext(content, 'conversation');
    }
    if (/\(from\s+[\w.]+\)/i.test(content)) {
      return preprocessContext(content, 'ingestion');
    }
    if (/\[(memory|web|vector)\]/i.test(content)) {
      return preprocessContext(content, 'rag');
    }
    // No context patterns found, return as-is
    return content;
  }
  
  // Sort by index
  headerMatches.sort((a, b) => a.index - b.index);
  
  // Extract sections
  let lastIndex = 0;
  for (let i = 0; i < headerMatches.length; i++) {
    const match = headerMatches[i];
    const nextMatch = headerMatches[i + 1];
    
    // Extract content between this header and next (or end)
    const sectionStart = match.index + match.length;
    const sectionEnd = nextMatch ? nextMatch.index : content.length;
    const sectionContent = content.substring(sectionStart, sectionEnd).trim();
    
    // Determine type from header
    let contextType: 'memory' | 'ingestion' | 'rag' | 'conversation' | 'summary' = 'memory';
    if (/Relevant\s+recent\s+information/i.test(match.type)) {
      contextType = 'ingestion';
    } else if (/Relevant\s+context/i.test(match.type) && /\[(memory|web|vector)\]/i.test(sectionContent)) {
      contextType = 'rag';
    } else if (/Recent\s+conversation\s+history/i.test(match.type)) {
      contextType = 'conversation';
    } else if (/Previous\s+conversation\s+summary/i.test(match.type)) {
      contextType = 'summary';
    }
    
    sections.push({ type: contextType, content: sectionContent });
    lastIndex = sectionEnd;
  }
  
    // Process each section and combine
    const processedSections = sections.map(section => 
      preprocessContext(section.content, section.type as 'memory' | 'ingestion' | 'rag' | 'conversation' | 'summary')
    ).filter(s => s.trim());
  
  // Combine with the base prompt (content before first header)
  const basePrompt = content.substring(0, headerMatches[0]?.index || content.length).trim();
  
  if (processedSections.length === 0) {
    return basePrompt;
  }
  
  // Combine base prompt with processed context
  return [basePrompt, ...processedSections].filter(Boolean).join('\n\n');
}

