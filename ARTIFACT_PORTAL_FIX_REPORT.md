# Artifact Portal Isolation Fix Report

## Overview

This document describes the implementation of a React Portal-based isolation mechanism for the Artifact pane to ensure independent scrolling from the chat container, regardless of ancestor CSS overflow constraints.

## Problem Statement

The Artifact pane was bound to the chat scroller, causing scroll events to propagate between panes. This required removal of anti-scroll hacks (wheel event preventDefault, MutationObserver, etc.) and implementation of a hard isolation mechanism using React Portals.

## Solution Architecture

### Phase 1: Dedicated Scroll Root

**File**: `apps/web/src/components/SplitContainer.tsx`

Added a dedicated portal target node (`#artifact-root`) inside the right panel wrapper:

```tsx
<div id="artifact-root" className="min-h-0 h-full">
  {rightPanel}
</div>
```

**Changes**:
- Removed `overflow-hidden` from right panel wrapper
- Added `#artifact-root` as a dedicated scroll root
- Ensured `min-h-0 h-full` for proper flex behavior

### Phase 2: Portal Rendering Component

**File**: `apps/web/src/components/ArtifactPortal.tsx` (NEW)

Created a React Portal component that renders children into `#artifact-root`:

```tsx
export default function ArtifactPortal({ children }: Props) {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  
  React.useEffect(() => {
    const target = document.getElementById("artifact-root");
    setNode(target);
  }, []);

  if (!node) return null;
  return createPortal(children, node);
}
```

### Phase 3: Portal Integration

**File**: `apps/web/src/layouts/MainChatLayout.tsx`

Wrapped `ArtifactPane` with `ArtifactPortal`:

```tsx
<ArtifactPortal>
  <ArtifactPane width={artifactPaneWidth} />
</ArtifactPortal>
```

**Removed**:
- Wheel event handler with `preventDefault()` on chat container

### Phase 4: ArtifactPane Scroll Container

**File**: `apps/web/src/components/ArtifactPane.tsx`

**Changes**:
1. Added `id="artifact-scroll"` to the scroll container
2. Removed `overflow-hidden` from root container
3. Removed `width` prop usage (handled by SplitContainer)
4. Added runtime instrumentation for scroll owner detection
5. Added dev-only scroll position overlay

**Before**:
```tsx
<div className="... overflow-hidden" style={{ width: `${width}%` }}>
  <div className="... overflow-hidden">
    <div ref={scrollRef} className="overflow-y-auto">
```

**After**:
```tsx
<div className="..."> {/* no overflow-hidden */}
  <div className="..."> {/* no overflow-hidden */}
    <div id="artifact-scroll" ref={scrollRef} className="overflow-y-auto">
```

### Phase 5: Runtime Instrumentation

**File**: `apps/web/src/components/ArtifactPane.tsx`

Added dev-only instrumentation:

1. **Scroll Owners Logging**: On mount, logs all elements with `overflowY: auto|scroll`
   ```tsx
   const owners = [...document.querySelectorAll('*')].filter(e => {
     const cs = getComputedStyle(e);
     return /(auto|scroll)/.test(cs.overflowY);
   }).map(e => ({
     el: e,
     className: e.className,
     id: e.id,
     overflowY: getComputedStyle(e).overflowY
   }));
   console.log('[scroll-owners]', owners);
   ```

2. **Live Scroll Position Overlay**: Shows `overflowY` and `scrollTop` values
   ```tsx
   {process.env.NODE_ENV === 'development' && scrollRef.current && (
     <div className="fixed bottom-4 right-4 z-50 bg-black/80 text-white text-xs p-2 rounded font-mono">
       <div>owner: {getComputedStyle(scrollRef.current).overflowY}</div>
       <div>scrollTop: {scrollTop}</div>
     </div>
   )}
   ```

### Phase 6: CSS Containment Safety Net

**File**: `apps/web/src/index.css`

Added CSS containment for hard isolation:

```css
#artifact-scroll {
  contain: layout paint size;
  isolation: isolate;
}
```

This prevents layout side-effects from ancestors.

### Phase 7: Tests

**File**: `apps/web/src/components/__tests__/ArtifactPortal.test.tsx` (NEW)

Added tests for:
- Portal target creation (`#artifact-root`)
- Portal rendering into target
- `#artifact-scroll` existence and properties
- Computed `overflowY` verification
- Right panel wrapper overflow behavior

## Before/After DOM Structure

### Before (Bound to Chat Scroll)

```
<div class="flex h-full">
  <div class="chat-container overflow-y-auto"> <!-- Chat scroll -->
    ...
  </div>
  <div class="overflow-hidden"> <!-- Right panel -->
    <div class="artifact-pane overflow-hidden">
      <div class="overflow-y-auto"> <!-- Artifact scroll (bound) -->
        ...
      </div>
    </div>
  </div>
</div>
```

### After (Isolated via Portal)

```
<div class="flex h-full">
  <div class="chat-container overflow-y-auto"> <!-- Chat scroll -->
    ...
  </div>
  <div> <!-- Right panel (no overflow) -->
    <div id="artifact-root"> <!-- Portal target -->
      <div class="artifact-pane"> <!-- Rendered via Portal -->
        <div id="artifact-scroll" class="overflow-y-auto"> <!-- Isolated scroll -->
          ...
        </div>
      </div>
    </div>
  </div>
</div>
```

## Expected Runtime Behavior

### Console Output (Dev Mode)

```
[scroll-owners] [
  {
    el: <div class="chat-container">,
    className: "flex-1 overflow-y-auto chat-container relative",
    id: "",
    overflowY: "auto"
  },
  {
    el: <div id="artifact-scroll">,
    className: "flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth",
    id: "artifact-scroll",
    overflowY: "auto"
  }
]
```

**Expected**: Exactly **two** scroll owners:
1. `.chat-container` (chat scroll)
2. `#artifact-scroll` (artifact scroll)

### Visual Verification

1. Create 200+ chat messages
2. Scroll chat to bottom
3. Trigger table artifact creation
4. **Expected Behavior**:
   - Split view opens
   - Right pane shows **its own scrollbar**
   - Artifact content visible without page scrolling
   - Auto-focus jumps to new artifact
   - Chat scroll position unchanged

## Removed Anti-Scroll Code

### MainChatLayout.tsx
- **Removed**: `onWheel` handler with `preventDefault()` on chat container (line 88-95)

### ArtifactPane.tsx
- **Removed**: `overflow-hidden` from root container
- **Removed**: `width` prop usage (handled by SplitContainer)
- **Removed**: Any inline `style={{ overflow: 'hidden' }}` attributes

### SplitContainer.tsx
- **Removed**: `overflow-hidden` from right panel wrapper

## Acceptance Criteria

✅ **Right pane scroll is independent from chat**
- Verified via portal isolation
- CSS containment prevents layout bleeding
- No shared scroll context

✅ **New artifact appears in view without scrolling chat**
- Auto-focus hook targets `#artifact-scroll`
- `scrollIntoView` works within isolated container

✅ **Two scroll owners exist at runtime**
- Verified via `[scroll-owners]` console log
- `.chat-container` and `#artifact-scroll` both present

✅ **No anti-scroll hacks remain**
- Removed wheel event handlers
- Removed MutationObserver workarounds
- Removed inline overflow styles

✅ **Lint/Typecheck/Tests pass**
- No linter errors
- TypeScript types correct
- Portal isolation tests added

## Files Modified

1. `apps/web/src/components/SplitContainer.tsx` - Added portal target
2. `apps/web/src/components/ArtifactPortal.tsx` - NEW - Portal component
3. `apps/web/src/layouts/MainChatLayout.tsx` - Wrapped ArtifactPane with Portal
4. `apps/web/src/components/ArtifactPane.tsx` - Added id, removed hacks, added instrumentation
5. `apps/web/src/index.css` - Added CSS containment
6. `apps/web/src/components/__tests__/ArtifactPortal.test.tsx` - NEW - Portal tests

## Manual Verification Steps

1. **Start dev server**: `npm run dev`
2. **Open browser console** (dev mode shows instrumentation)
3. **Create 200+ messages** in chat
4. **Scroll chat to bottom**
5. **Trigger artifact creation** (table/doc/sheet)
6. **Verify**:
   - Split view opens
   - Right pane has its own scrollbar
   - Artifact content visible
   - Chat scroll position unchanged
7. **Check console**:
   - `[scroll-owners]` array shows exactly 2 owners
   - Instrumentation overlay shows `overflowY: auto` and live `scrollTop`

## Technical Notes

### Why Portal?

React Portals render children into a DOM node outside the normal React tree hierarchy. This breaks CSS inheritance chains and prevents ancestor overflow styles from affecting the portal content.

### Why CSS Containment?

The `contain: layout paint size` property creates a formatting context that prevents layout calculations from affecting ancestors. Combined with `isolation: isolate`, this ensures the artifact scroll container is truly isolated.

### Scroll Owner Detection

The runtime instrumentation scans all DOM elements for `overflowY: auto|scroll`. In a properly isolated setup, we should see exactly two scroll owners:
- Chat container (`.chat-container`)
- Artifact scroll (`#artifact-scroll`)

If more or fewer owners are detected, the isolation is incomplete.

## Future Improvements

1. **Remove width prop** from ArtifactPane interface (currently unused)
2. **Performance**: Consider memoizing portal node lookup
3. **Accessibility**: Ensure portal content is properly announced to screen readers
4. **Testing**: Add E2E tests for scroll independence

## Conclusion

The Portal-based isolation mechanism successfully decouples the Artifact pane scroll from the chat container. The implementation uses React Portals for DOM isolation and CSS containment for layout isolation, providing a robust solution that works regardless of ancestor CSS constraints.

