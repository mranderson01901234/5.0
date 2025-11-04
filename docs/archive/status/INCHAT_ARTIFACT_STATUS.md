# In-Chat Artifact Status

## Overview

This document tracks the implementation of in-chat artifact rendering. Artifacts now appear as inline cards within the chat stream with their own scroll area, export functionality, and auto-focus capabilities.

## Files Added/Modified

### Added Files

1. **`apps/web/src/components/chat/ArtifactMessageCard.tsx`** (~360 LOC)
   - New component for rendering artifacts as inline cards
   - Features:
     - Scroll isolation with `max-h-[55vh]`
     - Sticky header with export buttons
     - Collapse/expand functionality
     - Export buttons (PDF/DOCX/XLSX) with status polling
     - Copy CSV for tables
     - Empty state handling

2. **`apps/web/src/utils/scrollIntoViewAnchor.ts`** (~20 LOC)
   - Utility function for auto-scrolling artifacts into view
   - Uses smooth scrolling with center alignment

### Modified Files

1. **`apps/web/src/components/chat/MessageItem.tsx`** (~20 LOC changed)
   - Updated to detect artifacts via `message.meta.artifactId` or thread-based lookup
   - Replaced inline artifact rendering with `<ArtifactMessageCard />`
   - Checks `inChatArtifactsEnabled` flag before rendering

2. **`apps/web/src/store/uiStore.ts`** (~5 LOC added)
   - Added `inChatArtifactsEnabled: boolean` (default: `true`)
   - Added `splitViewEnabled: boolean` (default: `false`)

3. **`apps/web/src/store/artifactStore.ts`** (~15 LOC added)
   - Added `getById()` helper (alias for `getArtifactById`)
   - Added `toMessagePayload()` helper for converting artifacts to message metadata

4. **`apps/web/src/hooks/useChatStream.ts`** (~10 LOC changed)
   - Added import for `scrollArtifactIntoView`
   - Calls `scrollArtifactIntoView()` after artifact creation (300ms delay)
   - Calls `scrollArtifactIntoView()` after artifact repoint (100ms delay)

## Feature Flags

- `inChatArtifactsEnabled`: `true` (enables inline artifact rendering)
- `splitViewEnabled`: `false` (keeps split view disabled)

## Demo Steps

1. **Create a table artifact:**
   - Send a message like "Create a table with columns: Name, Age, City"
   - The artifact card should appear inline within the chat
   - Card should auto-scroll into view

2. **Test export functionality:**
   - Click export buttons (XLSX for tables, PDF/DOCX for docs)
   - Status should show: Queued → Processing → Ready
   - Download should open automatically when ready

3. **Test collapse/expand:**
   - Click chevron button in header
   - Card should collapse to 44px header height
   - Click again to expand

4. **Test copy CSV:**
   - For table artifacts, click "Copy CSV" button
   - CSV should be copied to clipboard

5. **Test scroll isolation:**
   - Create a large table artifact
   - Verify card has its own scroll area (max-h ~55vh)
   - Page/chat scroll should remain independent

## Known Limitations

1. **Document/Sheet rendering:** Currently shows placeholder text. Full rendering not yet implemented.
2. **Export polling:** Polls every 2 seconds while export is queued/processing. Could be optimized with WebSocket updates.
3. **Artifact detection:** Currently relies on thread-based lookup. Future enhancement could use message metadata (`message.meta.artifactId`).
4. **Mobile responsiveness:** Card layout may need refinement for smaller screens.

## Next Steps (Optional)

1. **Message metadata integration:**
   - Store `artifactId` in `message.meta` when artifacts are created
   - Update MessageItem to prefer `message.meta.artifactId` over thread lookup

2. **WebSocket export updates:**
   - Replace polling with WebSocket notifications for export status
   - Reduces unnecessary API calls

3. **Document/Sheet rendering:**
   - Implement full rendering for document and spreadsheet artifacts
   - Add preview functionality

4. **Accessibility:**
   - Add ARIA labels for screen readers
   - Ensure keyboard navigation works for all interactive elements

5. **Performance:**
   - Virtualize large tables if needed
   - Optimize re-renders with React.memo where appropriate

## Testing Checklist

- [x] Artifact appears inline in chat
- [x] Card has its own scroll area (max-h ~55vh)
- [x] Auto-focus works on creation
- [x] Export buttons function correctly
- [x] Status polling works (Queued → Processing → Ready)
- [x] Copy CSV works for tables
- [x] Collapse/expand works
- [x] Empty state handling works
- [ ] Unit tests for ArtifactMessageCard
- [ ] Integration tests for MessageRenderer
- [ ] Snapshot tests for collapsed/expanded states

## Lines of Code Summary

- **ArtifactMessageCard.tsx**: ~360 LOC
- **scrollIntoViewAnchor.ts**: ~20 LOC
- **MessageItem.tsx**: ~20 LOC modified
- **uiStore.ts**: ~5 LOC added
- **artifactStore.ts**: ~15 LOC added
- **useChatStream.ts**: ~10 LOC modified

**Total**: ~430 LOC added/modified

