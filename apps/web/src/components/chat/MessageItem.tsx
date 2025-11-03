import React from 'react';
import MessageContent from './MessageContent';
import SourcesDropdown from './SourcesDropdown';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Array<{ title: string; host: string; url?: string; date?: string }>;
};

type Props = { 
  msg: Message; 
  isActive?: boolean;
  isLastAssistant?: boolean;
  streaming?: boolean;
  frChip?: string;
  ttfbMs?: number;
  researchThinking?: boolean;
};

const MessageItemBase: React.FC<Props> = ({ 
  msg, 
  isLastAssistant,
  frChip,
  ttfbMs,
  researchThinking
}) => {
  const isUser = msg.role === "user";
  const showFRChip = isLastAssistant && frChip && ttfbMs !== undefined && ttfbMs > 400;

  return (
    <article role="article" aria-label={`${msg.role} message`} data-id={msg.id} className="group relative flex" style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {/* Message content */}
      <div className="max-w-[85%]" style={{ order: isUser ? 1 : 0 }}>
        {isUser ? (
          <MessageContent content={msg.content} isUser={isUser} />
        ) : (
          <>
            <MessageContent content={msg.content} isUser={isUser} />
            {msg.sources && msg.sources.length > 0 && (
              <SourcesDropdown sources={msg.sources} />
            )}
          </>
        )}

        {isLastAssistant && !msg.content && (
          <div className="flex items-center gap-2 text-white/50 mt-2" aria-hidden="true">
            <div className="h-2 w-2 rounded-full bg-white/50 animate-pulse" />
            <div className="h-2 w-2 rounded-full bg-white/50 animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="h-2 w-2 rounded-full bg-white/50 animate-pulse" style={{ animationDelay: '0.4s' }} />
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
    prevProps.researchThinking === nextProps.researchThinking
  );
};

const MessageItem = React.memo(MessageItemBase, areEqual);

export default MessageItem;

