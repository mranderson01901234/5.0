import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { X, Trash2, ChevronRight, MessageSquare } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/lib/utils';
import { deleteConversation as deleteConversationApi } from '@/services/gateway';
import { toastPromise } from '@/utils/toastPromise';

interface ConversationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ConversationsDialog: React.FC<ConversationsDialogProps> = ({ open, onOpenChange }) => {
  const { getToken } = useAuth();
  const conversations = useChatStore((s) => s.conversations);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const switchConversation = useChatStore((s) => s.switchConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // Handle click outside to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-conversations-modal]');
      if (modal && !modal.contains(target)) {
        onOpenChange(false);
      }
    };

    // Small delay to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onOpenChange]);

  const handleConversationClick = (conversationId: string) => {
    switchConversation(conversationId);
    onOpenChange(false);
  };

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (deleting.has(conversationId)) return;

    setDeleting((prev) => new Set(prev).add(conversationId));
    try {
      const token = await getToken();
      await toastPromise(
        async () => {
          await deleteConversationApi(conversationId, token || undefined);
          deleteConversation(conversationId);
        },
        {
          loading: 'Deleting conversation...',
          success: 'Conversation deleted',
          error: 'Failed to delete conversation',
        }
      );
    } catch (error) {
      console.error('[ConversationsDialog] Failed to delete conversation:', error);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  };

  if (!open) return null;

  // Sort conversations by most recent
  const sortedConversations = [...conversations].sort((a, b) => {
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  return (
    <>
      {/* Modal */}
      <div
        data-conversations-modal
        className="fixed left-20 top-0 bottom-0 z-[9999] w-[420px] bg-[#0a0a0a] border-r border-white/[0.08] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-white/90 rounded-full" />
            <h2 className="text-base font-medium text-white/90 tracking-tight">Conversations</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-white/30" />
              </div>
              <p className="text-sm text-white/40">No conversations yet</p>
              <p className="text-xs text-white/25 mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            <div className="pt-4">
              {/* All Conversations Section */}
              <div className="mb-6">
                {/* Section Header */}
                <div className="px-6 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-white/50" />
                  <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    All Conversations
                  </h3>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-xs text-white/30 tabular-nums">
                    {conversations.length}
                  </span>
                </div>

                {/* Conversation Cards */}
                <div className="space-y-1 px-3 pb-4">
                  {sortedConversations.map((conversation) => {
                    const isDeleting = deleting.has(conversation.id);
                    const isCurrent = conversation.id === currentThreadId;

                    return (
                      <div
                        key={conversation.id}
                        className={cn(
                          "group relative rounded-lg border border-white/[0.06]",
                          "bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]",
                          "transition-all duration-150",
                          isCurrent && "border-white/[0.12] bg-white/[0.04]"
                        )}
                      >
                        {/* Main Content */}
                        <button
                          onClick={() => handleConversationClick(conversation.id)}
                          className="w-full px-4 py-3 text-left focus:outline-none focus:ring-1 focus:ring-white/20 rounded-lg"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Conversation Title */}
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm text-white/80 font-medium truncate">
                                  {conversation.title || 'Untitled'}
                                </h4>
                                <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
                              </div>
                              
                              {/* Message Count + Date Row */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-white/40 tabular-nums">
                                  {conversation.messages?.length || 0} messages
                                </span>
                                <span className="text-xs text-white/25 tabular-nums flex-shrink-0 ml-2">
                                  {conversation.updatedAt 
                                    ? new Date(conversation.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : 'Today'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Actions Bar */}
                        <div className="px-4 pb-3 flex items-center gap-1.5 border-t border-white/[0.04] pt-2">
                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDelete(e, conversation.id)}
                            disabled={isDeleting}
                            className={cn(
                              "flex-1 px-2 py-1.5 text-[11px] font-medium rounded border",
                              "transition-all duration-150",
                              "border-white/[0.08] bg-white/[0.02] hover:bg-red-500/10 hover:border-red-500/30",
                              "text-white/40 hover:text-red-400/80",
                              "disabled:opacity-40 disabled:cursor-not-allowed",
                              "flex items-center justify-center gap-1"
                            )}
                            title="Delete conversation"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="uppercase tracking-wide">Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/30">Total conversations</span>
            <span className="text-white/50 font-medium tabular-nums">{conversations.length}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConversationsDialog;

