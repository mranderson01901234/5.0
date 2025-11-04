# Artifact Scroll Coupling - Findings Table

| Symptom | Suspected Cause | File:Line | CSS/Class | Owning Scroll Node | Severity | Fix Hypothesis (1 line) |
|---------|----------------|-----------|------------|-------------------|----------|-------------------------|
| Artifact pane scroll position changes when chat scrolls | Single scroll container pattern - only chat has `overflow-y-auto`, artifact has `overflow-hidden` at all levels | MainChatLayout.tsx:86<br>ArtifactPane.tsx:183,212,236,237 | Chat: `overflow-y-auto`<br>Artifact: `overflow-hidden` (all levels) | `.chat-container` div (MainChatLayout.tsx:86) | **High** | Change artifact content wrapper (ArtifactPane.tsx:236) from `overflow-hidden` to `overflow-y-auto` to enable independent scrolling |
| Artifact pane cannot scroll independently | Missing `overflow-y-auto` on artifact content container | ArtifactPane.tsx:236 | `flex-1 min-h-0 overflow-hidden` | None (artifact has no scroll) | **High** | Replace `overflow-hidden` with `overflow-y-auto` on line 236 to create scrollable artifact content area |
| Artifact content gets clipped when taller than viewport | Fixed-height parent (`<main>`) constrains both columns to same height | MainChatLayout.tsx:518 | `overflow-hidden` + `height: calc(100vh - 64px)` | N/A (parent constraint) | **High** | Ensure artifact pane has its own scroll container independent of chat, so content can scroll within fixed-height parent |
| Visual position of artifact shifts relative to viewport when chat grows | Sibling columns share fixed-height parent; chat scroll container expands vertically | MainChatLayout.tsx:518<br>SplitContainer.tsx:29<br>MainChatLayout.tsx:86 | `<main>`: `height: calc(100vh - 64px)`<br>Chat: `overflow-y-auto` | `.chat-container` (MainChatLayout.tsx:86) | **High** | Both columns need independent scroll containers; artifact pane should have `overflow-y-auto` on its content wrapper |
| Artifact pane aggressively prevents scroll events | Symptomatic workaround code forces `scrollTop = 0` every 100ms | ArtifactPane.tsx:30-128 | N/A (JavaScript enforcement) | N/A | **Medium** | Remove scroll prevention effects (lines 30-128) after fixing root cause; enable proper scrolling instead of blocking it |
| Redundant `overflow-hidden` enforcement | Inline styles override className with same `overflow-hidden` value | ArtifactPane.tsx:183-192<br>SplitContainer.tsx:43-49 | `className="...overflow-hidden"` + `style={{ overflow: 'hidden' }}` | N/A | **Medium** | Remove redundant inline `overflow: 'hidden'` styles; rely on className only for cleaner code |
| Artifact section element has `overflow-hidden` preventing content scroll | Deep nesting of `overflow-hidden` through all artifact wrapper layers | ArtifactPane.tsx:237 | `p-4 h-full overflow-hidden` | None | **Medium** | Remove `overflow-hidden` from section element (line 237) or change to `overflow-y-auto` if scrolling needed at this level |
| Chat scroll container has `paddingBottom: 200px` affecting layout | Large padding pushes content, potentially affecting artifact visual position | MainChatLayout.tsx:87 | `paddingBottom: '200px'` | `.chat-container` | **Low** | Verify if padding is necessary; consider reducing if it affects artifact pane positioning |
| SplitContainer right panel wrapper has `overflow-hidden` blocking scroll | Parent wrapper prevents child (ArtifactPane) from scrolling | SplitContainer.tsx:43 | `overflow-hidden flex flex-col` + inline `overflow: 'hidden'` | N/A | **High** | Right panel wrapper should allow scroll propagation; consider removing `overflow-hidden` or ensuring child has its own scroll context |
| ArtifactPane root div has `overflow-hidden` preventing scroll | Root-level block prevents any scrolling within artifact pane | ArtifactPane.tsx:183 | `overflow-hidden` + inline `overflow: 'hidden'` | N/A | **High** | Root div should allow scroll if children need it; consider `overflow-visible` or ensure scrollable child is properly configured |

## Summary Statistics

- **High Severity Issues**: 6
- **Medium Severity Issues**: 3
- **Low Severity Issues**: 1
- **Total Findings**: 10

## Primary Root Cause

**The artifact pane cannot scroll independently because it has `overflow-hidden` at every level of its DOM hierarchy, while the chat column has the only scrollable container (`overflow-y-auto`) in the entire layout. This creates a coupling where artifact visual position is affected by chat scroll behavior.**

## Recommended Fix Priority

1. **Immediate**: Change ArtifactPane.tsx:236 from `overflow-hidden` to `overflow-y-auto` to enable independent scrolling
2. **Immediate**: Remove redundant `overflow-hidden` from ArtifactPane.tsx:237 or change to `overflow-y-auto`
3. **Follow-up**: Remove scroll prevention effects (ArtifactPane.tsx:30-128) after enabling proper scrolling
4. **Follow-up**: Clean up redundant inline `overflow: 'hidden'` styles throughout codebase

