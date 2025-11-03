import { useState } from "react";
import { cn } from "../../lib/utils";
import { log } from "../../utils/logger";

interface CodeBlockProps {
  code: string;
  language?: string;
}

// Language-specific color schemes - reds, yellows, greens, whites
const SYNTAX_COLORS = {
  keyword: '#fbbf24',      // yellow-400 - keywords (yellow)
  function: '#ef4444',     // red-500 - functions (red)
  string: '#10b981',       // emerald-500 - strings (green)
  comment: '#6b7280',      // gray-500 - comments (muted grey)
  number: '#f87171',       // red-400 - numbers (red)
  default: '#f3f4f6',      // gray-100 - default text (white/light)
  operator: '#fbbf24',     // yellow-400 - operators (yellow)
  class: '#22c55e',        // green-500 - classes (green)
};

// Simplified syntax highlighting
function highlightCode(code: string, language?: string): JSX.Element[] {
  const lines = code.split('\n');
  
  return lines.map((line, lineIdx) => {
    if (!language) {
      return (
        <div key={lineIdx} className="table-row">
          <div className="table-cell pr-4 text-right select-none w-12" style={{ color: '#6b7280' }}>
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
    
    // Collect all matches with their types
    const matches: Array<{ start: number; end: number; type: string; text: string }> = [];
    
    // Find comments first (highest priority)
    let match;
    while ((match = commentPattern.exec(line)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, type: 'comment', text: match[0] });
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
        <div className="table-cell pr-4 text-right select-none w-12" style={{ color: '#6b7280' }}>
          {lineIdx + 1}
        </div>
        <div className="table-cell pl-4">
          {tokens.length > 0 ? tokens : <span style={{ color: SYNTAX_COLORS.default }}>{line || ' '}</span>}
        </div>
      </div>
    );
  });
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      log.error('Failed to copy:', err);
    }
  };

  return (
    <div 
      className="relative my-4 w-full overflow-hidden rounded-lg"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocus={() => setIsHovering(true)}
      onBlur={() => setIsHovering(false)}
      style={{
        background: 'rgba(55, 55, 60, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(75, 75, 80, 0.5)',
      }}
      role="group"
      aria-label="Code block"
    >
      {/* Code content with line numbers */}
      <div 
        className="overflow-x-auto overflow-y-auto max-h-[600px] px-3 py-3 pt-2"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(100, 100, 105, 0.5) transparent',
        }}
      >
        {/* Inline controls - language badge and copy button */}
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-700/30">
          {/* Language badge - small and subtle */}
          {language && (
            <div 
              className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
              style={{
                background: 'rgba(100, 100, 105, 0.3)',
                color: 'rgba(156, 163, 175, 1)',
                border: '1px solid rgba(100, 100, 105, 0.4)',
              }}
            >
              {language}
            </div>
          )}
          {!language && <div />}
          
          {/* Copy button - subtle grey */}
          <button
            onClick={handleCopy}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-all duration-200",
              "flex items-center gap-1.5",
              copied 
                ? "bg-gray-600/30 text-gray-300 border border-gray-500/40" 
                : isHovering 
                  ? "bg-gray-600/40 text-gray-300 border border-gray-500/50"
                  : "bg-gray-700/20 text-gray-400 border border-gray-600/30 hover:bg-gray-600/30"
            )}
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <pre className="text-[13px] leading-[1.6] font-mono">
          <code className="table w-full">
            {highlightCode(code.trim(), language)}
          </code>
        </pre>
      </div>

      {/* Custom scrollbar styling */}
      <style>{`
        .overflow-x-auto::-webkit-scrollbar,
        .overflow-y-auto::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .overflow-x-auto::-webkit-scrollbar-track,
        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }
        .overflow-x-auto::-webkit-scrollbar-thumb,
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: rgba(100, 100, 105, 0.5);
          border-radius: 4px;
        }
        .overflow-x-auto::-webkit-scrollbar-thumb:hover,
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 100, 105, 0.7);
        }
      `}</style>
    </div>
  );
}

