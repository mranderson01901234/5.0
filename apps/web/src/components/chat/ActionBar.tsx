import * as React from "react";
import { Copy, ThumbsUp, ThumbsDown, Download } from "lucide-react";

type Message = { id: string; role: "user" | "assistant" | string; content: string };

type Props = {
  messageId: string;
  content: string;
  // full transcript for export; pass [] if unavailable and we'll export just this message
  messages?: Message[];
  onFeedback?: (messageId: string, value: "up" | "down") => void;
  className?: string;
};

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export default function ActionBar({
  messageId,
  content,
  messages = [],
  onFeedback,
  className,
}: Props) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard write failed - ignore silently
    }
  }

  function handleFeedback(v: "up" | "down") {
    onFeedback?.(messageId, v);
    // fire a custom event so analytics can subscribe without coupling
    document.dispatchEvent(new CustomEvent("chat:feedback", { detail: { messageId, value: v } }));
  }

  function toMarkdown(ms: Message[]): string {
    if (!ms.length) return `assistant:\n\n${content}\n`;

    return ms
      .map((m) => `${m.role}:\n\n${m.content}\n`)
      .join("\n---\n");
  }

  function handleExport() {
    const blob = new Blob([toMarkdown(messages)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat-export.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const baseBtn =
    "inline-flex items-center justify-center p-1.5 text-neutral-400 hover:text-neutral-100 " +
    "focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 rounded";

  const iconCls = "h-3.5 w-3.5";

  return (
    <div
      className={cx(
        "mt-0.5 select-none",
        "flex items-center gap-1 text-neutral-400",
        "opacity-80 hover:opacity-100 transition-opacity",
        className
      )}
      aria-label="Assistant message actions"
    >
      <button className={baseBtn} onClick={handleCopy} title="Copy" aria-label="Copy">
        <Copy className={iconCls} />
        <span className="sr-only">Copy</span>
      </button>

      <button
        className={baseBtn}
        onClick={() => handleFeedback("up")}
        title="Thumbs up"
        aria-label="Thumbs up"
      >
        <ThumbsUp className={iconCls} />
        <span className="sr-only">Thumbs up</span>
      </button>

      <button
        className={baseBtn}
        onClick={() => handleFeedback("down")}
        title="Thumbs down"
        aria-label="Thumbs down"
      >
        <ThumbsDown className={iconCls} />
        <span className="sr-only">Thumbs down</span>
      </button>

      <button className={baseBtn} onClick={handleExport} title="Export chat" aria-label="Export">
        <Download className={iconCls} />
        <span className="sr-only">Export chat</span>
      </button>
    </div>
  );
}

