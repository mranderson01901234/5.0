# ARTIFACT_CONTAINER_AUDIT.md

## Exact DOM Tree for Artifact Pane

### Mount Point to First Renderable Content

```
<div id="artifact-root" className="min-h-0 h-full relative">
├─ file: apps/web/src/components/SplitContainer.tsx:47
├─ computed overflow: hidden (inherited from parent SplitContainer)
├─ computed height: 100% (of parent right panel)
├─ computed min-height: 0
├─ computed position: relative
├─ sticky headers: none
├─ portals: none (this IS the portal target)
└─ inline overflow styles: none

  └─ [React Portal Target - ArtifactPortal renders here]
      └─ <div className="artifact-pane h-full min-h-0 flex flex-col bg-[#0f0f0f] 
                          border-l border-white/10 backdrop-blur-xl overflow-hidden">
          ├─ file: apps/web/src/components/ArtifactPane.tsx:100-104
          ├─ computed overflow: hidden (CRITICAL: blocks scroll)
          ├─ computed height: 100% (h-full)
          ├─ computed min-height: 0
          ├─ computed position: static
          ├─ inline overflow styles: none (CSS class only)
          ├─ sticky headers: none
          ├─ portals: none
          └─ JS scroll manipulation: none (read-only)

          └─ <div className="h-full min-h-0 flex flex-col">
              ├─ file: apps/web/src/components/ArtifactPane.tsx:106
              ├─ computed overflow: hidden (inherited from parent)
              ├─ computed height: 100%
              ├─ computed min-height: 0
              ├─ computed position: static
              ├─ sticky headers: none
              ├─ portals: none
              └─ inline overflow styles: none

              ├─ <header className="sticky top-0 z-10 bg-[#0f0f0f]/80 backdrop-blur 
                                     border-b border-white/10 flex-shrink-0">
              │   ├─ file: apps/web/src/components/ArtifactPane.tsx:108
              │   ├─ computed overflow: visible (default)
              │   ├─ computed position: sticky
              │   ├─ computed top: 0
              │   ├─ computed z-index: 10
              │   ├─ sticky headers: YES (this is sticky)
              │   └─ inline overflow styles: none

              └─ <div id="artifact-scroll" ref={scrollRef}
                       className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  ├─ file: apps/web/src/components/ArtifactPane.tsx:130-133
                  ├─ computed overflow-y: auto (SCROLL OWNER)
                  ├─ computed overflow-x: hidden (from index.css:540)
                  ├─ computed height: flex: 1 (fills remaining space)
                  ├─ computed min-height: 0
                  ├─ computed position: static
                  ├─ sticky headers: none
                  ├─ portals: none
                  ├─ inline overflow styles: none
                  ├─ JS scroll manipulation: YES (see below)
                  └─ event listeners: scroll event (ArtifactPane.tsx:64)

                  └─ <section className="p-4" data-artifact-id={artifact.id}>
                      ├─ file: apps/web/src/components/ArtifactPane.tsx:135
                      ├─ computed overflow: visible (default)
                      ├─ computed height: auto (content height)
                      ├─ computed min-height: 0
                      ├─ computed position: static
                      ├─ sticky headers: none
                      ├─ portals: none
                      └─ inline overflow styles: none

                      └─ [Renderable Content - TableRenderer/DocumentRenderer/SheetRenderer]
                          ├─ file: apps/web/src/components/ArtifactPane.tsx:136-146
                          └─ First renderable node: <div className="flex flex-col"> (TableRenderer:186)
```

## Overflow-Hidden Locations

### Inline Styles with `overflow: hidden`:
- **None found** - all overflow-hidden comes from CSS classes

### CSS Classes with `overflow-hidden`:
1. **artifact-pane** (ArtifactPane.tsx:101)
   - Applied at: `<div className="artifact-pane ... overflow-hidden">`
   - Effect: Blocks scrolling at pane level
   - Override: `index.css:533` also sets `overflow: hidden`

2. **SplitContainer** (SplitContainer.tsx:29)
   - Applied at: `<div className="flex ... overflow-hidden">`
   - Effect: Blocks scrolling at split container level
   - Parent of artifact-root

3. **Chat content wrapper** (MainChatLayout.tsx:85)
   - Applied at: `<div className="flex-1 flex flex-col min-h-0 overflow-hidden">`
   - Effect: Blocks scrolling at chat wrapper level (not artifact, but sibling)

4. **main#main** (MainChatLayout.tsx:511)
   - Applied at: `<main className="... overflow-hidden">`
   - Effect: Blocks scrolling at main level (parent of split container)

## JavaScript Scroll Manipulation

### Direct scrollTop Assignment:
1. **useAutoOpenArtifact.ts:86-89**
   ```javascript
   artifactPane.scrollTop = 0;
   contentSection.scrollTop = 0;
   ```
   - Location: `apps/web/src/hooks/useAutoOpenArtifact.ts:86-89`
   - Trigger: When artifact is auto-opened
   - Target: `.artifact-pane` element (WRONG TARGET - should be `#artifact-scroll`)

2. **useChatStream.ts:394-397**
   ```javascript
   artifactPane.scrollTop = 0;
   contentSection.scrollTop = 0;
   ```
   - Location: `apps/web/src/hooks/useChatStream.ts:394-397`
   - Trigger: After artifact creation
   - Target: `.artifact-pane` element (WRONG TARGET - should be `#artifact-scroll`)

### scrollIntoView Calls:
1. **useAutoFocusArtifact.ts:18**
   ```javascript
   el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
   ```
   - Location: `apps/web/src/hooks/useAutoFocusArtifact.ts:18`
   - Trigger: When currentArtifactId changes
   - Target: `[data-artifact-id="${currentArtifactId}"]` element
   - Container: `scrollRef.current` (points to `#artifact-scroll`)

2. **useAutoFocusArtifact.ts:22**
   ```javascript
   containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
   ```
   - Location: `apps/web/src/hooks/useAutoFocusArtifact.ts:22`
   - Trigger: When artifact element not found
   - Target: `scrollRef.current` (points to `#artifact-scroll`)

### scrollTo Calls:
1. **useAutoFocusArtifact.ts:22**
   - See above

### scrollBy Calls:
- **None found** in artifact-related code

## Event Listeners

### Scroll Event Listeners:
1. **ArtifactPane.tsx:64**
   ```javascript
   container.addEventListener('scroll', handleScroll);
   ```
   - Location: `apps/web/src/components/ArtifactPane.tsx:64`
   - Target: `scrollRef.current` (`#artifact-scroll`)
   - Purpose: Track scrollTop for dev instrumentation overlay
   - Passive: No (default)

### Wheel/Touch Event Interception:
- **None found** in artifact-related code

### MutationObserver/Intervals:
- **None found** affecting scroll

## CSS Rules Affecting Artifact Scroll

### From index.css:

1. **Lines 38-45**: `.chat-container, #artifact-scroll`
   ```css
   overflow-y: auto !important;
   overflow-x: hidden !important;
   -webkit-overflow-scrolling: touch !important;
   overscroll-behavior: contain !important;
   position: relative !important;
   will-change: scroll-position !important;
   ```
   - Applies to: `#artifact-scroll`
   - Effect: Forces scrolling, prevents horizontal scroll

2. **Lines 476-479**: `#artifact-scroll`
   ```css
   contain: layout paint;
   isolation: isolate;
   ```
   - Effect: CSS containment (no scroll impact)

3. **Lines 532-535**: `.artifact-pane`
   ```css
   overflow: hidden;
   overscroll-behavior: contain;
   ```
   - Effect: Blocks pane-level scroll

4. **Lines 538-545**: `#artifact-scroll`
   ```css
   overflow-y: auto !important;
   overflow-x: hidden !important;
   overscroll-behavior: contain;
   -webkit-overflow-scrolling: touch;
   touch-action: pan-y;
   scroll-behavior: smooth;
   ```
   - Effect: Multiple rules - forces vertical scroll, prevents horizontal, smooth scrolling

## Height Constraints in Artifact Subtree

1. **artifact-root**: `h-full` (100% of parent)
   - File: SplitContainer.tsx:47

2. **artifact-pane**: `h-full` (100% of artifact-root)
   - File: ArtifactPane.tsx:101

3. **artifact content wrapper**: `h-full` (100% of artifact-pane)
   - File: ArtifactPane.tsx:106

4. **artifact-scroll**: `flex-1` (fills remaining space after header)
   - File: ArtifactPane.tsx:133

5. **All containers**: `min-h-0` (allows flex children to shrink below content size)
   - Critical for flex scrolling to work

## Summary

### Scroll Container:
- **Element**: `#artifact-scroll` (div with id="artifact-scroll")
- **Location**: `apps/web/src/components/ArtifactPane.tsx:130-133`
- **CSS**: `overflow-y: auto` (from className + index.css:539)
- **Parent overflow**: `hidden` on `.artifact-pane` (blocks pane-level scroll)

### JS Scroll Manipulation Issues:
1. **Wrong target**: `useAutoOpenArtifact.ts` and `useChatStream.ts` try to set `scrollTop` on `.artifact-pane` (which has `overflow-hidden`), not `#artifact-scroll`
2. **Correct target**: `useAutoFocusArtifact.ts` correctly uses `scrollRef` which points to `#artifact-scroll`

### Overflow Blockers:
- `.artifact-pane` has `overflow-hidden` (blocks pane-level scroll, allows child scroll)
- `SplitContainer` has `overflow-hidden` (blocks split-level scroll)
- `main#main` has `overflow-hidden` (blocks main-level scroll)

