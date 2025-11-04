# Artifact Scroll Coupling - Root Cause Analysis

## Summary

The Artifact pane's scroll position is coupled to chat length because **the chat column owns the only scrollable container (`overflow-y-auto`) in the entire layout hierarchy**. The artifact pane has `overflow-hidden` applied at every level, preventing it from having its own independent scroll context. When chat messages grow, the chat's scroll container (`chat-container` with `overflow-y-auto`) expands vertically, and since both columns are siblings within a fixed-height parent (`<main>` with `height: calc(100vh - 64px)`), the artifact pane's visual position shifts relative to the viewport as the chat scrolls. Additionally, the artifact pane's aggressive scroll prevention code (lines 30-128 in ArtifactPane.tsx) attempts to force `scrollTop = 0` on the pane and its children every 100ms, but this doesn't address the underlying layout issue where the artifact content is positioned relative to the chat's scroll container rather than having its own scrollable viewport.

## DOM Hierarchy

```
<html>
└── <body> (no overflow, position: relative)
    └── <div className="min-h-screen"> (App.tsx:24)
        └── <ErrorBoundary>
            └── <BrowserRouter>
                └── <Routes>
                    └── <MainChatLayout>
                        └── <div className="min-h-screen flex flex-col"> (MainChatLayout.tsx:504)
                            ├── <Sidebar/>
                            ├── <TopBar/>
                            └── <main id="main" className="pl-[48px] pt-16 flex-1 flex flex-col min-h-0 overflow-hidden" 
                                    style={{ overflow: 'hidden', height: 'calc(100vh - 64px)' }}> (MainChatLayout.tsx:518)
                                │   └─ FIXED HEIGHT: calc(100vh - 64px)
                                │   └─ OVERFLOW: hidden
                                │
                                └── [splitView=true branch]
                                    └── <SplitContainer> (MainChatLayout.tsx:525)
                                        │   └─ className: "flex h-full w-full min-h-0 overflow-hidden" (SplitContainer.tsx:29)
                                        │   └─ OVERFLOW: hidden
                                        │
                                        ├── Left Panel (Chat) (SplitContainer.tsx:31-36)
                                        │   └─ className: "flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
                                        │   └─ style: width: ${leftWidth}%
                                        │   └─ OVERFLOW: hidden
                                        │   └── <ChatPanel>
                                        │       └── <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative"> (MainChatLayout.tsx:66)
                                        │           └─ OVERFLOW: hidden
                                        │           └── <div className="flex-1 flex flex-col min-h-0 overflow-hidden"> (MainChatLayout.tsx:84)
                                        │               └─ OVERFLOW: hidden
                                        │               └── <div className="flex-1 overflow-y-auto chat-container relative"> (MainChatLayout.tsx:86)
                                        │                   └─ ⚠️ SCROLL CONTAINER: overflow-y-auto
                                        │                   └─ This is the ONLY element with scrolling enabled
                                        │                   └── <MessageList />
                                        │
                                        ├── <Divider/> (SplitContainer.tsx:39)
                                        │
                                        └── Right Panel (Artifact) (SplitContainer.tsx:42-60)
                                            └─ className: "flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
                                            └─ style: overflow: 'hidden'
                                            └─ OVERFLOW: hidden
                                            └── <ArtifactPane width={artifactPaneWidth}> (MainChatLayout.tsx:538)
                                                └─ className: "artifact-pane h-full min-h-0 flex flex-col ... overflow-hidden" (ArtifactPane.tsx:183)
                                                └─ style: overflow: 'hidden'
                                                └─ OVERFLOW: hidden (all levels)
                                                └── <div className="h-full min-h-0 flex flex-col overflow-hidden"> (ArtifactPane.tsx:212)
                                                    └─ OVERFLOW: hidden
                                                    └── <header> (ArtifactPane.tsx:214)
                                                    └── <div className="flex-1 min-h-0 overflow-hidden"> (ArtifactPane.tsx:236)
                                                        └─ OVERFLOW: hidden
                                                        └── <section data-artifact-id className="p-4 h-full overflow-hidden"> (ArtifactPane.tsx:237)
                                                            └─ OVERFLOW: hidden
                                                            └── [Artifact content - TableRenderer/DocumentRenderer/SheetRenderer]
                                                                └─ All have overflow-hidden enforced
```

**Key Finding**: The chat column's `overflow-y-auto` div (MainChatLayout.tsx:86) is the **only scrollable element**. The artifact pane has `overflow-hidden` at every level, preventing independent scrolling.

## Scroll Containers Map

| Element | File:Line | CSS Classes | Inline Styles | Overflow | Height Constraints | Owns Scroll? |
|---------|-----------|-------------|---------------|----------|-------------------|--------------|
| `<main>` | MainChatLayout.tsx:518 | `flex-1 flex flex-col min-h-0 overflow-hidden` | `overflow: 'hidden', height: 'calc(100vh - 64px)'` | `hidden` | Fixed: `calc(100vh - 64px)` | ❌ No |
| SplitContainer root | SplitContainer.tsx:29 | `flex h-full w-full min-h-0 overflow-hidden` | None | `hidden` | `h-full` | ❌ No |
| Left panel wrapper | SplitContainer.tsx:32 | `flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col` | `width: ${leftWidth}%` | `hidden` | `h-full` | ❌ No |
| ChatPanel root | MainChatLayout.tsx:66 | `flex-1 flex flex-col h-full min-h-0 overflow-hidden relative` | None | `hidden` | `h-full` | ❌ No |
| ChatPanel inner | MainChatLayout.tsx:84 | `flex-1 flex flex-col min-h-0 overflow-hidden` | None | `hidden` | `flex-1` | ❌ No |
| **Chat scroll container** | **MainChatLayout.tsx:86** | **`flex-1 overflow-y-auto chat-container relative`** | **`paddingBottom: '200px'`** | **`auto`** | **`flex-1`** | **✅ YES** |
| Right panel wrapper | SplitContainer.tsx:43 | `flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col` | `overflow: 'hidden'` | `hidden` | `h-full` | ❌ No |
| ArtifactPane root | ArtifactPane.tsx:183 | `artifact-pane h-full min-h-0 flex flex-col ... overflow-hidden` | `overflow: 'hidden'` | `hidden` | `h-full` | ❌ No |
| ArtifactPane inner | ArtifactPane.tsx:212 | `h-full min-h-0 flex flex-col overflow-hidden` | `overflow: 'hidden'` | `hidden` | `h-full` | ❌ No |
| ArtifactPane content | ArtifactPane.tsx:236 | `flex-1 min-h-0 overflow-hidden` | `overflow: 'hidden'` | `hidden` | `flex-1` | ❌ No |
| ArtifactPane section | ArtifactPane.tsx:237 | `p-4 h-full overflow-hidden` | `overflow: 'hidden'` | `hidden` | `h-full` | ❌ No |

**Conclusion**: Only one element owns vertical scroll: the chat container at MainChatLayout.tsx:86.

## CSS/Utility Sources

### MainChatLayout.tsx

**Line 518** - `<main>` element:
```tsx
className="pl-[48px] pt-16 flex-1 flex flex-col min-h-0 overflow-hidden"
style={{ overflow: 'hidden', height: 'calc(100vh - 64px)' }}
```
- **Effect**: Creates fixed-height container preventing any child from extending beyond viewport
- **Issue**: Both chat and artifact are constrained to this fixed height

**Line 66** - ChatPanel root wrapper:
```tsx
className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative"
```
- **Effect**: `overflow-hidden` prevents this div from scrolling
- **Issue**: Forces scroll to happen deeper in the tree

**Line 84** - ChatPanel inner wrapper:
```tsx
className="flex-1 flex flex-col min-h-0 overflow-hidden"
```
- **Effect**: Another `overflow-hidden` layer
- **Issue**: Continues blocking scroll propagation

**Line 86** - Chat scroll container:
```tsx
className="flex-1 overflow-y-auto chat-container relative"
style={{ paddingBottom: '200px' }}
```
- **Effect**: **This is the only scrollable element**
- **Issue**: When chat messages grow, this container's `scrollHeight` increases, affecting the visual layout of sibling columns

### SplitContainer.tsx

**Line 29** - Root container:
```tsx
className="flex h-full w-full min-h-0 overflow-hidden"
```
- **Effect**: `overflow-hidden` prevents scroll at this level
- **Issue**: Blocks any scroll from bubbling up or affecting layout

**Line 32** - Left panel wrapper:
```tsx
className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
```
- **Effect**: `overflow-hidden` prevents scroll
- **Issue**: Forces scroll to happen inside ChatPanel children

**Line 43** - Right panel wrapper:
```tsx
className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
style={{ overflow: 'hidden', overscrollBehavior: 'none', position: 'relative' }}
```
- **Effect**: Explicit `overflow: 'hidden'` in both className and inline style
- **Issue**: Artifact pane cannot scroll because parent blocks it

### ArtifactPane.tsx

**Line 183** - Root div:
```tsx
className="artifact-pane h-full min-h-0 flex flex-col bg-[#0f0f0f] border-l border-white/10 backdrop-blur-xl overflow-hidden"
style={{ width: `${width}%`, overflow: 'hidden', overscrollBehavior: 'none', position: 'relative', touchAction: 'none' }}
```
- **Effect**: `overflow-hidden` prevents scroll at artifact pane root
- **Issue**: Artifact content cannot scroll independently

**Line 212** - Inner wrapper:
```tsx
className="h-full min-h-0 flex flex-col overflow-hidden"
style={{ overflow: 'hidden', overscrollBehavior: 'none' }}
```
- **Effect**: Another `overflow-hidden` layer
- **Issue**: Continues blocking scroll

**Line 236** - Content wrapper:
```tsx
className="flex-1 min-h-0 overflow-hidden"
style={{ overflow: 'hidden', overscrollBehavior: 'none' }}
```
- **Effect**: Third `overflow-hidden` layer
- **Issue**: All scroll paths blocked

**Line 237** - Section element:
```tsx
className="p-4 h-full overflow-hidden"
style={{ overflow: 'hidden', overscrollBehavior: 'none' }}
```
- **Effect**: Fourth `overflow-hidden` layer
- **Issue**: Even content cannot scroll

**Lines 30-128** - Scroll prevention effects:
```tsx
React.useEffect(() => {
  // ... aggressive scroll prevention code
  const forceScrollTop = () => {
    if (pane.scrollTop !== 0) {
      pane.scrollTop = 0;
    }
    // ... force all children to scrollTop = 0
  };
  const intervalId = setInterval(forceScrollTop, 100);
}, [artifact]);
```
- **Effect**: Attempts to force `scrollTop = 0` every 100ms
- **Issue**: Symptomatic fix that doesn't address root cause; indicates developers already aware of scroll coupling issue

## Mount Point & Selection

### Mount Point

**ArtifactPane** mounts at:
- **File**: `apps/web/src/components/ArtifactPane.tsx`
- **Rendered in**: `MainChatLayout.tsx` line 538
- **Parent**: `<SplitContainer>` right panel wrapper (SplitContainer.tsx:42-60)
- **Sibling**: ChatPanel (left panel)

**Key Finding**: ArtifactPane and ChatPanel are **siblings** within SplitContainer, which is inside `<main>` with fixed height. They do NOT share the same scroll container, but they ARE constrained by the same parent height.

### Selection Flow

**Artifact selection** (from artifactStore.ts and uiStore.ts):
1. User creates artifact → `useArtifactStore.addArtifact()` or `createTableArtifact()` (artifactStore.ts:53-74)
2. Store updates → `currentArtifactId` set via `useUIStore.setCurrentArtifact()` (uiStore.ts:44)
3. `useAutoOpenArtifact` hook (MainChatLayout.tsx:193) auto-opens split view when artifact created
4. Split view opens → `splitView = true` (uiStore.ts:38)
5. ArtifactPane renders → reads `currentArtifactId` from `useUIStore()` (ArtifactPane.tsx:20)
6. ArtifactPane finds artifact via `getArtifactById(currentArtifactId)` (ArtifactPane.tsx:28)

**No Portal Usage**: ArtifactPane does NOT use `ReactDOM.createPortal`. It mounts directly in the DOM tree as a sibling to ChatPanel.

## Constraints & Anti-patterns Found

### 1. Single Scroll Container Pattern (HIGH SEVERITY)

**Location**: MainChatLayout.tsx:86

**Issue**: Only the chat column has `overflow-y-auto`. Artifact pane has `overflow-hidden` at every level.

**Why it causes coupling**: When chat messages grow, the chat scroll container's `scrollHeight` increases. Since both columns are flex children of a fixed-height parent (`<main>` with `height: calc(100vh - 64px)`), the artifact pane's visual position can shift relative to the viewport as the chat scrolls.

**Evidence**: 
- MainChatLayout.tsx:86 has the only `overflow-y-auto` in the layout
- ArtifactPane.tsx:183, 212, 236, 237 all have `overflow-hidden`

### 2. Fixed Height Parent Constraint (HIGH SEVERITY)

**Location**: MainChatLayout.tsx:518

**Issue**: `<main>` has `height: calc(100vh - 64px)` with `overflow-hidden`, creating a fixed-height viewport.

**Why it causes coupling**: Both chat and artifact columns are constrained to this fixed height. When chat content grows beyond viewport, the chat scroll container scrolls, but the artifact pane (which has `overflow-hidden`) cannot scroll independently, causing visual misalignment.

**Evidence**: 
- MainChatLayout.tsx:518: `style={{ overflow: 'hidden', height: 'calc(100vh - 64px)' }}`

### 3. Missing `overflow-y-auto` on Artifact Content (HIGH SEVERITY)

**Location**: ArtifactPane.tsx:236-237

**Issue**: The artifact content wrapper (`flex-1 min-h-0 overflow-hidden`) should have `overflow-y-auto` to enable independent scrolling.

**Why it causes coupling**: Without `overflow-y-auto`, artifact content cannot scroll. When artifact content exceeds viewport height, it gets clipped or positioned incorrectly relative to chat scroll.

**Evidence**:
- ArtifactPane.tsx:236: `className="flex-1 min-h-0 overflow-hidden"` should be `overflow-y-auto`
- ArtifactPane.tsx:237: `className="p-4 h-full overflow-hidden"` should allow scrolling

### 4. Aggressive Scroll Prevention Code (MEDIUM SEVERITY)

**Location**: ArtifactPane.tsx:30-128

**Issue**: Code attempts to force `scrollTop = 0` every 100ms and prevents all scroll events.

**Why it indicates coupling**: This is a symptomatic workaround that suggests developers are aware of scroll coupling but addressing it incorrectly. The code prevents scroll rather than enabling independent scroll.

**Evidence**:
- ArtifactPane.tsx:89-93: `MutationObserver` forces `scrollTop = 0`
- ArtifactPane.tsx:105-118: `setInterval(forceScrollTop, 100)` forces scroll reset
- ArtifactPane.tsx:43-49: Prevents all `wheel` events on artifact pane

### 5. Missing `min-h-0` on Critical Flex Children (LOW SEVERITY)

**Location**: SplitContainer.tsx:32, 43

**Issue**: Both panel wrappers have `min-h-0`, which is correct, but the artifact pane's inner content wrappers might benefit from explicit `min-h-0` to ensure flex shrinking.

**Why it's minor**: The artifact pane already has `min-h-0` at root level (ArtifactPane.tsx:183), so this is not the primary issue.

**Evidence**: SplitContainer.tsx:32, 43 both have `min-h-0` ✓

### 6. Inline Style Override Pattern (MEDIUM SEVERITY)

**Location**: ArtifactPane.tsx:184-192, SplitContainer.tsx:46-49

**Issue**: Multiple elements use both `className` with `overflow-hidden` AND inline `style={{ overflow: 'hidden' }}`, suggesting redundant enforcement.

**Why it indicates coupling**: Redundant overflow blocking suggests developers are aggressively trying to prevent scroll, indicating awareness of coupling issue.

**Evidence**:
- ArtifactPane.tsx:183: `className="... overflow-hidden"` + line 186: `style={{ overflow: 'hidden' }}`
- SplitContainer.tsx:43: `className="... overflow-hidden"` + line 46: `style={{ overflow: 'hidden' }}`

## Repro Steps

1. **Start the app**:
   ```bash
   cd apps/web
   npm run dev
   ```

2. **Open browser DevTools**:
   - Press `F12` or `Ctrl+Shift+I`
   - Open **Elements** panel
   - Open **Computed** styles panel

3. **Create a long chat conversation**:
   - Send multiple messages to build up chat history
   - Ensure chat messages exceed viewport height (scroll should appear in chat column)

4. **Create an artifact**:
   - Trigger artifact creation (e.g., ask for a table)
   - Verify split view opens with artifact pane on the right

5. **Inspect scroll containers**:
   - In Elements panel, search for `overflow-y-auto` or use:
     ```js
     [...document.querySelectorAll('*')].filter(e => {
       const cs = getComputedStyle(e);
       return /(auto|scroll)/.test(cs.overflowY);
     })
     ```
   - **Expected**: Only ONE element should be found: the chat container (`chat-container` class)

6. **Verify artifact pane has no scroll**:
   - Select the artifact pane root element (class `artifact-pane`)
   - In Computed panel, check `overflow-y` → should be `hidden`
   - Check `scrollHeight` vs `clientHeight` → if artifact content is tall, `scrollHeight > clientHeight` but no scrollbar appears

7. **Observe scroll coupling**:
   - Scroll the chat column (mouse wheel or scrollbar)
   - **Expected behavior**: Artifact pane visual position may shift relative to viewport
   - Check artifact pane's `getBoundingClientRect().top` before and after chat scroll
   - **Expected**: Value changes, indicating visual coupling

8. **Check scrollTop values**:
   ```js
   // Find chat scroll container
   const chatContainer = document.querySelector('.chat-container');
   console.log('Chat scrollTop:', chatContainer.scrollTop);
   
   // Find artifact pane
   const artifactPane = document.querySelector('.artifact-pane');
   console.log('Artifact scrollTop:', artifactPane.scrollTop); // Should be 0
   console.log('Artifact scrollHeight:', artifactPane.scrollHeight);
   console.log('Artifact clientHeight:', artifactPane.clientHeight);
   ```
   - **Expected**: Chat `scrollTop` changes when scrolling; artifact `scrollTop` stays 0 even if content is clipped

## Evidence

### File References

1. **MainChatLayout.tsx:518** - Fixed-height `<main>` with `overflow-hidden`
2. **MainChatLayout.tsx:86** - Only scroll container (`overflow-y-auto chat-container`)
3. **SplitContainer.tsx:29** - Root container with `overflow-hidden`
4. **SplitContainer.tsx:43** - Right panel wrapper with `overflow-hidden`
5. **ArtifactPane.tsx:183** - Root div with `overflow-hidden`
6. **ArtifactPane.tsx:212** - Inner wrapper with `overflow-hidden`
7. **ArtifactPane.tsx:236** - Content wrapper with `overflow-hidden`
8. **ArtifactPane.tsx:237** - Section element with `overflow-hidden`
9. **ArtifactPane.tsx:30-128** - Scroll prevention effects (symptomatic fix)

### Code Snippets

**Chat scroll container** (MainChatLayout.tsx:86):
```tsx
<div 
  className="flex-1 overflow-y-auto chat-container relative" 
  style={{ paddingBottom: '200px' }}
>
```

**Artifact pane root** (ArtifactPane.tsx:183-192):
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
>
```

**Scroll prevention interval** (ArtifactPane.tsx:118):
```tsx
const intervalId = setInterval(forceScrollTop, 100);
```

