import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "../../lib/utils";
import { useChatStream } from "../../hooks/useChatStream";
import { useChatStore } from "../../store/chatStore";
import { log } from "../../utils/logger";

const CenterComposerBase: React.FC = () => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { send } = useChatStream();
  const activeStreams = useChatStore(s => s.activeStreams);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Preserve Unicode and special characters on paste
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    setValue(newValue);
    
    // Set cursor position after pasted text
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + text.length;
    }, 0);
  }, [value]);

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return;
    if (activeStreams >= 2) {
      log.warn("Stream limit reached");
      return;
    }
    send(value);
    setValue("");
  }, [value, activeStreams, send]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const isDisabled = useMemo(() => activeStreams >= 2 || !value.trim(), [activeStreams, value]);

  return (
    <form
      className="w-full"
      aria-label="Message composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !isDisabled) {
          handleSubmit();
        }
      }}
    >
      <div className={cn(
        "relative rounded-2xl glass-heavy shadow-2xl shadow-black/50",
        "border border-white/15",
        "transition-all duration-200"
      )}>
        <div className="relative">
          <label htmlFor="composer-input" className="sr-only">Message</label>
          <textarea
            id="composer-input"
            ref={textareaRef}
            placeholder="Message..."
            rows={1}
            value={value}
            onChange={handleChange}
            onPaste={handlePaste}
            className={cn(
              "w-full resize-none bg-transparent px-5 py-4 pr-14",
              "text-[15px] leading-relaxed text-white/95 placeholder:text-white/40",
              "focus:outline-none",
              "max-h-[200px] overflow-y-auto scrollbar-hide",
              "math-input"
            )}
            style={{ 
              minHeight: '56px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word'
            }}
            onKeyDown={handleKeyDown}
            aria-label="Type your message"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={isDisabled}
            className={cn(
              "absolute bottom-3 right-3",
              "flex h-9 w-9 items-center justify-center rounded-lg",
              "transition-all duration-200",
              isDisabled
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20 hover:border-white/30"
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 px-2 text-xs text-white/40 text-center">
        Press Enter to send, Shift+Enter for new line
      </div>
    </form>
  );
};

const CenterComposer = React.memo(CenterComposerBase);

export default CenterComposer;

