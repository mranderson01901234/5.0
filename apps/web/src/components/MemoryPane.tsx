import React, { useEffect, useState } from "react";
import { X, Brain, Zap, Database, Clock, Shield, Network, Users, Search, Settings, Edit3, Trash2, Eye } from "lucide-react";

interface MemoryPaneProps {
  onClose: () => void;
}

type TabType = 'technical' | 'overview' | 'examples' | 'control';

export const MemoryPane: React.FC<MemoryPaneProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-memory-modal]');
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

  return (
    <div
      data-memory-modal
      className="fixed right-0 top-16 bottom-0 z-[9999] w-[580px] bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-white/90 rounded-full" />
          <h2 className="text-lg font-medium text-white/90 tracking-tight">Memory System</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-white/[0.08] px-6 flex-shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'overview'
                ? 'text-white/90'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              <span>Overview</span>
            </div>
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('technical')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'technical'
                ? 'text-white/90'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              <span>Technical</span>
            </div>
            {activeTab === 'technical' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('examples')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'examples'
                ? 'text-white/90'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Examples</span>
            </div>
            {activeTab === 'examples' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('control')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'control'
                ? 'text-white/90'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span>Control</span>
            </div>
            {activeTab === 'control' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="pt-4">
          {/* Technical Tab */}
          {activeTab === 'technical' && (
            <>
              <div className="mb-6">
                <div className="px-6 mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                    Technical Overview
                  </h3>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
            <div className="px-3 space-y-2">
              {/* Architecture Card */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h4 className="text-base text-white/80 font-medium mb-3">System Architecture</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-white/70"><span className="text-blue-400 font-medium">Vector Database</span>: Qdrant for semantic similarity search with 768-dimensional embeddings</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-white/70"><span className="text-blue-400 font-medium">Cache Layer</span>: Redis for hot memory storage with sub-10ms retrieval latency</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-white/70"><span className="text-blue-400 font-medium">Persistent Storage</span>: SQLite for structured metadata and conversation history</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-white/70"><span className="text-blue-400 font-medium">Embedding Model</span>: Sentence transformers for semantic encoding</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-white/70"><span className="text-blue-400 font-medium">API Layer</span>: FastAPI runtime with async memory operations</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Metrics Card */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h4 className="text-base text-white/80 font-medium mb-3">Performance Metrics</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <div className="text-xs text-white/40 mb-1 font-mono uppercase tracking-wider">Query Latency</div>
                    <div className="text-lg text-white/80 font-semibold">{'<'}200ms</div>
                    <div className="text-xs text-white/50 mt-1">p95 response time</div>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <div className="text-xs text-white/40 mb-1 font-mono uppercase tracking-wider">Storage Capacity</div>
                    <div className="text-lg text-white/80 font-semibold">Unlimited</div>
                    <div className="text-xs text-white/50 mt-1">per user account</div>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <div className="text-xs text-white/40 mb-1 font-mono uppercase tracking-wider">Recall Accuracy</div>
                    <div className="text-lg text-white/80 font-semibold">{'>'}95%</div>
                    <div className="text-xs text-white/50 mt-1">semantic match rate</div>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <div className="text-xs text-white/40 mb-1 font-mono uppercase tracking-wider">Concurrent Users</div>
                    <div className="text-lg text-white/80 font-semibold">10K+</div>
                    <div className="text-xs text-white/50 mt-1">simultaneous queries</div>
                  </div>
                </div>
              </div>

              {/* Data Flow Card */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h4 className="text-base text-white/80 font-medium mb-3">Memory Pipeline</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      1. Ingest
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">Raw conversation data captured in real-time</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      2. Extract
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">NLP extraction of entities, facts, and relationships</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      3. Embed
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">Semantic vectorization for similarity search</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      4. Index
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">Store in vector DB with metadata tags</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      5. Recall
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">Hybrid search: vector similarity + keyword match</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      6. Rank
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">Score by relevance, recency, and context weight</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-white/60 font-mono">
                      7. Inject
                    </div>
                    <div className="text-white/30">→</div>
                    <div className="text-xs text-white/50">Top-K memories inserted into prompt context</div>
                  </div>
                </div>
              </div>

              {/* Technical Features Card */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h4 className="text-base text-white/80 font-medium mb-3">Advanced Features</h4>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Network className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <div>
                      <div className="text-white/80 font-medium mb-1">Knowledge Graph Integration</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Automatically builds relationship graphs between entities (people, projects, concepts) for contextual retrieval
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <div>
                      <div className="text-white/80 font-medium mb-1">Temporal Decay Modeling</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Applies time-based relevance scoring where recent memories have higher weight, with configurable decay curves
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Brain className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <div>
                      <div className="text-white/80 font-medium mb-1">Memory Consolidation</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Background processes merge duplicate entries, resolve conflicts, and compress verbose memories into concise facts
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Shield className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <div>
                      <div className="text-white/80 font-medium mb-1">Privacy-Preserving Redaction</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Automatic PII detection and masking using regex patterns and NER models before storage
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <div>
                      <div className="text-white/80 font-medium mb-1">Incremental Updates</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Real-time memory updates without full reindexing using incremental vector insertion
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Search className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <div>
                      <div className="text-white/80 font-medium mb-1">Hybrid Search Strategy</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Combines dense vector search (semantic) with BM25 sparse retrieval (keyword) for optimal recall
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* API Endpoints Card */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h4 className="text-base text-white/80 font-medium mb-3">API Surface</h4>
                <div className="space-y-2">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-blue-400">POST</span>
                      <span className="text-xs font-mono text-white/60">/api/memory/store</span>
                    </div>
                    <p className="text-xs text-white/40">Create new memory entries with metadata</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-blue-400">GET</span>
                      <span className="text-xs font-mono text-white/60">/api/memory/search</span>
                    </div>
                    <p className="text-xs text-white/40">Semantic search with configurable filters</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-blue-400">GET</span>
                      <span className="text-xs font-mono text-white/60">/api/memory/recall</span>
                    </div>
                    <p className="text-xs text-white/40">Context-aware memory injection for conversations</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-blue-400">PUT</span>
                      <span className="text-xs font-mono text-white/60">/api/memory/update</span>
                    </div>
                    <p className="text-xs text-white/40">Modify existing memories or merge duplicates</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-blue-400">DELETE</span>
                      <span className="text-xs font-mono text-white/60">/api/memory/delete</span>
                    </div>
                    <p className="text-xs text-white/40">Permanent removal with cascading cleanup</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
            </>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              <div className="mb-6">
                <div className="px-6 mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                    What is Memory?
                  </h3>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h4 className="text-xl font-semibold text-white/90 mb-3">Your AI Remembers Everything</h4>
                <div className="space-y-3 text-base text-white/70">
                  <p className="leading-relaxed">
                    Unlike traditional chatbots that forget your conversation when you close the window, this system has 
                    <span className="text-white/90 font-medium"> persistent memory</span>. It remembers who you are, what you've discussed, 
                    your preferences, and your projects — across all your conversations, forever.
                  </p>
                  <p className="leading-relaxed">
                    Think of it as an AI assistant with a <span className="text-white/90 font-medium">perfect memory</span> that gets 
                    smarter the more you interact with it.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <Network className="w-4 h-4 text-white/50" />
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                How It Works
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-8 h-8 border border-white/[0.12] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white/50 font-semibold text-sm">1</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base text-white/80 font-medium mb-1.5">Automatic Capture</h4>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Every conversation is automatically analyzed and important information is extracted — names, dates, 
                          preferences, goals, decisions, and context.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-8 h-8 border border-white/[0.12] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white/50 font-semibold text-sm">2</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base text-white/80 font-medium mb-1.5">Semantic Understanding</h4>
                        <p className="text-sm text-white/60 leading-relaxed">
                          The system doesn't just save text — it understands meaning. It knows that "my boss Sarah" and 
                          "Sarah from work" refer to the same person, and connects related concepts automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-8 h-8 border border-white/[0.12] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white/50 font-semibold text-sm">3</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base text-white/80 font-medium mb-1.5">Intelligent Recall</h4>
                        <p className="text-sm text-white/60 leading-relaxed">
                          When you ask a question or start a new conversation, the system instantly searches through your 
                          entire history to find relevant context and brings it into the conversation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            </>
          )}

          {/* Examples Tab */}
          {activeTab === 'examples' && (
            <>
              <div className="mb-6">
                <div className="px-6 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                    How Memory Works in Practice
                  </h3>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
            <div className="px-3 space-y-2">
              {/* Example 1: Explicit Memory */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Edit3 className="w-4 h-4 text-white/50" />
                  </div>
                  <h4 className="text-base text-white/80 font-medium">Explicit Memory Commands</h4>
                </div>
                <div className="space-y-3 text-sm text-white/60">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">USER:</p>
                    <p className="text-white/70">"My team uses TypeScript strict mode and we follow the Airbnb style guide. <span className="text-blue-400 font-medium">Remember that</span> for all future code reviews."</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">AI:</p>
                    <p className="text-white/70">"I've stored your team's coding standards. I'll apply TypeScript strict mode and Airbnb style guide rules in all future code reviews and suggestions."</p>
                  </div>
                  <div className="border-l-2 border-blue-500/30 pl-3 py-2">
                    <p className="text-white/60 text-sm leading-relaxed">
                      <span className="text-blue-400 font-medium">Result:</span> All future code interactions automatically follow these standards without re-stating them.
                    </p>
                  </div>
                </div>
              </div>

              {/* Example 2: Proactive Memory */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Brain className="w-4 h-4 text-white/50" />
                  </div>
                  <h4 className="text-base text-white/80 font-medium">Proactive Memory Injection</h4>
                </div>
                <div className="space-y-3 text-sm text-white/60">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">WEEK 1:</p>
                    <p className="text-white/70">"I'm building an e-commerce platform with Stripe integration. The checkout flow needs to handle subscriptions and one-time purchases."</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">WEEK 3 - USER:</p>
                    <p className="text-white/70">"How do I handle failed payments?"</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3 border-l-2 border-l-blue-500/50">
                    <p className="text-white/50 text-xs mb-2 font-mono">AI (with memory context):</p>
                    <p className="text-white/70 mb-2">"Based on your e-commerce platform with Stripe, here's how to handle failed payments for both subscription and one-time purchase flows..."</p>
                    <p className="text-xs text-white/40 italic mt-2 pt-2 border-t border-white/[0.04]">
                      <Brain className="w-3 h-3 inline mr-1" />
                      Automatically recalled: Stripe integration, checkout flow requirements
                    </p>
                  </div>
                  <div className="border-l-2 border-blue-500/30 pl-3 py-2">
                    <p className="text-white/60 text-sm leading-relaxed">
                      <span className="text-blue-400 font-medium">Result:</span> AI proactively injects relevant context from previous conversations without being asked.
                    </p>
                  </div>
                </div>
              </div>

              {/* Example 3: Web Search Integration */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-white/50" />
                  </div>
                  <h4 className="text-base text-white/80 font-medium">Memory-Aware Web Search</h4>
                </div>
                <div className="space-y-3 text-sm text-white/60">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">USER (stored preference: AWS infrastructure, Python backend):</p>
                    <p className="text-white/70">"What's the latest on serverless computing?"</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3 border-l-2 border-l-blue-500/50">
                    <p className="text-white/50 text-xs mb-2 font-mono">AI (search tailored to user memory):</p>
                    <p className="text-white/70 mb-2">"I'll search for the latest serverless updates specifically for AWS Lambda and Python runtimes, based on your tech stack..."</p>
                    <div className="text-xs text-white/40 italic mt-3 pt-2 border-t border-white/[0.04] space-y-1">
                      <p><Search className="w-3 h-3 inline mr-1" />Searching: "AWS Lambda Python 3.12 serverless updates 2024"</p>
                      <p><Brain className="w-3 h-3 inline mr-1" />Using memory: AWS infrastructure preference, Python backend</p>
                    </div>
                  </div>
                  <div className="border-l-2 border-blue-500/30 pl-3 py-2">
                    <p className="text-white/60 text-sm leading-relaxed">
                      <span className="text-blue-400 font-medium">Result:</span> Web searches are automatically filtered and prioritized based on your stored preferences and tech stack.
                    </p>
                  </div>
                </div>
              </div>

              {/* Example 4: Project Context */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Database className="w-4 h-4 text-white/50" />
                  </div>
                  <h4 className="text-base text-white/80 font-medium">Cross-Session Project Memory</h4>
                </div>
                <div className="space-y-3 text-sm text-white/60">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">MONDAY - Different conversation:</p>
                    <p className="text-white/70">"I'm working on Project Phoenix - it's a React dashboard with real-time WebSocket updates."</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3">
                    <p className="text-white/50 text-xs mb-2 font-mono">THURSDAY - New conversation:</p>
                    <p className="text-white/70">"How should I structure the backend for Phoenix?"</p>
                  </div>
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3 border-l-2 border-l-blue-500/50">
                    <p className="text-white/50 text-xs mb-2 font-mono">AI (recognizes project reference):</p>
                    <p className="text-white/70 mb-2">"For Project Phoenix's backend, given that you're using WebSocket for real-time updates with a React dashboard, I'd recommend..."</p>
                    <p className="text-xs text-white/40 italic mt-2 pt-2 border-t border-white/[0.04]">
                      <Brain className="w-3 h-3 inline mr-1" />
                      Linked memory: Project Phoenix context from Monday's conversation
                    </p>
                  </div>
                  <div className="border-l-2 border-blue-500/30 pl-3 py-2">
                    <p className="text-white/60 text-sm leading-relaxed">
                      <span className="text-blue-400 font-medium">Result:</span> Project context persists across different conversations and days automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Capabilities Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-white/50" />
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                Key Capabilities
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-white/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base text-white/80 font-medium mb-1">Cross-Session Memory</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Access your conversation history from any device, anytime. Close your laptop, open your phone — 
                        the AI knows exactly where you left off.
                      </p>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <Brain className="w-5 h-5 text-white/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base text-white/80 font-medium mb-1">Contextual Awareness</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        The system understands when to recall information. It doesn't just dump your entire history — 
                        it intelligently surfaces what's relevant to your current task.
                      </p>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-white/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base text-white/80 font-medium mb-1">Lightning-Fast Retrieval</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Memory recall happens in under 200 milliseconds. The AI seamlessly weaves in context without 
                        any noticeable delay in responses.
                      </p>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <Network className="w-5 h-5 text-white/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base text-white/80 font-medium mb-1">Relationship Mapping</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Automatically connects related concepts, people, and projects. Mention one detail, and the AI 
                        pulls in everything connected to it.
                      </p>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-white/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base text-white/80 font-medium mb-1">Privacy-First Storage</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Your memories are isolated and encrypted. Only you have access to your memory store, and 
                        sensitive information is automatically redacted.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* What Gets Remembered Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                What Gets Remembered
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <h4 className="text-sm text-white/70 font-medium mb-2">Automatically Captured:</h4>
                    <ul className="space-y-1.5 text-sm text-white/60">
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Personal details & preferences</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Project details & decisions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Code snippets & solutions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Goals & action items</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Important dates & events</span>
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm text-white/70 font-medium mb-2">Intelligently Filtered:</h4>
                    <ul className="space-y-1.5 text-sm text-white/60">
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-1">×</span>
                        <span>Small talk & pleasantries</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-1">×</span>
                        <span>Temporary test data</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-1">×</span>
                        <span>Redundant information</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-1">×</span>
                        <span>Error messages & typos</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-400 mt-1">⚠</span>
                        <span>Sensitive data (redacted)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

            </>
          )}

          {/* Control Tab */}
          {activeTab === 'control' && (
            <>
              <div className="mb-6">
                <div className="px-6 mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                    User Control & Configuration
                  </h3>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="mb-4">
                  <p className="text-base text-white/70 leading-relaxed mb-4">
                    You have <span className="text-white/90 font-medium">complete control</span> over what the AI remembers. 
                    Memory is not a black box — it's fully transparent and configurable.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Eye className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base text-white/80 font-medium mb-1.5">View All Memories</h4>
                      <p className="text-sm text-white/60 leading-relaxed mb-2">
                        Browse your complete memory store with searchable, filterable views. See exactly what the AI has stored, 
                        when it was captured, and how it's being used.
                      </p>
                      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5 text-xs text-white/50 font-mono">
                        Access: Memory Dashboard → View All Entries
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Edit3 className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base text-white/80 font-medium mb-1.5">Edit Memories</h4>
                      <p className="text-sm text-white/60 leading-relaxed mb-2">
                        Manually update, correct, or enhance any stored memory. Add context, fix inaccuracies, 
                        or merge duplicate entries. Your edits take precedence over automatically captured data.
                      </p>
                      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5 space-y-1">
                        <p className="text-xs text-white/50 font-mono">Example: Update "Prefers Python" → "Prefers Python 3.11+ with type hints"</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base text-white/80 font-medium mb-1.5">Delete Memories</h4>
                      <p className="text-sm text-white/60 leading-relaxed mb-2">
                        Remove individual memories, entire conversations, or bulk delete by category. 
                        Deletions are immediate and permanent — the AI will never reference removed information.
                      </p>
                      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5 space-y-1">
                        <p className="text-xs text-white/50 font-mono">Options: Delete single item | Delete by date range | Clear all project memories</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Settings className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base text-white/80 font-medium mb-1.5">Configure Memory Behavior</h4>
                      <p className="text-sm text-white/60 leading-relaxed mb-2">
                        Fine-tune how aggressively the AI captures and recalls information:
                      </p>
                      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Memory Capture Rate:</span>
                          <span className="text-white/40 text-xs font-mono">Conservative | Balanced | Aggressive</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Auto-Recall Threshold:</span>
                          <span className="text-white/40 text-xs font-mono">High relevance only | Medium+ | All relevant</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Privacy Mode:</span>
                          <span className="text-white/40 text-xs font-mono">Auto-redact sensitive data: ON/OFF</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Memory Retention:</span>
                          <span className="text-white/40 text-xs font-mono">30 days | 90 days | 1 year | Forever</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base text-white/80 font-medium mb-1.5">Pause Memory Collection</h4>
                      <p className="text-sm text-white/60 leading-relaxed mb-2">
                        Temporarily disable memory capture for sensitive discussions or testing scenarios. 
                        When paused, conversations happen normally but nothing new is stored.
                      </p>
                      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5 text-xs text-white/50 font-mono">
                        Command: "Pause memory for this conversation" or toggle in settings
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px bg-white/[0.06]" />
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Database className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base text-white/80 font-medium mb-1.5">Export Your Memory Data</h4>
                      <p className="text-sm text-white/60 leading-relaxed mb-2">
                        Download your complete memory store as JSON or CSV. Full data portability — your memories, 
                        your data, your control.
                      </p>
                      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded p-2.5 text-xs text-white/50 font-mono">
                        Export formats: JSON (structured) | CSV (spreadsheet) | Markdown (readable)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                  <p className="text-sm text-white/70 leading-relaxed text-center">
                    <span className="font-medium text-white/80">Your memory, your rules.</span> The AI adapts to your preferences, 
                    but you always have final say over what stays and what goes.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Details Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                For Technical Users
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Vector-Based Semantic Search</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Uses embeddings to enable similarity-based retrieval. Searches by meaning rather than exact keywords, 
                      powered by vector databases with sub-200ms query latency.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Hybrid Storage Architecture</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Combines vector similarity (Qdrant) for semantic search, key-value caching (Redis) for hot data, 
                      and relational storage (SQLite) for structured queries.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Real-Time Context Scoring</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Each memory is scored for relevance based on recency, frequency, semantic similarity, and contextual 
                      relationships. Only top-scoring memories are injected into conversations.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Automatic Memory Consolidation</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Background processes merge duplicate information, update outdated facts, and compress long conversations 
                      into concise knowledge entries.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                Why This Matters
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="space-y-3 text-base text-white/70">
                  <p className="leading-relaxed">
                    Traditional AI assistants start from zero every time. You spend countless hours re-explaining context, 
                    repeating preferences, and reconstructing project details.
                  </p>
                  <p className="leading-relaxed">
                    With persistent memory, <span className="text-white/90 font-medium">the AI evolves with you</span>. 
                    Each conversation makes it more attuned to your needs. It becomes a true long-term assistant that 
                    knows your work style, remembers your projects, and anticipates what you need.
                  </p>
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 mt-3">
                    <p className="text-base text-white/80 text-center leading-relaxed">
                      Stop repeating yourself. Start building on every conversation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/30">Memory System</span>
          <span className="text-white/50 font-medium">Always Learning</span>
        </div>
      </div>
    </div>
  );
};

