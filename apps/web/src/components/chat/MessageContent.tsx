import React from 'react';
import { renderSafeMessage } from '../../utils/renderSafeMessage';
import { cn } from '../../lib/utils';
import CodeBlock from './CodeBlock';

// Detect if a line contains an algebraic equation
const isMathEquation = (line: string): boolean => {
  const trimmed = line.trim();
  // Check for mathematical patterns: Greek letters, operators, variables, equals signs
  const mathPatterns = [
    /[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/, // Greek letters
    /[=+\-*/^()]\s*[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/, // Operators with Greek letters
    /[a-zA-Z]\s*[=+\-*/^]\s*[a-zA-Z0-9α-ωΑ-Ω]/, // Variable assignments
    /[0-9]\s*[+\-*/^=]\s*[0-9α-ωΑ-Ωa-zA-Z]/, // Numbers with operators
    /^[a-zA-Zα-ωΑ-Ω]\s*[=]\s*/, // Variable = something
    /\)\s*=\s*[0-9α-ωΑ-Ωa-zA-Z]/, // ) = value (like in the image)
    /[a-zA-Z][_₀-₉⁰-⁹]+/, // Variables with subscripts/superscripts (Unicode subscripts ₀-₉, superscripts ⁰-⁹)
    /[a-zA-Z]\s*\(\s*[a-zA-Z][_₀-₉⁰-⁹]*\s*\)/, // Functions with subscripted parameters like c_i(q_i)
    /[a-zA-Z][_₀-₉⁰-⁹]*\s*\*/, // Variables with asterisk (optimality notation q_i^*)
    /\b[Vvc]\s*\(.*?\)/, // Functions V(...), c(...)
    /∑|∫|∏|∂|∇|√/, // Mathematical operators (sum, integral, product, partial derivative, nabla, square root)
  ];
  
  // Also check for math context keywords nearby (in the same or adjacent lines)
  const mathKeywords = /\b(solve|solving|equation|formula|calculate|compute|derivative|integral|limit|algebraic|math|mechanism|utility|cost|value|optimal|first-best)\b/i;
  
  // If it matches patterns or contains math keywords, treat as equation
  const hasMathPattern = mathPatterns.some(pattern => pattern.test(trimmed));
  const hasMathKeyword = mathKeywords.test(trimmed);
  
  // Also check if line is short and contains operators (likely an equation fragment)
  const isShortWithOperators = trimmed.length < 100 && /[=+\-*/^()]/.test(trimmed);
  
  return hasMathPattern || (hasMathKeyword && isShortWithOperators);
};

// Detect inline mathematical expressions within text (e.g., β=100, q_i^*)
const detectInlineMath = (text: string): Array<{ start: number; end: number; isMath: boolean }> => {
  const segments: Array<{ start: number; end: number; isMath: boolean }> = [];
  let currentPos = 0;

  // Pattern to detect mathematical expressions:
  // - Greek letters followed by = or operators (β=100, α=(...))
  // - Variables with subscripts/superscripts (q_i^*, q_i, etc.)
  // - Unicode subscripts (₀-₉) and superscripts (⁰-⁹)
  // - Number-variable combinations with operators
  const mathRegex = /(?:[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]\s*[=+\-*/^()])|(?:[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]\s*=\s*[0-9])|(?:[a-zA-Zα-ωΑ-Ω]\s*[=+\-*/^]\s*[0-9α-ωΑ-Ωa-zA-Z])|(?:[0-9]\s*[=+\-*/^]\s*[0-9α-ωΑ-Ωa-zA-Z])|(?:[a-zA-Z][_₀-₉⁰-⁹]+)|(?:[a-zA-Z]_[a-zA-Z0-9]+\^*)|(?:[a-zA-Z]\^\*)|(?:∑|∫|∏|∂|∇|√)/g;
  
  let match;
  while ((match = mathRegex.exec(text)) !== null) {
    // Add non-math segment before match
    if (match.index > currentPos) {
      segments.push({ start: currentPos, end: match.index, isMath: false });
    }
    
    // Find the full extent of the math expression (include following characters until whitespace or punctuation)
    let endPos = match.index + match[0].length;
    while (endPos < text.length && /[a-zA-Z0-9α-ωΑ-Ω_^*+\-*/=(),₀-₉⁰-⁹]/.test(text[endPos])) {
      endPos++;
    }
    
    segments.push({ start: match.index, end: endPos, isMath: true });
    currentPos = endPos;
  }
  
  // Add remaining non-math segment
  if (currentPos < text.length) {
    segments.push({ start: currentPos, end: text.length, isMath: false });
  }
  
  return segments.length > 0 ? segments : [{ start: 0, end: text.length, isMath: false }];
};

type Props = { content: string; isUser?: boolean };

const MessageContentBase: React.FC<Props> = ({ content, isUser }) => {
  // Memoize the rendered content to avoid re-rendering on every parent update
  const renderedContent = React.useMemo(() => {
    // Simple markdown-like rendering
    const renderContent = (rawText: string) => {
      // Remove all ** markdown bold markers from the entire content
      const text = rawText.replace(/\*\*/g, '');
      // REMOVED: Don't merge lines automatically - preserve user's original formatting
      // Users pasting math problems want their newlines preserved
      const lines = text.split('\n');
      const elements: JSX.Element[] = [];
      let i = 0;

      // Helper function to detect code blocks
      const detectCodeBlock = (startIndex: number): { endIndex: number; language: string; code: string } | null => {
        const line = lines[startIndex];
        const codeBlockMatch = line.match(/^```(\w+)?$/);
        
        if (!codeBlockMatch) return null;
        
        const language = codeBlockMatch[1] || '';
        const codeLines: string[] = [];
        let endIndex = startIndex + 1;
        
        // Find the closing ```
        while (endIndex < lines.length) {
          if (lines[endIndex].trim() === '```') {
            return { endIndex, language, code: codeLines.join('\n') };
          }
          codeLines.push(lines[endIndex]);
          endIndex++;
        }
        
        // No closing found, treat as regular content
        return null;
      };

      // Function to render text with linkification
      const renderWithKeywords = (text: string): React.ReactNode => {
        // Apply linkification and sanitization to text segments
        const safeHtml = renderSafeMessage(text);
        // Use dangerouslySetInnerHTML for safe HTML rendering (already sanitized)
        return <span dangerouslySetInnerHTML={{ __html: safeHtml }} />;
      };

      while (i < lines.length) {
        const line = lines[i];

        // Code blocks - check FIRST before any other formatting
        const codeBlock = detectCodeBlock(i);
        if (codeBlock) {
          elements.push(
            <CodeBlock 
              key={`code-${i}`} 
              code={codeBlock.code} 
              language={codeBlock.language}
            />
          );
          i = codeBlock.endIndex + 1; // Skip past the closing ```
          continue;
        }

        // Mathematical equations - check SECOND before any other formatting
        if (isMathEquation(line)) {
          // Preserve the exact line content, including leading/trailing whitespace for equations
          const equationText = line; // Keep original to preserve spacing
          elements.push(
            <div 
              key={`math-${i}`}
              data-math="true"
              className="math-equation"
            >
              {equationText}
            </div>
          );
          i++;
          continue; // Skip to next line
        }

        // Headers
        if (line.startsWith('### ')) {
          const cleanLine = line.slice(4).replace(/\*\*/g, '');
          elements.push(<h3 key={`h3-${i}`}>{renderWithKeywords(cleanLine)}</h3>);
        } else if (line.startsWith('## ')) {
          const cleanLine = line.slice(3).replace(/\*\*/g, '');
          elements.push(<h2 key={`h2-${i}`}>{renderWithKeywords(cleanLine)}</h2>);
        } else if (line.startsWith('# ')) {
          const cleanLine = line.slice(2).replace(/\*\*/g, '');
          elements.push(<h1 key={`h1-${i}`}>{renderWithKeywords(cleanLine)}</h1>);
        }
        // Horizontal rule (separator)
        else if (line.trim() === '---') {
          elements.push(<hr key={`hr-${i}`} className="my-6 border-white/15" />);
        }
        // Bullet points
        else if (line.startsWith('- ') || line.startsWith('* ')) {
          const listItems: string[] = [];
          const listStartIdx = i;
          while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
            listItems.push(lines[i].slice(2));
            i++;
          }
          elements.push(
            <ul key={`list-${listStartIdx}`} className="list-disc list-outside ml-5 my-3 space-y-1">
              {listItems.map((item, idx) => (
                <li key={`list-${listStartIdx}-item-${idx}`}>
                  {renderWithKeywords(item.replace(/\*\*/g, ''))}
                </li>
              ))}
            </ul>
          );
          continue;
        }
        // Numbered lists
        else if (/^\d+\.\s/.test(line)) {
          const listItems: string[] = [];
          const listStartIdx = i;
          while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
            listItems.push(lines[i].replace(/^\d+\.\s/, ''));
            i++;
          }
          elements.push(
            <ol 
              key={`numlist-${listStartIdx}`} 
              className="list-decimal list-outside ml-5 my-3 space-y-1"
              start={1}
              style={{ listStyleType: 'decimal', counterReset: 'none' }}
            >
              {listItems.map((item, idx) => (
                <li key={`numlist-${listStartIdx}-item-${idx}`}>
                  {renderWithKeywords(item.replace(/\*\*/g, ''))}
                </li>
              ))}
            </ol>
          );
          continue;
        }
        // Regular paragraph (remove ** markdown)
        else if (line.includes('**')) {
          // Remove all ** markers but keep the text
          const cleanLine = line.replace(/\*\*/g, '');
          // Check for inline math expressions
          const mathSegments = detectInlineMath(cleanLine);
          if (mathSegments.some(s => s.isMath)) {
            const parts = mathSegments.map((seg, segIdx) => {
              const segmentText = cleanLine.substring(seg.start, seg.end);
              if (seg.isMath) {
                return (
                  <span key={`math-seg-${segIdx}`} className="math-inline" style={{ whiteSpace: 'pre', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                    {segmentText}
                  </span>
                );
              }
              return renderWithKeywords(segmentText);
            });
            elements.push(<p key={`bold-${i}`} className="mb-3">{parts}</p>);
          } else {
            elements.push(<p key={`bold-${i}`} className="mb-3">{renderWithKeywords(cleanLine)}</p>);
          }
        }
        // Regular paragraph
        else if (line.trim()) {
          // Check for domains in parentheses (from ingestion context) - make them clickable
          // Pattern: (domain.com) or (subdomain.domain.com)
          // Escape parentheses and use simpler domain matching
          const domainPattern = /\(([a-z0-9][a-z0-9.-]*[a-z0-9]+\.[a-z]{2,})\)/gi;
          const hasDomain = domainPattern.test(line);
          
          // Check for inline math expressions
          const mathSegments = detectInlineMath(line);
          if (mathSegments.some(s => s.isMath)) {
            const parts = mathSegments.map((seg, segIdx) => {
              const segmentText = line.substring(seg.start, seg.end);
              if (seg.isMath) {
                return (
                  <span key={`math-seg-${segIdx}`} className="math-inline" style={{ whiteSpace: 'pre', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                    {segmentText}
                  </span>
                );
              }
              return renderWithKeywords(segmentText);
            });
            elements.push(<p key={`p-${i}`} className="mb-3">{parts}</p>);
          } else if (hasDomain) {
            // Render domains as clickable links
            const parts: (string | JSX.Element)[] = [];
            let lastIndex = 0;
            domainPattern.lastIndex = 0; // Reset regex
            let match;
            
            while ((match = domainPattern.exec(line)) !== null) {
              // Add text before match
              if (match.index > lastIndex) {
                parts.push(line.substring(lastIndex, match.index));
              }
              
              // Add clickable domain - use https:// prefix (will work for most sites)
              const domain = match[1];
              parts.push(
                <a
                  key={`domain-${match.index}`}
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  ({domain})
                </a>
              );
              lastIndex = match.index + match[0].length;
            }
            
            // Add remaining text
            if (lastIndex < line.length) {
              parts.push(line.substring(lastIndex));
            }
            
            // Render with keywords highlighting on text parts
            const renderedParts = parts.map((part, partIdx) => {
              if (typeof part === 'string') {
                return <span key={`text-${partIdx}`}>{renderWithKeywords(part)}</span>;
              }
              return part;
            });
            
            elements.push(<p key={`p-${i}`} className="mb-3">{renderedParts}</p>);
          } else {
            elements.push(<p key={`p-${i}`} className="mb-3">{renderWithKeywords(line)}</p>);
          }
        }
        // Empty line
        else {
          elements.push(<div key={`empty-${i}`} className="h-2" />);
        }

        i++;
      }

      return elements;
    };

    return renderContent(content);
  }, [content]);

  return (
    <div className={cn("message-content", isUser && "message-content-user")}>
      {renderedContent}
    </div>
  );
};

const MessageContent = React.memo(MessageContentBase);

export default MessageContent;

