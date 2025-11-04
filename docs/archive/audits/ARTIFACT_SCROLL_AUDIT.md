# Artifact Scroll Isolation Audit

**Date:** 2024-12-19  
**Purpose:** Analyze current scroll structure to identify issues preventing independent artifact pane scrolling

---

## DOM Hierarchy

### Current Structure (Split View)

```
MainChatLayout (line 447)
└── <div className="min-h-screen flex flex-col">
    └── <main className="pl-[48px] pt-16 flex-1 flex flex-col"> (line 461)
        └── SplitContainer (line 468)
            └── <div className="flex h-full w-full overflow-hidden"> (line 29)
                ├── Left Panel (Chat)
                │   └── <div className="flex-shrink-0 h-full overflow-hidden flex flex-col"> (line 32)
                │       └── ChatPanel (line 66)
                │           └── <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative">
                │               └── <div className="flex-1 overflow-y-auto chat-container relative"> (line 85)
                │                   └── MessageList
                │
                ├── Divider
                │
                └── Right Panel (Artifact)
                    └── <div className="flex-shrink-0 h-full overflow-hidden flex flex-col"> (line 43)
                        └── ArtifactPane (line 59)
                            └── <div className="artifact-pane h-full flex flex-col ... overflow-hidden">
                                └── <div className="flex-1 flex flex-col overflow-hidden p-4"> (line 65)
                                    └── <div className="flex-1 overflow-y-auto min-h-0"> (line 83)
                                        └── TableRenderer/DocumentRenderer/SheetRenderer
```

---

## Scroll Container Analysis

### Chat Scroll Container
- **Location:** `MainChatLayout.tsx:85`
- **CSS:** `flex-1 overflow-y-auto chat-container relative`
- **Parent Constraints:**
  - ChatPanel: `flex-1 flex flex-col h-full min-h-0 overflow-hidden relative` (line 66)
  - SplitContainer left panel: `overflow-hidden flex flex-col` (line 32)
  - SplitContainer root: `overflow-hidden` (line 29)
- **Status:** ✅ Has independent scroll via `overflow-y-auto`

### Artifact Scroll Container
- **Location:** `ArtifactPane.tsx:83`
- **CSS:** `flex-1 overflow-y-auto min-h-0`
- **Parent Constraints:**
  - ArtifactPane wrapper: `overflow-hidden` (line 59)
  - Inner wrapper: `overflow-hidden` (line 65)
  - SplitContainer right panel: `overflow-hidden flex flex-col` (line 43)
  - SplitContainer root: `overflow-hidden` (line 29)
- **Status:** ⚠️ Scroll exists but may be constrained by parent `overflow-hidden`

---

## Critical Issues Identified

### Issue 1: Parent Overflow Hidden Blocks Scroll
**Problem:** Both panels in `SplitContainer` use `overflow-hidden`, which prevents proper scrolling even when children have `overflow-y-auto`.

**Affected Files:**
- `SplitContainer.tsx:32` - Left panel: `overflow-hidden flex flex-col`
- `SplitContainer.tsx:43` - Right panel: `overflow-hidden flex flex-col`

**Impact:** While the scroll containers (`overflow-y-auto`) exist, the parent `overflow-hidden` can prevent scrollbars from appearing or functioning correctly in some layouts.

### Issue 2: Missing `min-h-0` on SplitContainer Panels
**Problem:** Flex children need `min-h-0` to allow scrolling. The panels have `h-full` but not `min-h-0`.

**Current:**
```tsx
// SplitContainer.tsx:32
<div className="flex-shrink-0 h-full overflow-hidden flex flex-col">
```

**Needed:**
```tsx
<div className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col">
```

### Issue 3: No Auto-Scroll on Artifact Selection
**Problem:** When an artifact is created or selected, there's no automatic scrolling to bring it into view.

**Affected Files:**
- `ArtifactPane.tsx` - No scroll-to-element logic
- Missing hook: `useArtifactAutoscroll.ts` (does not exist)

**Impact:** Users must manually scroll to see new artifacts, especially problematic with long chat histories.

### Issue 4: Shared Scroll Context Risk
**Problem:** Both scroll containers are siblings within the same flex container, but there's no explicit isolation mechanism. If any parent above `SplitContainer` had `overflow-y`, it would create a shared scroll.

**Status:** ✅ Currently safe - `MainChatLayout` main element uses `flex flex-col` without `overflow-y`, so no shared scroll exists.

---

## CSS Constraints Summary

### Height Constraints
| Element | CSS Classes | Has `min-h-0`? | Has `h-full`? | Has `overflow-y`? |
|---------|-------------|----------------|---------------|-------------------|
| MainChatLayout root | `min-h-screen flex flex-col` | ❌ | ❌ | ❌ |
| MainChatLayout main | `flex-1 flex flex-col` | ❌ | ❌ | ❌ |
| SplitContainer root | `flex h-full w-full overflow-hidden` | ❌ | ✅ | `hidden` |
| SplitContainer left | `flex-shrink-0 h-full overflow-hidden flex flex-col` | ❌ | ✅ | `hidden` |
| SplitContainer right | `flex-shrink-0 h-full overflow-hidden flex flex-col` | ❌ | ✅ | `hidden` |
| ChatPanel | `flex-1 flex flex-col h-full min-h-0 overflow-hidden` | ✅ | ✅ | `hidden` |
| Chat scroll | `flex-1 overflow-y-auto chat-container` | ❌ | ❌ | `auto` ✅ |
| ArtifactPane root | `h-full flex flex-col ... overflow-hidden` | ❌ | ✅ | `hidden` |
| ArtifactPane inner | `flex-1 flex flex-col overflow-hidden p-4` | ❌ | ❌ | `hidden` |
| Artifact scroll | `flex-1 overflow-y-auto min-h-0` | ✅ | ❌ | `auto` ✅ |

### Overflow Analysis
- ✅ **No shared scroll wrapper** - No ancestor has `overflow-y-auto` that wraps both chat and artifact
- ⚠️ **Parent overflow-hidden** - May interfere with child scrollbars
- ✅ **Independent scroll containers** - Chat and artifact each have their own `overflow-y-auto`

---

## Scroll Sync Code

**Current State:** No scroll synchronization code exists between chat and artifact panes.

**Files Checked:**
- `MessageList.tsx` - Only handles chat scroll, no artifact interaction
- `ArtifactPane.tsx` - No scroll logic
- `SplitContainer.tsx` - No scroll logic
- `MainChatLayout.tsx` - No scroll logic

---

## Recommendations

### Phase 2 Fixes Required:

1. **Add `min-h-0` to SplitContainer panels** to allow proper flex scrolling
   ```tsx
   // SplitContainer.tsx
   <div className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col">
   ```

2. **Ensure artifact scroll container has proper isolation**
   ```tsx
   // ArtifactPane.tsx
   <div className="h-full min-h-0">
     <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto overscroll-contain scroll-smooth">
   ```

3. **Remove unnecessary `overflow-hidden` from SplitContainer panels** (or change to allow scrolling)
   - Keep `overflow-hidden` on root to prevent horizontal scroll
   - Panels should allow vertical scrolling via children

### Phase 3 Implementation:

1. Create `useArtifactAutoscroll.ts` hook
2. Add `data-artifact-id` attributes to artifact renderers
3. Wire hook into `ArtifactPane.tsx`

### Phase 4 Structure:

1. Add sticky header to artifact pane
2. Ensure header doesn't interfere with scroll targeting

---

## Test Cases Needed

1. **Independent Scroll Test:** Scroll chat, verify artifact pane doesn't move
2. **Auto-Scroll Test:** Create artifact, verify pane scrolls to it
3. **Long Chat Test:** With 200+ messages, create artifact, verify it's visible
4. **Toggle Test:** Close and reopen split view, verify artifact scrolls into view

---

## File References

- `apps/web/src/components/SplitContainer.tsx` - Lines 28-49
- `apps/web/src/components/ArtifactPane.tsx` - Lines 58-101
- `apps/web/src/layouts/MainChatLayout.tsx` - Lines 447-509
- `apps/web/src/store/uiStore.ts` - Lines 1-55

---

**Next Steps:** Proceed with Phase 2 fixes to isolate scroll containers.

