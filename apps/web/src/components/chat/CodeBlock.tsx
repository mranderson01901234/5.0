import { useState, useRef, useEffect, useMemo } from "react";
import React from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
  isStreaming?: boolean;
}

// Custom dark theme matching the original color scheme
const customStyle = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: 0,
    fontSize: '13px',
    lineHeight: '1.6',
    fontFamily: 'monospace',
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '13px',
    lineHeight: '1.6',
    fontFamily: 'monospace',
  },
};

function CodeBlock({ code, language, isStreaming = false }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Memoize line count calculation
  const lineCount = useMemo(() => code.trim().split('\n').length, [code]);

  useEffect(() => {
    // Show scroll button if there are more than 15 lines
    setShowScrollButton(lineCount > 15);
  }, [lineCount]);

  const handleAutoScroll = useMemo(() => () => {
    if (preRef.current) {
      preRef.current.scrollTo({
        top: preRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  // Memoize trimmed code to avoid unnecessary re-renders
  const trimmedCode = useMemo(() => code.trim(), [code]);

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
        <SyntaxHighlighter
          language={language || 'text'}
          style={customStyle}
          showLineNumbers={true}
          lineNumberStyle={{
            color: '#858585',
            paddingRight: '1rem',
            textAlign: 'right',
            userSelect: 'none',
            minWidth: '3rem',
          }}
          customStyle={{
            margin: 0,
            padding: 0,
            background: 'transparent',
          }}
          codeTagProps={{
            style: {
              fontFamily: 'monospace',
              fontSize: '13px',
            }
          }}
        >
          {trimmedCode}
        </SyntaxHighlighter>
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

// Memoize component to prevent unnecessary re-renders
export default React.memo(CodeBlock);
