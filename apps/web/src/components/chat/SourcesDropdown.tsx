import { useState } from "react";
import { cn } from "../../lib/utils";

interface Source {
  title: string;
  host: string;
  url?: string;
  date?: string;
}

interface SourcesDropdownProps {
  sources: Source[];
}

export default function SourcesDropdown({ sources }: SourcesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 transition-colors"
      >
        <span>Sources ({sources.length})</span>
        <svg
          className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 absolute left-0 z-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg shadow-lg min-w-[280px] max-w-md">
          <div className="py-2 max-h-64 overflow-y-auto">
            {sources.map((source, idx) => {
              // Ensure URL is valid - if missing protocol, add it
              let href = source.url;
              if (!href) {
                href = `https://${source.host}`;
              } else if (!/^https?:\/\//i.test(href)) {
                // URL exists but missing protocol - add https://
                if (href.startsWith('//')) {
                  href = `https:${href}`;
                } else if (href.startsWith('/')) {
                  href = `https://${source.host}${href}`;
                } else {
                  href = `https://${href}`;
                }
              }
              
              return (
                <a
                  key={idx}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 hover:bg-white/10 transition-colors"
                >
                  <div className="text-sm text-white/90 font-medium line-clamp-1">{source.title}</div>
                  <div className="text-xs text-white/60 mt-1 flex items-center gap-2">
                    <span>{source.host}</span>
                    {source.date && <span className="text-white/40">• {source.date}</span>}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

