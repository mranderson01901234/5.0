# Artifact Scroll Fix Report

## Summary

Fixed artifact pane scroll isolation and auto-focus functionality. The artifact pane now has its own independent scroll container that doesn't interfere with chat scrolling. When an artifact is created or selected, the pane automatically scrolls to show it.

## Changes Made

### 1. SplitContainer.tsx

**File**: `apps/web/src/components/SplitContainer.tsx`

**Changes**:
- Removed inline `style` props from right panel wrapper that blocked scrolling:
  - Removed `overflow: 'hidden'`
  - Removed `overscrollBehavior: 'none'`
  - Removed `position: 'relative'`
- Removed `onWheel` handler that prevented scroll propagation

**Before**:
```tsx
<div
  className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
  style={{ 
    width: `${rightWidth}%`,
    overflow: 'hidden',
    overscrollBehavior: 'none',
    position: 'relative'
  }}
  onWheel={(e) => {
    // Prevent scroll from propagating to artifact pane
    const target = e.target as HTMLElement;
    if (target.closest('.artifact-pane')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }}
>
```

**After**:
```tsx
<div
  className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
  style={{ width: `${rightWidth}%` }}
>
```

### 2. ArtifactPane.tsx

**File**: `apps/web/src/components/ArtifactPane.tsx`

**Major Changes**:

#### Removed Anti-Scroll Hacks

- **Deleted entire useEffect** (lines 30-128) that included:
  - MutationObserver that repeatedly set `scrollTop = 0`
  - Interval that forced `scrollTop = 0` every 100ms
  - Wheel event preventDefault handlers
  - Touch event preventDefault handlers
  - Document-level scroll prevention

#### Structural Changes

**Root Container**:
- Removed inline styles blocking scroll:
  - `overflow: 'hidden'`
  - `overscrollBehavior: 'none'`
  - `touchAction: 'none'`
  - `willChange: 'transform'`
- Removed `onWheel`, `onTouchMove`, and `onScroll` handlers

**Before**:
```tsx
<div
  ref={paneRef}
  className="artifact-pane h-full min-h-0 flex flex-col bg-[#0f0f0f] border-l border-white/10 backdrop-blur-xl overflow-hidden"
  style={{ 
    width: `${width}%`, 
    overflow: 'hidden', 
    overscrollBehavior: 'none',
    position: 'relative',
    touchAction: 'none',
    WebkitOverflowScrolling: 'auto',
    willChange: 'transform'
  }}
  onWheel={(e) => { e.preventDefault(); ... }}
  onTouchMove={(e) => { e.preventDefault(); ... }}
  onScroll={(e) => { e.preventDefault(); ... }}
>
```

**After**:
```tsx
<div
  className="artifact-pane h-full min-h-0 flex flex-col bg-[#0f0f0f] border-l border-white/10 backdrop-blur-xl overflow-hidden"
  style={{ width: `${width}%` }}
>
```

**Header**:
- Changed from regular header to sticky header:
  - Added `sticky top-0 z-10` classes
  - Updated background to `bg-[#0f0f0f]/80 backdrop-blur`

**Before**:
```tsx
<header className="bg-neutral-900/80 backdrop-blur border-b border-white/10 flex-shrink-0">
```

**After**:
```tsx
<header className="sticky top-0 z-10 bg-[#0f0f0f]/80 backdrop-blur border-b border-white/10 flex-shrink-0">
```

**Content Wrapper**:
- Changed from `overflow-hidden` to `overflow-y-auto` scroll container
- Added `overscroll-contain scroll-smooth` for better UX
- Added `ref={scrollRef}` for auto-focus hook
- Removed inline `style` props blocking scroll

**Before**:
```tsx
<div className="flex-1 min-h-0 overflow-hidden" style={{ overflow: 'hidden', overscrollBehavior: 'none' }}>
  <section data-artifact-id={artifact.id} className="p-4 h-full overflow-hidden" style={{ overflow: 'hidden', overscrollBehavior: 'none' }}>
```

**After**:
```tsx
<div 
  ref={scrollRef}
  className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
>
  <section className="p-4" data-artifact-id={artifact.id}>
```

#### Renderer Components

Removed unnecessary overflow constraints from `TableRenderer`, `DocumentRenderer`, and `SheetRenderer`:

- Removed `h-full flex flex-col min-h-0 overflow-hidden` and inline styles
- Changed to simple `flex flex-col` layout
- Removed `overflow-hidden` from inner content divs

**Before**:
```tsx
<div className="h-full flex flex-col min-h-0 overflow-hidden" style={{ overflow: 'hidden', overscrollBehavior: 'none' }}>
  <div className="flex-1 overflow-hidden border border-white/10 rounded-lg min-h-0" style={{ overflow: 'hidden', overscrollBehavior: 'none' }}>
```

**After**:
```tsx
<div className="flex flex-col">
  <div className="border border-white/10 rounded-lg">
```

### 3. useAutoFocusArtifact Hook

**File**: `apps/web/src/hooks/useAutoFocusArtifact.ts` (NEW)

**Purpose**: Automatically scrolls artifact into view when `currentArtifactId` changes.

**Implementation**:
```tsx
export default function useAutoFocusArtifact(containerRef: React.RefObject<HTMLElement>) {
  const { currentArtifactId } = useUIStore();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !currentArtifactId) return;
    if (currentArtifactId === lastId.current) return;

    const el = containerRef.current.querySelector<HTMLElement>(`[data-artifact-id="${currentArtifactId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      lastId.current = currentArtifactId;
    } else {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      lastId.current = currentArtifactId;
    }
  }, [currentArtifactId, containerRef]);
}
```

### 4. Wire Hook in ArtifactPane

**File**: `apps/web/src/components/ArtifactPane.tsx`

**Changes**:
- Added import: `import useAutoFocusArtifact from "@/hooks/useAutoFocusArtifact";`
- Added hook call: `useAutoFocusArtifact(scrollRef);`
- Connected `scrollRef` to scroll container div

### 5. Tests

**File**: `apps/web/src/components/__tests__/ArtifactScroll.test.tsx` (NEW)

**Test Coverage**:
1. **Structure Test**: Verifies SplitContainer allows child scroll for both columns
2. **Scroll Container Test**: Ensures artifact pane has exactly one `overflow-y-auto` container
3. **No Overflow Hidden Test**: Confirms scroll container doesn't have `overflow-hidden`
4. **Sticky Header Test**: Verifies header has `sticky top-0` classes
5. **Data Attribute Test**: Checks `data-artifact-id` is present on artifact section
6. **Auto-focus Hook Test**: Verifies hook logic (simplified)

## Class Changes Summary

### SplitContainer.tsx
- Right panel: Removed inline `overflow: 'hidden'`, `overscrollBehavior: 'none'`, `position: 'relative'`
- Removed `onWheel` handler

### ArtifactPane.tsx
- Root: Removed inline `overflow: 'hidden'`, `overscrollBehavior: 'none'`, `touchAction: 'none'`, `willChange: 'transform'`
- Header: Added `sticky top-0 z-10`, changed background to `bg-[#0f0f0f]/80`
- Content wrapper: Changed from `overflow-hidden` to `overflow-y-auto`, added `overscroll-contain scroll-smooth`
- Section: Removed `h-full overflow-hidden`, removed inline styles
- Renderers: Removed `h-full overflow-hidden` patterns, simplified to `flex flex-col`

## Validation Steps

### Manual Testing

1. **Build & Run**:
   ```bash
   cd apps/web
   pnpm build
   pnpm dev
   ```

2. **Generate Long Chat**:
   - Create 200+ chat messages to force chat scroll
   - Verify chat scrolls independently

3. **Create Artifact**:
   - Create an artifact (table/doc/sheet)
   - Verify:
     - Split view opens automatically
     - Right pane shows sticky header
     - Content scrolls independently of chat
     - Artifact is scrolled into view automatically

4. **DevTools Verification**:
   - Open DevTools → Elements → Computed
   - Confirm artifact content div has `overflow-y: auto`
   - Run console command:
     ```js
     [...document.querySelectorAll('*')].filter(e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY))
       .map(e=>({node:e.className, h:e.clientHeight, oh:getComputedStyle(e).overflowY}))
     ```
   - Expected: Both chat scroll container and artifact content container listed

### Expected Console Output

The console command should show output like:
```js
[
  { node: "chat-container", h: 800, oh: "auto" },
  { node: "overflow-y-auto", h: 600, oh: "auto" }
]
```

### DOM Structure

**Artifact Pane Structure**:
```html
<div class="artifact-pane ... overflow-hidden">
  <div class="h-full min-h-0 flex flex-col overflow-hidden">
    <header class="sticky top-0 z-10 ...">
      <!-- Header content -->
    </header>
    <div ref={scrollRef} class="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth">
      <section class="p-4" data-artifact-id="artifact-123">
        <!-- Artifact content -->
      </section>
    </div>
  </div>
</div>
```

## Acceptance Criteria

- ✅ Artifact pane scrolls independently of chat
- ✅ On artifact creation or selection, pane auto-focuses the artifact
- ✅ No anti-scroll intervals or wheel blocking remain
- ✅ Chat behavior unchanged
- ✅ Typecheck passes (no linter errors)
- ✅ Tests pass

## Files Modified

1. `apps/web/src/components/SplitContainer.tsx`
2. `apps/web/src/components/ArtifactPane.tsx`
3. `apps/web/src/hooks/useAutoFocusArtifact.ts` (NEW)
4. `apps/web/src/components/__tests__/ArtifactScroll.test.tsx` (NEW)

## Notes

- The existing `useAutoOpenArtifact` hook in `MainChatLayout.tsx` remains unchanged - it handles auto-opening the split view, which is separate from scroll focus
- All renderer components (TableRenderer, DocumentRenderer, SheetRenderer) now use natural height instead of forced `h-full` constraints
- The scroll container uses `overscroll-contain` to prevent scroll chaining with chat
- Smooth scrolling is enabled for better UX

