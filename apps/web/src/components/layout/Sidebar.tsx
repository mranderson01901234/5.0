import React, { useState, useRef, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Settings, Plus, Trash2, BarChart3 } from "../../icons";
import { Layers, MessageSquare } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useUIStore } from "../../store/uiStore";
import { cn } from "../../lib/utils";
import SettingsDialog from "../settings/SettingsDialog";
import ArtifactsDialog from "../settings/ArtifactsDialog";
import ConversationsDialog from "../settings/ConversationsDialog";
import DashboardDialog from "../settings/DashboardDialog";
import { deleteConversation as deleteConversationApi } from "../../services/gateway";
import { toastPromise } from "../../utils/toastPromise";
import { notify } from "../../utils/toast";
import { useShortcuts } from "../../hooks/useShortcuts";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";

type ConversationItem = { id: string; title: string };

const SidebarBase: React.FC = () => {
  const [expanded,setExpanded]=useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const conversations = useChatStore(s => s.conversations);
  const setSidebarExpanded = useUIStore(s => s.setSidebarExpanded);
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
    // Disabled auto-expansion
  };
  
  const handleMouseLeave = () => {
    // Disabled auto-collapse
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
    <TooltipProvider>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleSidebarWheel}
        className={cn(
          "group fixed left-0 top-0 h-screen border-r border-white/[0.12] z-[60]",
          "transition-[width] duration-300 ease-in-out shadow-2xl",
          "w-[80px]"
        )}
        style={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          boxShadow: '2px 0 8px rgba(0, 0, 0, 0.5)' 
        }}
        aria-label="Primary navigation"
      >
        <div className="flex h-full flex-col">
          {/* New Chat Button */}
          <div className="flex items-center py-4 px-0 justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={newConversation}
                  className={cn(
                    "flex items-center rounded-lg transition-all border border-white/[0.06]",
                    "text-white/70 hover:text-white/90 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]",
                    "w-14 h-14 p-0 justify-center"
                  )}
                  aria-label="New Chat"
                >
                  <Plus className="h-7 w-7 flex-shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={8}
                className="!bg-white/[0.03] border border-white/[0.12] text-white/90 px-3 py-1.5 text-xs rounded-md shadow-lg"
              >
                <p>New Chat</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom Section: Conversations, Artifacts, Dashboard and Settings - Sticky */}
          <div className="mt-auto sticky bottom-0 px-2 pb-4 pt-3 space-y-2 border-t border-white/[0.08]" style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
            {/* Conversations Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setConversationsOpen(true)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-white/70 hover:text-white/90 w-full transition-all border border-white/[0.06]",
                    conversationsOpen 
                      ? 'bg-white/[0.04] border-white/[0.12]' 
                      : 'bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]',
                    "justify-center"
                  )}
                  aria-label="Conversations"
                >
                  <MessageSquare className="h-6 w-6 flex-shrink-0"/>
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={8}
                className="!bg-white/[0.03] border border-white/[0.12] text-white/90 px-3 py-1.5 text-xs rounded-md shadow-lg"
              >
                <p>Conversations</p>
              </TooltipContent>
            </Tooltip>

            {/* Artifacts Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setArtifactsOpen(true)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-white/70 hover:text-white/90 w-full transition-all border border-white/[0.06]",
                    artifactsOpen 
                      ? 'bg-white/[0.04] border-white/[0.12]' 
                      : 'bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]',
                    "justify-center"
                  )}
                  aria-label="Artifacts"
                >
                  <Layers className="h-6 w-6 flex-shrink-0"/>
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={8}
                className="!bg-white/[0.03] border border-white/[0.12] text-white/90 px-3 py-1.5 text-xs rounded-md shadow-lg"
              >
                <p>Artifacts</p>
              </TooltipContent>
            </Tooltip>

            {/* Dashboard Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setDashboardOpen(true)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-white/70 hover:text-white/90 w-full transition-all border border-white/[0.06]",
                    dashboardOpen 
                      ? 'bg-white/[0.04] border-white/[0.12]' 
                      : 'bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]',
                    "justify-center"
                  )}
                  aria-label="Dashboard"
                >
                  <BarChart3 className="h-6 w-6 flex-shrink-0"/>
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={8}
                className="!bg-white/[0.03] border border-white/[0.12] text-white/90 px-3 py-1.5 text-xs rounded-md shadow-lg"
              >
                <p>Dashboard</p>
              </TooltipContent>
            </Tooltip>

            {/* Settings Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-white/70 hover:text-white/90 w-full transition-all border border-white/[0.06]",
                    "bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]",
                    "justify-center"
                  )}
                  aria-label="Settings"
                >
                  <Settings className="h-6 w-6 flex-shrink-0"/>
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={8}
                className="!bg-white/[0.03] border border-white/[0.12] text-white/90 px-3 py-1.5 text-xs rounded-md shadow-lg"
              >
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ArtifactsDialog open={artifactsOpen} onOpenChange={setArtifactsOpen} />
      <ConversationsDialog open={conversationsOpen} onOpenChange={setConversationsOpen} />
      <DashboardDialog open={dashboardOpen} onOpenChange={setDashboardOpen} />
    </TooltipProvider>
  );
};

const Sidebar = React.memo(SidebarBase);

export default Sidebar;