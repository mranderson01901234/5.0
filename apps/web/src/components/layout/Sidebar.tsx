import React, { useState, useRef, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Settings, Plus, Trash2, BarChart3 } from "../../icons";
import { useChatStore } from "../../store/chatStore";
import { cn } from "../../lib/utils";
import SettingsDialog from "../settings/SettingsDialog";
import { deleteConversation as deleteConversationApi } from "../../services/gateway";
import { toastPromise } from "../../utils/toastPromise";
import { notify } from "../../utils/toast";
import { useShortcuts } from "../../hooks/useShortcuts";

type ConversationItem = { id: string; title: string };

const SidebarBase: React.FC = () => {
  const [expanded,setExpanded]=useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const conversations = useChatStore(s => s.conversations);
  // Memoize conversations list to provide stable reference
  const items = useMemo<ConversationItem[]>(
    () => conversations.map(c => ({ id: c.id, title: c.title })),
    [conversations]
  );
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const newConversation = useChatStore(s => s.newConversation);
  const switchConversation = useChatStore(s => s.switchConversation);
  const deleteConversation = useChatStore(s => s.deleteConversation);
  const { getToken } = useAuth();
  const conversationsListRef = useRef<HTMLDivElement>(null);
  
  useShortcuts({ onOpenSettings: () => setSettingsOpen(true) });
  
  const handleMouseEnter = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    const timeout = setTimeout(() => setExpanded(true), 50);
    setHoverTimeout(timeout);
  };
  
  const handleMouseLeave = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    const timeout = setTimeout(() => setExpanded(false), 300);
    setHoverTimeout(timeout);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const element = conversationsListRef.current;
    if (!element) return;

    // Always stop propagation to prevent sidebar scroll from affecting the chat
    e.stopPropagation();

    // Note: preventDefault removed to avoid passive event listener warnings
    // Scroll chaining is still prevented by stopPropagation above
  };

  const handleSidebarWheel = (e: React.WheelEvent<HTMLElement>) => {
    // Stop all wheel events in the sidebar from propagating to the chat
    e.stopPropagation();
  };

  const onDelete = async (id: string) => {
    await toastPromise(
      async () => {
        const token = await getToken();
        await deleteConversationApi(id, token || undefined);
        deleteConversation(id);
        return true;
      },
      {
        loading: 'Deleting conversation…',
        success: 'Conversation deleted',
        error: (e) => (e instanceof Error ? e.message : 'Failed to delete'),
      }
    );
    notify.info('You can undo via History if supported');
  };

  return (
    <>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleSidebarWheel}
        className={cn(
          "group fixed left-0 top-0 h-screen border-r border-white/10 z-20",
          "glass transition-[width] duration-300 ease-in-out",
          expanded ? "w-[280px]" : "w-[64px]"
        )}
        aria-label="Primary navigation"
      >
        <div className="flex h-full flex-col">
          {/* New Chat Button */}
          <div className={cn(
            "flex items-center py-3 transition-all",
            expanded ? "px-3 justify-start" : "px-0 justify-center"
          )}>
            <button
              onClick={newConversation}
              className={cn(
                "flex items-center rounded-xl transition-all",
                "text-white/70 hover:text-white/90 hover:bg-white/5",
                expanded ? "w-full px-2 py-2 justify-start" : "w-10 h-10 p-0 justify-center"
              )}
              aria-label="New Chat"
            >
              <Plus className={cn(
                "h-5 w-5 flex-shrink-0 transition-opacity duration-100",
                expanded ? "opacity-0" : "opacity-100"
              )}/>
              <span className={cn(
                "transition-all duration-300",
                expanded ? "opacity-100 text-base" : "opacity-0 w-0 overflow-hidden text-sm"
              )}>New Chat</span>
            </button>
          </div>

          {/* Conversations List */}
          {expanded && (
            <nav 
              aria-label="Conversations"
              className="flex-1 min-h-0 overflow-hidden"
            >
              <div 
                ref={conversationsListRef}
                onWheel={handleWheel}
                className="h-full overflow-y-auto scrollbar-hide mt-2 space-y-1 px-1"
              >
                <ul role="list" className="space-y-1">
                  {items.map((conv) => (
                    <li key={conv.id}>
                      <div
                        className={cn(
                          "relative flex items-center w-full rounded-xl transition-all group",
                          currentThreadId === conv.id
                            ? "bg-white/5"
                            : "hover:bg-white/5"
                        )}
                      >
                        <button
                          onClick={() => switchConversation(conv.id)}
                          className={cn(
                            "flex items-center w-full py-2 transition-all justify-start gap-3 px-2 pr-10",
                            currentThreadId === conv.id
                              ? "text-white/95"
                              : "text-white/70 hover:text-white/90"
                          )}
                          aria-label={`Open conversation: ${conv.title}`}
                        >
                          <span className="text-base truncate">{conv.title}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(conv.id);
                          }}
                          className="sidebar-delete-btn"
                          aria-label={`Delete ${conv.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          )}

          {/* Bottom Section: Dashboard and Settings - Sticky */}
          <div className="mt-auto sticky bottom-0 px-1 pb-3 pt-2 space-y-1 bg-[#0f0f0f]/95 backdrop-blur-sm border-t border-white/10">
            {/* Dashboard Button */}
            <button
              onClick={() => {
                if (pathname === '/dashboard') {
                  navigate('/');
                } else {
                  navigate('/dashboard');
                }
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2 py-2 text-white/70 hover:text-white/90 hover:bg-white/5 w-full transition-all",
                pathname === '/dashboard' ? 'bg-white/10' : ''
              )}
              aria-label={pathname === '/dashboard' ? 'Return to chat' : 'Open dashboard'}
            >
              <BarChart3 className="h-5 w-5 flex-shrink-0"/>
              <span className={cn(
                "transition-opacity duration-300",
                expanded ? "opacity-100 text-base" : "opacity-0 text-sm"
              )}>Dashboard</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2 py-2 text-white/70 hover:text-white/90 hover:bg-white/5 w-full"
              )}
              aria-label="Settings"
            >
              <Settings className="h-5 w-5 flex-shrink-0"/>
              <span className={cn(
                "transition-opacity duration-300",
                expanded ? "opacity-100 text-base" : "opacity-0 text-sm"
              )}>Settings</span>
            </button>
          </div>
        </div>
      </aside>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
};

const Sidebar = React.memo(SidebarBase);

export default Sidebar;