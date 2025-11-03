import React, { useEffect } from 'react';
import { Plus, Settings, Trash2, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { deleteConversation as deleteConversationApi } from '@/services/gateway';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsClick: () => void;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({
  isOpen,
  onClose,
  onSettingsClick,
}) => {
  const conversations = useChatStore((s) => s.conversations);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const newConversation = useChatStore((s) => s.newConversation);
  const switchConversation = useChatStore((s) => s.switchConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const { getToken } = useAuth();

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNewChat = () => {
    newConversation();
    onClose();
  };

  const handleSwitchConv = (id: string) => {
    switchConversation(id);
    onClose();
  };

  const handleSettings = () => {
    onSettingsClick();
    onClose();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const toastId = toast.loading('Deleting conversation…');
    try {
      const conv = conversations.find((c) => c.id === id);
      const isLocal = conv?.isLocal === true;

      if (!isLocal) {
        const token = await getToken();
        await deleteConversationApi(id, token || undefined);
      }

      deleteConversation(id);

      toast.dismiss(toastId);
      toast.success('Conversation deleted');
    } catch (error) {
      toast.dismiss(toastId);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete';
      toast.error(errorMessage);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer - slides from bottom */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 bg-[#0f0f0f] rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out',
          'max-h-[85vh] flex flex-col',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Handle bar */}
        <div className="flex items-center justify-center py-3 border-b border-white/10">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <span className="text-xs font-bold text-white/90">O</span>
            </div>
            <span className="text-sm font-medium tracking-wide text-white/95">
              operastudio
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-4 py-3 border-b border-white/10">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/90"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">New Chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <div className="text-xs font-medium text-white/50 px-3 py-2">
            Conversations
          </div>
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'relative flex items-center rounded-xl transition-all group',
                  currentThreadId === conv.id
                    ? 'bg-white/10'
                    : 'hover:bg-white/5'
                )}
              >
                <button
                  onClick={() => handleSwitchConv(conv.id)}
                  className={cn(
                    'flex items-center w-full py-3 px-3 gap-3 pr-12',
                    currentThreadId === conv.id
                      ? 'text-white/95'
                      : 'text-white/70'
                  )}
                >
                  <span className="text-sm truncate">{conv.title}</span>
                </button>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="absolute right-3 p-2 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-lg transition-all"
                  aria-label={`Delete ${conv.title}`}
                >
                  <Trash2 className="h-4 w-4 text-white/50" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="px-4 py-3 border-t border-white/10 bg-[#0f0f0f]/95 backdrop-blur-sm">
          <button
            onClick={handleSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-white/70"
          >
            <Settings className="h-5 w-5" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      </div>
    </>
  );
};
