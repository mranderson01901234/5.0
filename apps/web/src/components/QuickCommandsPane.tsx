import React, { useEffect, useState } from "react";
import { X, Zap, Search, Brain, Code, FileText, Image, Table, Settings, MessageSquare } from "lucide-react";

interface QuickCommandsPaneProps {
  onClose: () => void;
}

type CategoryType = 'all' | 'memory' | 'content' | 'search' | 'system';

interface Command {
  command: string;
  description: string;
  example: string;
  category: CategoryType;
}

const commands: Command[] = [
  // Memory Commands
  {
    command: "Remember that",
    description: "Explicitly store information in memory",
    example: "Remember that I prefer Python 3.11+ with type hints",
    category: "memory"
  },
  {
    command: "Forget about",
    description: "Remove specific information from memory",
    example: "Forget about my previous coding preferences",
    category: "memory"
  },
  {
    command: "What do you remember about",
    description: "Recall stored memories on a specific topic",
    example: "What do you remember about Project Phoenix?",
    category: "memory"
  },
  {
    command: "Update memory:",
    description: "Modify existing memory entries",
    example: "Update memory: I now use React 18 instead of React 17",
    category: "memory"
  },
  
  // Content Generation Commands
  {
    command: "Generate image:",
    description: "Create images using AI (Imagen, DALL-E, etc.)",
    example: "Generate image: a modern dashboard UI with dark theme",
    category: "content"
  },
  {
    command: "Create table:",
    description: "Generate structured data tables",
    example: "Create table: comparison of Python web frameworks",
    category: "content"
  },
  {
    command: "Write document:",
    description: "Generate formatted documents",
    example: "Write document: API documentation for user authentication",
    category: "content"
  },
  {
    command: "Generate code:",
    description: "Create code snippets in any language",
    example: "Generate code: REST API endpoint in FastAPI",
    category: "content"
  },
  
  // Search Commands
  {
    command: "Search the web for",
    description: "Perform real-time web searches",
    example: "Search the web for latest Next.js 14 features",
    category: "search"
  },
  {
    command: "Find information about",
    description: "Research topics with context-aware search",
    example: "Find information about TypeScript 5.0 updates",
    category: "search"
  },
  {
    command: "Look up",
    description: "Quick fact-finding searches",
    example: "Look up AWS Lambda pricing",
    category: "search"
  },
  
  // System Commands
  {
    command: "Start new conversation",
    description: "Begin a fresh chat session",
    example: "Start new conversation",
    category: "system"
  },
  {
    command: "Summarize this conversation",
    description: "Get a summary of the current chat",
    example: "Summarize this conversation",
    category: "system"
  },
  {
    command: "Export conversation",
    description: "Download the conversation history",
    example: "Export conversation as markdown",
    category: "system"
  },
  {
    command: "Continue in",
    description: "Switch language or mode",
    example: "Continue in Spanish / Continue in technical mode",
    category: "system"
  },
];

export const QuickCommandsPane: React.FC<QuickCommandsPaneProps> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<CategoryType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-quickcommands-modal]');
      if (modal && !modal.contains(target)) {
        onClose();
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
  }, [onClose]);

  const filteredCommands = commands.filter(cmd => {
    const matchesCategory = activeCategory === 'all' || cmd.category === activeCategory;
    const matchesSearch = searchQuery === '' || 
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.example.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (category: CategoryType) => {
    switch (category) {
      case 'memory': return <Brain className="w-4 h-4" />;
      case 'content': return <FileText className="w-4 h-4" />;
      case 'search': return <Search className="w-4 h-4" />;
      case 'system': return <Settings className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  const getCategoryLabel = (category: CategoryType) => {
    switch (category) {
      case 'memory': return 'Memory';
      case 'content': return 'Content';
      case 'search': return 'Search';
      case 'system': return 'System';
      default: return 'All';
    }
  };

  return (
    <div
      data-quickcommands-modal
      className="fixed right-0 top-16 bottom-0 z-[9999] w-[580px] bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-white/90 rounded-full" />
          <h2 className="text-lg font-medium text-white/90 tracking-tight">Quick Commands</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Search Bar */}
      <div className="border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-10 py-2 text-sm text-white/80 placeholder:text-white/40 focus:outline-none focus:border-blue-400/50 focus:bg-white/[0.06] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filters */}
      <div className="border-b border-white/[0.08] px-6 py-3 flex-shrink-0">
        <div className="flex gap-2">
          {(['all', 'memory', 'content', 'search', 'system'] as CategoryType[]).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeCategory === category
                  ? 'bg-blue-400/10 text-blue-400 border border-blue-400/20'
                  : 'bg-white/[0.02] text-white/50 border border-white/[0.06] hover:bg-white/[0.04] hover:text-white/70'
              }`}
            >
              {getCategoryIcon(category)}
              <span>{getCategoryLabel(category)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Commands List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-white/30" />
              </div>
              <p className="text-sm text-white/40">No commands found</p>
              <p className="text-xs text-white/25 mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCommands.map((cmd, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all p-4 group"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      {getCategoryIcon(cmd.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-base text-white/80 font-medium">{cmd.command}</h3>
                        <span className="text-xs text-white/30 uppercase tracking-wider font-mono flex-shrink-0">
                          {getCategoryLabel(cmd.category)}
                        </span>
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed">
                        {cmd.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <div className="text-xs text-white/40 mb-1.5 font-mono uppercase tracking-wider">Example:</div>
                    <div className="text-sm text-white/70 font-mono leading-relaxed">
                      "{cmd.example}"
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/30">Available Commands</span>
          <span className="text-white/50 font-medium tabular-nums">{filteredCommands.length} of {commands.length}</span>
        </div>
      </div>
    </div>
  );
};

