import { useState, useRef, useEffect } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  isStreaming?: boolean;
}

// Language-specific color schemes - consistent colors throughout
const SYNTAX_COLORS = {
  keyword: '#569cd6',       // blue - keywords (import, from, const, let, etc.)
  function: '#dcdcaa',      // yellow/gold - functions
  string: '#ce9178',        // orange/salmon - strings and paths
  comment: '#ffb3d9',       // light pink - comments
  number: '#c586c0',        // purple - numbers
  default: '#9cdcfe',       // light blue - default text (variables, identifiers)
  operator: '#d4d4d4',      // light gray - operators
  punctuation: '#ffd700',   // gold - braces, brackets, parentheses
  class: '#4ec9b0',         // cyan/teal - classes/types
};

// Simplified syntax highlighting
function highlightCode(code: string, language?: string): JSX.Element[] {
  const lines = code.split('\n');
  
  return lines.map((line, lineIdx) => {
    if (!language) {
      return (
        <div key={lineIdx} className="table-row">
          <div className="table-cell pr-4 text-right select-none w-12" style={{ color: '#858585' }}>
            {lineIdx + 1}
          </div>
          <div className="table-cell pl-4">
            <span style={{ color: SYNTAX_COLORS.default }}>{line || ' '}</span>
          </div>
        </div>
      );
    }

    // Simple token-based highlighting
    const tokens: JSX.Element[] = [];
    let currentPos = 0;
    
    // Keywords for various languages
    const keywords = [
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'from', 'class',
      'def', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'extends', 'implements',
      'interface', 'type', 'enum', 'public', 'private', 'protected', 'static', 'abstract', 'yield', 'break', 'continue'
    ];
    
    const functionPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const stringPattern = /(['"`])(?:(?=(\\?))\2.)*?\1/g;
    const commentPattern = /\/\/.*$|\/\*[\s\S]*?\*\/|#.*/g;
    const numberPattern = /\b\d+\.?\d*\b/g;
    const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    // Punctuation: braces, brackets, parentheses, semicolons, colons (not in type annotations)
    const punctuationPattern = /[{}[\]();,]/g;
    // Type annotations (e.g., : string, : React.FC, : NodeJS.Timeout)
    const typePattern = /:\s*([A-Z][a-zA-Z0-9_.<>[\]]*|\w+)/g;
    // HTML tags (e.g., <html>, <head>, <body>, <div>)
    const htmlTagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    // CSS selectors (e.g., body, .login-form, input[type="text"])
    const cssSelectorPattern = /^([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*(\[[^\]]*\])?)\s*\{/g;
    // CSS property names (e.g., font-family, background-color, color)
    const cssPropertyPattern = /([a-zA-Z-]+)\s*:/g;
    
    // Collect all matches with their types
    const matches: Array<{ start: number; end: number; type: string; text: string }> = [];
    
    // Find comments first (highest priority)
    let match;
    while ((match = commentPattern.exec(line)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, type: 'comment', text: match[0] });
    }
    
    // Find HTML tags (before strings to prioritize tag names)
    htmlTagPattern.lastIndex = 0;
    while ((match = htmlTagPattern.exec(line)) !== null) {
      if (match[1] && !matches.some(m => m.type === 'comment' && match!.index >= m.start && match!.index < m.end)) {
        const tagStart = match.index + match[0].indexOf(match[1]);
        const tagEnd = tagStart + match[1].length;
        if (!matches.some(m => tagStart >= m.start && tagStart < m.end)) {
          matches.push({ start: tagStart, end: tagEnd, type: 'class', text: match[1] });
        }
      }
    }
    
    // Find CSS selectors (before strings to prioritize selectors)
    cssSelectorPattern.lastIndex = 0;
    while ((match = cssSelectorPattern.exec(line)) !== null) {
      if (match[1] && !matches.some(m => m.type === 'comment' && match!.index >= m.start && match!.index < m.end)) {
        const selectorStart = match.index;
        const selectorEnd = selectorStart + match[1].length;
        if (!matches.some(m => selectorStart >= m.start && selectorStart < m.end)) {
          matches.push({ start: selectorStart, end: selectorEnd, type: 'class', text: match[1] });
        }
      }
    }
    
    // Find CSS property names (before strings to prioritize property names)
    cssPropertyPattern.lastIndex = 0;
    while ((match = cssPropertyPattern.exec(line)) !== null) {
      if (match[1] && !matches.some(m => m.type === 'comment' && match!.index >= m.start && match!.index < m.end)) {
        const propStart = match.index;
        const propEnd = propStart + match[1].length;
        if (!matches.some(m => propStart >= m.start && propStart < m.end)) {
          matches.push({ start: propStart, end: propEnd, type: 'class', text: match[1] });
        }
      }
    }
    
    // Find strings
    while ((match = stringPattern.exec(line)) !== null) {
      // Don't match if inside a comment
      if (!matches.some(m => m.type === 'comment' && match!.index >= m.start && match!.index < m.end)) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'string', text: match[0] });
      }
    }
    
    // Find keywords
    while ((match = keywordPattern.exec(line)) !== null) {
      if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', text: match[0] });
      }
    }
    
    // Find type annotations (before functions to prioritize types)
    // Reset regex lastIndex for typePattern
    typePattern.lastIndex = 0;
    while ((match = typePattern.exec(line)) !== null) {
      // Extract just the type name (after colon and whitespace)
      // match[1] is the captured group containing the type name
      if (match[1]) {
        // Get the type name part (before any |, &, <, >, [, ])
        const typeName = match[1].split(/\s*[|&<>[\]]/)[0];
        // Calculate position: match.index is where ":" starts, add length of ": " to get type start
        const colonAndSpaceLength = match[0].length - match[1].length;
        const typeStart = match.index + colonAndSpaceLength;
        const typeEnd = typeStart + typeName.length;
        if (!matches.some(m => typeStart >= m.start && typeStart < m.end)) {
          matches.push({ start: typeStart, end: typeEnd, type: 'class', text: typeName });
        }
      }
    }
    
    // Find functions
    while ((match = functionPattern.exec(line)) !== null) {
      const funcStart = match.index;
      const funcEnd = funcStart + match[1].length;
      if (!matches.some(m => funcStart >= m.start && funcStart < m.end)) {
        matches.push({ start: funcStart, end: funcEnd, type: 'function', text: match[1] });
      }
    }
    
    // Find numbers
    while ((match = numberPattern.exec(line)) !== null) {
      if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'number', text: match[0] });
      }
    }
    
    // Find punctuation (braces, brackets, parentheses, etc.)
    while ((match = punctuationPattern.exec(line)) !== null) {
      if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'punctuation', text: match[0] });
      }
    }
    
    // Sort by position
    matches.sort((a, b) => a.start - b.start);
    
    // Build the highlighted line
    matches.forEach((m, idx) => {
      // Add text before this match
      if (m.start > currentPos) {
        tokens.push(
          <span key={`text-${idx}`} style={{ color: SYNTAX_COLORS.default }}>
            {line.substring(currentPos, m.start)}
          </span>
        );
      }
      
      // Add the highlighted token
      const color = SYNTAX_COLORS[m.type as keyof typeof SYNTAX_COLORS] || SYNTAX_COLORS.default;
      tokens.push(
        <span key={`token-${idx}`} style={{ color }}>
          {m.text}
        </span>
      );
      
      currentPos = m.end;
    });
    
    // Add remaining text
    if (currentPos < line.length) {
      tokens.push(
        <span key="text-end" style={{ color: SYNTAX_COLORS.default }}>
          {line.substring(currentPos)}
        </span>
      );
    }
    
    return (
      <div key={lineIdx} className="table-row">
        <div className="table-cell pr-4 text-right select-none w-12" style={{ color: '#858585' }}>
          {lineIdx + 1}
        </div>
        <div className="table-cell pl-4">
          {tokens.length > 0 ? tokens : <span style={{ color: SYNTAX_COLORS.default }}>{line || ' '}</span>}
        </div>
      </div>
    );
  });
}

export default function CodeBlock({ code, language, isStreaming = false }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lineCount = code.trim().split('\n').length;

  useEffect(() => {
    // Show scroll button if there are more than 15 lines
    setShowScrollButton(lineCount > 15);
  }, [lineCount]);

  const handleAutoScroll = () => {
    if (preRef.current) {
      preRef.current.scrollTo({
        top: preRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="my-4 w-full relative">
      <pre 
        ref={preRef}
        className="text-[13px] leading-[1.6] font-mono overflow-y-auto"
        style={{
          maxHeight: lineCount > 15 ? 'calc(15 * 1.6 * 13px + 8px)' : 'none',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(100, 100, 105, 0.5) transparent',
        }}
      >
        <code className="table w-full">
          {highlightCode(code.trim(), language)}
        </code>
      </pre>
      
      {showScrollButton && (
        <button
          onClick={handleAutoScroll}
          className="absolute bottom-2 left-1/2 transform -translate-x-1/2 p-1 transition-opacity duration-200 hover:opacity-70"
          style={{
            color: '#858585',
          }}
          aria-label="Scroll to bottom"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      
      {/* Custom scrollbar styling */}
      <style>{`
        pre::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        pre::-webkit-scrollbar-track {
          background: transparent;
        }
        pre::-webkit-scrollbar-thumb {
          background: rgba(100, 100, 105, 0.5);
          border-radius: 4px;
        }
        pre::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 100, 105, 0.7);
        }
      `}</style>
    </div>
  );
}

