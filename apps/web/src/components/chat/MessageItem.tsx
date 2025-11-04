import React, { useState, useEffect, useRef } from 'react';
import MessageContent from './MessageContent';
import SourcesDropdown from './SourcesDropdown';
import ThinkingIndicator, { type ThinkingStep } from './ThinkingIndicator';
import ArtifactMessageCard from './ArtifactMessageCard';
import FileAttachment from './FileAttachment';
import { useArtifactStore } from '@/store/artifactStore';
import { useChatStore } from '@/store/chatStore';
import { useUIStore } from '@/store/uiStore';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Array<{ title: string; host: string; url?: string; date?: string }>;
  attachments?: Array<{ id: string; filename: string; mimeType: string; size: number; url?: string }>;
};

type Props = {
  msg: Message;
  isActive?: boolean;
  isLastAssistant?: boolean;
  streaming?: boolean;
  frChip?: string;
  ttfbMs?: number;
  researchThinking?: boolean;
  thinkingSteps?: ThinkingStep[];
};

const MessageItemBase: React.FC<Props> = ({
  msg,
  isLastAssistant,
  frChip,
  ttfbMs,
  researchThinking,
  thinkingSteps = []
}) => {
  const isUser = msg.role === "user";
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const artifacts = useArtifactStore(s => s.artifacts);
  const inChatArtifactsEnabled = useUIStore(s => s.inChatArtifactsEnabled);
  
  // Detect artifact-bearing messages:
  // 1. Check message.meta?.artifactId (if meta exists)
  // 2. Check if message.role === "assistant" and has artifacts for this thread
  const messageMeta = (msg as any).meta as { artifactId?: string } | undefined;
  const artifactId = messageMeta?.artifactId;
  
  // Get artifacts for this message's thread (show after assistant messages)
  // If message has artifactId in meta, use that; otherwise show all artifacts for thread
  const messageArtifacts = !isUser && currentThreadId && inChatArtifactsEnabled
    ? artifactId
      ? artifacts.filter(a => a.id === artifactId)
      : artifacts.filter(a => a.threadId === currentThreadId)
    : [];
  
  const showFRChip = isLastAssistant && frChip && ttfbMs !== undefined && ttfbMs > 400;
  const [copied, setCopied] = useState(false);
  const messageRef = useRef<HTMLElement>(null);
  const [coordinates, setCoordinates] = useState<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    viewportTop: number;
    viewportLeft: number;
  } | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleThumbsUp = () => {
    // TODO: Implement thumbs up feedback
  };

  const handleThumbsDown = () => {
    // TODO: Implement thumbs down feedback
  };

  // Fade-in thinking animation - each line fades in slowly then pauses
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [selectedThinkingLines, setSelectedThinkingLines] = useState<string[]>([]);

  // Pool of 15 different thinking process lines
  const thinkingLinesPool = [
    "Analyzing request context and requirements",
    "Searching knowledge base for relevant information",
    "Formulating comprehensive response structure",
    "Generating response",
    "Evaluating multiple solution approaches",
    "Processing semantic understanding",
    "Cross-referencing available data sources",
    "Synthesizing insights from various perspectives",
    "Building contextual understanding",
    "Refining response precision",
    "Identifying key patterns and connections",
    "Weighing different interpretations",
    "Integrating relevant context",
    "Optimizing response clarity",
    "Verifying information accuracy"
  ];

  // Track coordinates for user messages
  useEffect(() => {
    if (!isUser || !messageRef.current) return;

    const updateCoordinates = () => {
      if (!messageRef.current) return;
      
      const rect = messageRef.current.getBoundingClientRect();
      setCoordinates({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY,
        width: rect.width,
        height: rect.height,
        viewportTop: rect.top,
        viewportLeft: rect.left,
      });
    };

    // Initial update
    updateCoordinates();

    // Update on scroll and resize
    window.addEventListener('scroll', updateCoordinates, true);
    window.addEventListener('resize', updateCoordinates);

    // Also listen to scrollable container scroll
    const scrollContainer = messageRef.current.closest('.overflow-y-auto, .chat-container');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', updateCoordinates, true);
    }

    // Use ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver(updateCoordinates);
    resizeObserver.observe(messageRef.current);

    return () => {
      window.removeEventListener('scroll', updateCoordinates, true);
      window.removeEventListener('resize', updateCoordinates);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', updateCoordinates, true);
      }
      resizeObserver.disconnect();
    };
  }, [isUser, msg.id]);

  useEffect(() => {
    if (isLastAssistant && !msg.content && thinkingSteps.length === 0) {
      // Randomly select 4 lines from the pool each time
      const shuffled = [...thinkingLinesPool].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 4);
      setSelectedThinkingLines(selected);
      setVisibleLines([]);

      let currentLineIndex = 0;

      const showNextLine = () => {
        if (currentLineIndex >= selected.length) return;

        // Add current line to visible lines (will fade in via CSS)
        setVisibleLines(prev => [...prev, currentLineIndex]);
        currentLineIndex++;

        if (currentLineIndex < selected.length) {
          // Pause before showing next line
          // After first line: pause (400-600ms)
          // After second line: pause (500-700ms)
          // After third+ line: pause (300-500ms)
          let pauseDelay: number;
          if (currentLineIndex === 1) {
            // After first line
            pauseDelay = Math.random() * 200 + 400;
          } else if (currentLineIndex === 2) {
            // After second line
            pauseDelay = Math.random() * 200 + 500;
          } else {
            // After third+ line
            pauseDelay = Math.random() * 200 + 300;
          }
          return setTimeout(showNextLine, pauseDelay);
        }
      };

      const timer = setTimeout(showNextLine, 100); // Small initial delay
      return () => {
        if (timer) clearTimeout(timer);
        setVisibleLines([]);
        setSelectedThinkingLines([]);
      };
    } else {
      setVisibleLines([]);
      setSelectedThinkingLines([]);
    }
  }, [isLastAssistant, msg.content, thinkingSteps.length]);

  return (
    <article 
      ref={messageRef}
      role="article" 
      aria-label={`${msg.role} message`} 
      data-id={msg.id} 
      className="group relative flex" 
      style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}
    >
      {/* Message content */}
      <div className={isUser ? "max-w-[85%]" : "w-full"} style={{ order: isUser ? 1 : 0 }}>
        {isUser ? (
          <>
            <div className="bg-gray-200/20 rounded-lg px-3 py-0.5 border border-gray-300/20 inline-block">
              <div className="[&_.message-content-user]:mb-0 [&_.message-content-user_p]:mb-0 [&_.message-content-user]:leading-snug [&_.message-content-user]:pb-0">
                <MessageContent content={msg.content} isUser={isUser} />
              </div>
            </div>
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {msg.attachments.map((attachment) => (
                  <FileAttachment key={attachment.id} attachment={attachment} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Show thinking steps before message content */}
            {isLastAssistant && thinkingSteps.length > 0 && (
              <ThinkingIndicator steps={thinkingSteps} streaming={true} />
            )}

            <MessageContent content={msg.content} isUser={isUser} />
            {msg.sources && msg.sources.length > 0 && (
              <SourcesDropdown sources={msg.sources} />
            )}
          </>
        )}

        {isLastAssistant && !msg.content && visibleLines.length > 0 && selectedThinkingLines.length > 0 && (
          <div className="thinking-stream text-[13px] leading-relaxed font-mono opacity-70 text-white/80 mt-2">
            {selectedThinkingLines.map((line, index) => (
              <div
                key={index}
                className={`transition-opacity duration-[2000ms] ${
                  visibleLines.includes(index) ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  transitionDelay: visibleLines.includes(index) ? '0ms' : '0ms'
                }}
              >
                {line}
              </div>
            ))}
          </div>
        )}

        {showFRChip && (
          <div className="mt-2">
            <div className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white/80">
              {frChip}
            </div>
          </div>
        )}

        {researchThinking && isLastAssistant && (
          <div className="mt-3 text-sm text-white/60 italic">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse" />
              <span>Researching current information...</span>
            </div>
          </div>
        )}

        {/* Action icons for assistant messages - bottom right */}
        {!isUser && msg.content && (
          <div className="flex items-center justify-end gap-2 mt-3 message-actions">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              aria-label={copied ? "Copied" : "Copy message"}
              title={copied ? "Copied" : "Copy"}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>
            <button
              onClick={handleThumbsUp}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Thumbs up"
              title="Thumbs up"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                <path d="M7 10v12" />
                <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
              </svg>
            </button>
            <button
              onClick={handleThumbsDown}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Thumbs down"
              title="Thumbs down"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                <path d="M17 14V2" />
                <path d="M9 18.12 10 14H4.17a2 2 0 0 0-1.92 2.56l2.33 8A2 2 0 0 0 6.5 22H20a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2.76a2 2 0 0 1-1.79-1.11L12 2h0a3.13 3.13 0 0 0-3 3.88Z" />
              </svg>
            </button>
          </div>
        )}

        {/* Inline Artifacts - Show after assistant messages using ArtifactMessageCard */}
        {!isUser && messageArtifacts.length > 0 && inChatArtifactsEnabled && (
          <div className="mt-4 space-y-4">
            {messageArtifacts.map((artifact) => (
              <ArtifactMessageCard key={artifact.id} artifact={artifact} isExpanded={true} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
};

// Custom comparison function for React.memo
const areEqual = (prevProps: Props, nextProps: Props) => {
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.content === nextProps.msg.content &&
    prevProps.msg.sources === nextProps.msg.sources &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isLastAssistant === nextProps.isLastAssistant &&
    prevProps.streaming === nextProps.streaming &&
    prevProps.frChip === nextProps.frChip &&
    prevProps.ttfbMs === nextProps.ttfbMs &&
    prevProps.researchThinking === nextProps.researchThinking &&
    prevProps.thinkingSteps?.length === nextProps.thinkingSteps?.length &&
    prevProps.thinkingSteps?.[prevProps.thinkingSteps.length - 1]?.content ===
      nextProps.thinkingSteps?.[nextProps.thinkingSteps.length - 1]?.content
  );
};

const MessageItem = React.memo(MessageItemBase, areEqual);

export default MessageItem;

