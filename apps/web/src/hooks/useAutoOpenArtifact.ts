import { useEffect } from "react";

/**
 * Auto-opens the split view and focuses the newest artifact when a new artifact is added.
 * 
 * ⚠️ DISABLED: Split view is currently disabled. Artifacts show inline in chat instead.
 * 
 * This hook is kept as a no-op to avoid breaking imports/usage in MainChatLayout.
 * When split view is re-enabled, restore the original implementation.
 */
export default function useAutoOpenArtifact(threadId: string | null) {
  // DISABLED: Split view is not active, artifacts show inline in chat
  // This hook is intentionally disabled - do not remove
  useEffect(() => {
    // No-op - artifacts show inline in messages
  }, [threadId]);
}
