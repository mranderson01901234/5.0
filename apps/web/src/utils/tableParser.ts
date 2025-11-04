/**
 * Table Parser Utilities
 * Parses tables from various formats (Markdown, JSON) and auto-detects format
 */

/**
 * Split a markdown table row into cells, handling various formats
 * Normalizes smart quotes and handles leading/trailing pipes
 */
function splitRow(line: string): string[] {
  // Normalize smart punctuation to standard ASCII
  const normalized = line.replace(/[""]/g, '"').replace(/['']/g, "'");
  
  // Remove leading/trailing pipes if present, but track if they existed
  const trimmed = normalized.trim();
  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.endsWith('|');
  
  let content = trimmed;
  if (hasLeadingPipe) content = content.slice(1);
  if (hasTrailingPipe) content = content.slice(0, -1);
  
  // Split by pipe and trim each cell
  const cells = content.split('|').map(c => c.trim());
  
  // Only filter out leading/trailing empty cells if pipes were present
  // This preserves empty cells in the middle while removing artifacts from pipe splitting
  if (hasLeadingPipe && hasTrailingPipe && cells.length > 0) {
    // Standard format with outer pipes - keep all cells including empty ones
    return cells;
  } else {
    // No outer pipes or mixed format - filter empty cells at edges
    let start = 0;
    let end = cells.length;
    while (start < end && cells[start] === '') start++;
    while (end > start && cells[end - 1] === '') end--;
    return cells.slice(start, end);
  }
}

/**
 * Check if a row is a separator row (contains only dashes, colons, and spaces)
 */
function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every(cell => /^:?-{1,}:?$/.test(cell.trim()));
}

/**
 * Parse a markdown table string into a 2D string array
 * Supports tables with or without leading/trailing pipes, and ragged separators
 */
export function parseMarkdownTable(str: string): string[][] {
  if (!str || typeof str !== 'string') {
    return [];
  }

  const lines = str.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return [];
  }

  const rows: string[][] = [];

  for (const line of lines) {
    // Treat any line with at least 2 pipes (or 1 pipe for tables without outer pipes) as a candidate row
    if (!line.includes('|')) {
      continue;
    }
    
    const cells = splitRow(line);
    
    // Skip separator rows (lines with only dashes and colons)
    if (isSeparatorRow(cells)) {
      continue;
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows.length > 0 ? rows : [];
}

/**
 * Parse a JSON table object into a 2D string array
 * Supports array of objects or array of arrays format
 */
export function parseJsonTable(obj: any): string[][] {
  if (!obj) {
    return [];
  }

  // Handle array of arrays
  if (Array.isArray(obj) && obj.length > 0) {
    if (Array.isArray(obj[0])) {
      // Already in row format: [[col1, col2], [val1, val2]]
      return obj.map(row => 
        Array.isArray(row) 
          ? row.map(cell => String(cell ?? ''))
          : []
      ).filter(row => row.length > 0);
    } else if (typeof obj[0] === 'object' && obj[0] !== null) {
      // Array of objects: [{col1: val1, col2: val2}, ...]
      const headers = Object.keys(obj[0]);
      const rows: string[][] = [headers];
      
      for (const item of obj) {
        rows.push(headers.map(key => String(item[key] ?? '')));
      }
      
      return rows;
    }
  }

  // Handle object with rows/columns property
  if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj.rows)) {
      return obj.rows.map((row: any) =>
        Array.isArray(row) 
          ? row.map(cell => String(cell ?? ''))
          : []
      ).filter((row: any[]) => row.length > 0);
    }
    
    if (Array.isArray(obj.data)) {
      return parseJsonTable(obj.data);
    }
  }

  return [];
}

/**
 * Find the last markdown table block in the text
 * Returns the table block as a string, or null if not found
 * Handles blank lines within tables by allowing them as part of the block
 */
function findLastMarkdownTable(text: string): string | null {
  const lines = text.split('\n');
  const tableBlocks: Array<{ start: number; end: number }> = [];
  let currentBlockStart: number | null = null;
  let lastTableLineIndex: number = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const hasPipe = line.includes('|');
    
    if (hasPipe) {
      // Start a new block if we don't have one, or continue existing block
      if (currentBlockStart === null) {
        currentBlockStart = i;
      }
      lastTableLineIndex = i; // Track the last line with pipes
    } else if (trimmedLine === '') {
      // Blank line - allow it within a table block if we're in one
      // Don't end the block yet, wait to see if more table rows follow
      continue;
    } else {
      // Non-blank, non-table line - end current block if we have one
      if (currentBlockStart !== null && lastTableLineIndex >= currentBlockStart) {
        // Check if the block has at least 1 non-separator row
        const blockLines = lines.slice(currentBlockStart, lastTableLineIndex + 1);
        const nonSeparatorRows = blockLines.filter(line => {
          if (!line.includes('|')) return false;
          const cells = splitRow(line);
          return !isSeparatorRow(cells) && cells.length > 0;
        });
        
        if (nonSeparatorRows.length >= 1) {
          tableBlocks.push({ start: currentBlockStart, end: lastTableLineIndex + 1 });
        }
        currentBlockStart = null;
        lastTableLineIndex = -1;
      }
    }
  }
  
  // Handle table that extends to the end of the text
  if (currentBlockStart !== null) {
    // If we have a table block but lastTableLineIndex wasn't set, it means we only had blank lines
    // In that case, skip it. Otherwise, use lastTableLineIndex or the end of the block
    const endIndex = lastTableLineIndex >= currentBlockStart ? lastTableLineIndex + 1 : currentBlockStart + 1;
    const blockLines = lines.slice(currentBlockStart, endIndex);
    const nonSeparatorRows = blockLines.filter(line => {
      if (!line.includes('|')) return false;
      const cells = splitRow(line);
      return !isSeparatorRow(cells) && cells.length > 0;
    });
    
    if (nonSeparatorRows.length >= 1) {
      tableBlocks.push({ start: currentBlockStart, end: endIndex });
    }
  }
  
  // Return the last table block
  if (tableBlocks.length === 0) {
    return null;
  }
  
  const lastBlock = tableBlocks[tableBlocks.length - 1];
  return lines.slice(lastBlock.start, lastBlock.end).join('\n');
}

/**
 * Auto-detect table format from response text and parse it
 * Only extracts the LAST table in the response to avoid creating multiple artifacts
 * Tries markdown first, then JSON
 */
export function autoDetectTableFormat(responseText: string): string[][] {
  if (!responseText || typeof responseText !== 'string') {
    return [];
  }

  const trimmed = responseText.trim();

  // Try to find the last markdown table first
  const lastTableBlock = findLastMarkdownTable(trimmed);
  if (lastTableBlock) {
    const markdownResult = parseMarkdownTable(lastTableBlock);
    if (markdownResult.length > 0 && markdownResult[0] && markdownResult[0].length > 0) {
      return markdownResult;
    }
  }

  // Fallback: if we couldn't find distinct table blocks, try parsing the entire text
  // This handles cases where there's only one table or the table detection logic missed it
  if (trimmed.includes('|') && trimmed.split('\n').some(line => line.includes('|'))) {
    const markdownResult = parseMarkdownTable(trimmed);
    if (markdownResult.length > 0 && markdownResult[0] && markdownResult[0].length > 0) {
      // If we found multiple potential tables, extract only the last one
      // by finding the last set of consecutive table rows
      const lines = trimmed.split('\n');
      let lastTableStart = -1;
      let lastTableEnd = -1;
      let inTable = false;
      let tableStart = -1;
      
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const hasPipe = line.includes('|');
        const trimmedLine = line.trim();
        
        if (hasPipe) {
          if (!inTable) {
            // Start of a table block (scanning backwards)
            inTable = true;
            tableStart = i;
            lastTableEnd = i;
          } else {
            // Continue table block
            tableStart = i;
          }
        } else if (trimmedLine === '') {
          // Blank line - continue scanning
          continue;
        } else {
          // Non-table line - if we were in a table, we found the boundary
          if (inTable && tableStart >= 0) {
            lastTableStart = tableStart;
            break;
          }
          inTable = false;
        }
      }
      
      // If we found a table boundary, extract only that portion
      if (lastTableStart >= 0 && lastTableEnd >= lastTableStart) {
        const extractedTable = lines.slice(lastTableStart, lastTableEnd + 1).join('\n');
        const extractedResult = parseMarkdownTable(extractedTable);
        if (extractedResult.length > 0 && extractedResult[0] && extractedResult[0].length > 0) {
          return extractedResult;
        }
      }
      
      // Otherwise return the full result (single table case)
      return markdownResult;
    }
  }

  // Try JSON parsing (check for JSON code blocks at the end)
  try {
    // Extract JSON from code blocks if present - look for the last JSON code block
    const jsonCodeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
    let jsonMatch: RegExpExecArray | null = null;
    let lastJsonMatch: RegExpExecArray | null = null;
    
    while ((jsonMatch = jsonCodeBlockRegex.exec(trimmed)) !== null) {
      lastJsonMatch = jsonMatch;
    }
    
    if (lastJsonMatch && lastJsonMatch[1]) {
      const jsonStr = lastJsonMatch[1].trim();
      const parsed = JSON.parse(jsonStr);
      const jsonResult = parseJsonTable(parsed);
      if (jsonResult.length > 0 && jsonResult[0] && jsonResult[0].length > 0) {
        return jsonResult;
      }
    }
  } catch {
    // Not valid JSON, continue
  }

  return [];
}

