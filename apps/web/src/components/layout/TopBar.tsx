import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { AboutUsPane } from "../AboutUsPane";
import { MemoryPane } from "../MemoryPane";
import { QuickCommandsPane } from "../QuickCommandsPane";
import { Terminal } from "../../icons";
import { useChatStore } from "../../store/chatStore";
import { notify } from "../../utils/toast";

export default function TopBar(){
  const [aboutUsOpen, setAboutUsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [quickCommandsOpen, setQuickCommandsOpen] = useState(false);
  const currentThreadId = useChatStore(s => s.currentThreadId);

  const handleAboutUs = () => {
    setAboutUsOpen(true);
  };

  const handleMemory = () => {
    setMemoryOpen(true);
  };

  const handleQuickCommands = () => {
    setQuickCommandsOpen(true);
  };

  const handleOpenInCLI = async () => {
    if (!currentThreadId) {
      notify.error('No active conversation');
      return;
    }

    const command = `claude --teleport session_${currentThreadId}`;

    try {
      await navigator.clipboard.writeText(command);
      notify.success('Command copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy command:', error);
      notify.error('Failed to copy command');
    }
  };

  const handleCloseAboutUs = () => {
    setAboutUsOpen(false);
  };

  const handleCloseMemory = () => {
    setMemoryOpen(false);
  };

  const handleCloseQuickCommands = () => {
    setQuickCommandsOpen(false);
  };

  return (
    <>
      <header className="fixed left-20 right-0 top-0 z-[10000] flex h-16 items-center justify-end px-6 bg-[#0a0a0a]">
        <div className="flex items-center gap-3 mr-4">
          {/* Navigation buttons - always visible */}
          <button
            onClick={handleAboutUs}
            className="text-sm text-white/70 hover:text-white/90 transition-colors cursor-pointer whitespace-nowrap flex items-center"
          >
            About Us
          </button>
          <span className="text-white/40 text-sm flex items-center">•</span>
          <button
            onClick={handleMemory}
            className="text-sm text-white/70 hover:text-white/90 transition-colors cursor-pointer whitespace-nowrap flex items-center"
          >
            Memory
          </button>
          <span className="text-white/40 text-sm flex items-center">•</span>
          <button
            onClick={handleQuickCommands}
            className="text-sm text-white/70 hover:text-white/90 transition-colors cursor-pointer whitespace-nowrap flex items-center"
          >
            Quick Commands
          </button>
          <span className="text-white/40 text-sm flex items-center">•</span>
          <button
            onClick={handleOpenInCLI}
            disabled={!currentThreadId}
            className="text-sm text-white/70 hover:text-white/90 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed mr-[10px]"
            title={currentThreadId ? "Copy CLI command to open this session in terminal" : "No active conversation"}
          >
            <Terminal className="w-4 h-4" />
            Open in CLI
          </button>

          {/* User button or auth buttons - space reserved for them */}
          <SignedIn>
            <div className="flex items-center">
              <UserButton />
            </div>
          </SignedIn>
          
          <SignedOut>
            {/* Auth buttons will be positioned here by Unauthed component */}
            <div className="w-[280px]"></div>
          </SignedOut>
        </div>
      </header>

      {/* About Us Pane */}
      {aboutUsOpen && <AboutUsPane onClose={handleCloseAboutUs} />}
      
      {/* Memory Pane */}
      {memoryOpen && <MemoryPane onClose={handleCloseMemory} />}
      
      {/* Quick Commands Pane */}
      {quickCommandsOpen && <QuickCommandsPane onClose={handleCloseQuickCommands} />}
    </>
  );
}

