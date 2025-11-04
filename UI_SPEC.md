# 50/50 Split View UI Specification

**Version**: 1.0.0  
**Purpose**: Design the split-view UI for chat (left) + artifact creation (right)

---

## Layout Proposal

### Desktop Default (≥1024px)

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar (full width)                                         │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│   Sidebar (240px)    │  Chat Panel (50%) │ Artifact (50%)  │
│                      │                                      │
│   - Conversations    │  MessageList      │  ArtifactPane    │
│   - New Chat         │  - Messages       │  - Tabs:         │
│   - Threads          │  - Streaming      │    • Table       │
│                      │                    │    • Document    │
│                      │  CenterComposer   │    • Spreadsheet │
│                      │  (footer)         │    • Preview     │
│                      │                    │                  │
│                      │  [Resizable       │  - Content       │
│                      │   Divider]        │  - Export btn    │
│                      │                    │                  │
└──────────────────────┴──────────────────────────────────────┘
```

### Components

#### Left Panel: Chat (Unchanged Functionally)

- **MessageList**: Existing component (`components/chat/MessageList.tsx`)
- **CenterComposer**: Existing component (`components/home/CenterComposer.tsx`)
- **Behavior**: Identical to current single-pane view
- **Styling**: No visual changes (preserves current glass effects, typography)

#### Right Panel: Artifact Pane (New)

- **ArtifactPane**: New component (`components/artifacts/ArtifactPane.tsx`)
- **Tabs**: Table | Document | Spreadsheet | Preview/Export
- **Empty State**: "No artifact yet" with illustration
- **Content Area**: Renders artifact editor based on active tab

#### Resizable Divider

- **Width**: 4px drag handle
- **Min Left Width**: 400px (chat minimum)
- **Min Right Width**: 400px (artifact minimum)
- **Keyboard**: Arrow keys to resize (when focused)
- **Visual**: Vertical line with hover glow (purple accent)

---

## Responsive Rules

### Desktop (≥1024px)
- **Default**: 50/50 split
- **Resizable**: Yes (keyboard + pointer)
- **Sidebar**: Always visible (240px)

### Tablet (768px - 1023px)
- **Default**: 60/40 split (chat/artifact)
- **Resizable**: Yes (limited range)
- **Sidebar**: Collapsible drawer
- **Artifact Pane**: Can collapse to icon-only

### Mobile (<768px)
- **Default**: Single-pane (chat only)
- **Toggle**: Floating button to switch between Chat/Artifact
- **Sidebar**: Bottom sheet or hamburger menu
- **No Split**: Always full-width, toggle between views

---

## Route & State Plan

### URL Route

```
/?view=split          → 50/50 split view (default on desktop)
/?view=chat           → Single-pane chat (default on mobile)
/?view=artifact       → Single-pane artifact (mobile toggle)
```

### Zustand State Extension

```typescript
// store/uiStore.ts (new file)
interface UIState {
  splitView: boolean;              // true = split, false = single-pane
  artifactPaneVisible: boolean;    // true = artifact pane open
  activeArtifactTab: "table" | "doc" | "sheet" | "preview" | null;
  artifactPaneWidth: number;       // Percentage (0-100), default 50
  currentArtifactId: string | null; // Active artifact ID
  
  // Actions
  setSplitView(enabled: boolean): void;
  toggleArtifactPane(): void;
  setActiveArtifactTab(tab: "table" | "doc" | "sheet" | "preview"): void;
  setArtifactPaneWidth(width: number): void;
  setCurrentArtifact(artifactId: string | null): void;
}
```

### Persistence

- **LocalStorage**: `ui.splitView`, `ui.artifactPaneWidth` (per device)
- **SessionStorage**: `ui.currentArtifactId` (cleared on refresh)

---

## Component Structure

### MainChatLayout.tsx (Modified)

```typescript
// Conditional rendering based on splitView state
{uiStore.splitView ? (
  <SplitContainer>
    <ChatPanel width={100 - artifactPaneWidth}>
      <MessageList />
      <CenterComposer />
    </ChatPanel>
    <ResizableDivider onResize={handleResize} />
    <ArtifactPane width={artifactPaneWidth} />
  </SplitContainer>
) : (
  <ChatPanel>
    <MessageList />
    <CenterComposer />
  </ChatPanel>
)}
```

### ArtifactPane.tsx (New)

```typescript
const ArtifactPane: React.FC<{ width: number }> = ({ width }) => {
  const { activeArtifactTab, currentArtifactId } = useUIStore();
  
  return (
    <div className="artifact-pane" style={{ width: `${width}%` }}>
      <ArtifactTabs />
      {currentArtifactId ? (
        <ArtifactEditor type={activeArtifactTab} artifactId={currentArtifactId} />
      ) : (
        <ArtifactEmptyState />
      )}
    </div>
  );
};
```

### ArtifactTabs.tsx (New)

```typescript
const tabs = [
  { id: "table", label: "Table", icon: <TableIcon /> },
  { id: "doc", label: "Document", icon: <FileTextIcon /> },
  { id: "sheet", label: "Spreadsheet", icon: <SpreadsheetIcon /> },
  { id: "preview", label: "Preview", icon: <EyeIcon /> },
];
```

---

## Resize Logic

### Pointer Interaction

```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  const startX = e.clientX;
  const startWidth = artifactPaneWidth;
  
  const handleMouseMove = (e: MouseEvent) => {
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(40, Math.min(60, startWidth + (deltaX / window.innerWidth * 100)));
    setArtifactPaneWidth(newWidth);
  };
  
  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};
```

### Keyboard Interaction

- **Focus divider**: Tab to focus
- **Arrow Left**: Decrease artifact pane width (5% increments)
- **Arrow Right**: Increase artifact pane width (5% increments)
- **Escape**: Reset to 50/50

---

## Accessibility Checklist

### Focus Order

1. Chat input (CenterComposer)
2. Messages (MessageList)
3. Resizable divider (if split view)
4. Artifact tabs
5. Artifact content area
6. Export button

### ARIA Roles

```typescript
<div role="complementary" aria-label="Artifact creation pane">
  <nav role="tablist" aria-label="Artifact types">
    <button role="tab" aria-selected={activeTab === "table"}>Table</button>
    {/* ... */}
  </nav>
  <div role="tabpanel" aria-labelledby="table-tab">
    {/* Artifact editor */}
  </div>
</div>
```

### Screen Reader Labels

- Resizable divider: `aria-label="Resize panels, use arrow keys"`
- Artifact pane: `aria-label="Artifact creation pane"`
- Empty state: `aria-live="polite"` with "No artifact created yet"

### Keyboard Shortcuts

- `Cmd/Ctrl + \`: Toggle split view
- `Cmd/Ctrl + Shift + T`: Focus artifact tabs
- `Cmd/Ctrl + E`: Export current artifact
- `Escape`: Close artifact pane (mobile)

---

## "No Artifact Yet" Empty State

### Design

```
┌─────────────────────────────┐
│                             │
│     [Illustration Icon]     │
│                             │
│   No artifact created yet   │
│                             │
│   Artifacts will appear     │
│   here when you create      │
│   tables, documents, or     │
│   spreadsheets.             │
│                             │
│   [Create Table] [Create    │
│    Document] [Create Sheet] │
│                             │
└─────────────────────────────┘
```

### Styling

- Icon: Large (64px), purple/blue gradient, opacity 0.6
- Text: White/70, centered, 14px font
- Buttons: Glass effect, hover glow

---

## Animation & Transitions

### Panel Resize

- **Duration**: 150ms ease-out
- **Smooth**: Use `transform: translateX()` for performance

### Tab Switch

- **Duration**: 200ms ease-in-out
- **Fade**: Content fades out/in

### Split Toggle

- **Duration**: 300ms ease-in-out
- **Slide**: Artifact pane slides in from right (mobile)

---

## Integration Points

### Opening Artifact Pane

1. **Gatekeeper triggers** → `uiStore.setSplitView(true)`
2. **Artifact created** → `uiStore.setCurrentArtifact(artifactId)`
3. **User clicks artifact** → `uiStore.setSplitView(true)` + set artifact ID

### Closing Artifact Pane

1. **User clicks X button** → `uiStore.setSplitView(false)`
2. **Mobile toggle** → Switch to chat-only view
3. **Route change** → `?view=chat` sets `splitView=false`

---

## Styling Guidelines

### Artifact Pane Container

```css
.artifact-pane {
  @apply bg-[#0f0f0f] border-l border-white/10;
  @apply backdrop-blur-xl;
  @apply overflow-y-auto;
  @apply flex flex-col;
}
```

### Resizable Divider

```css
.resizable-divider {
  @apply w-1 bg-white/10 hover:bg-purple-500/30;
  @apply cursor-col-resize;
  @apply transition-colors duration-200;
  @apply focus:outline-none focus:ring-2 focus:ring-purple-500/50;
}
```

### Artifact Tabs

```css
.artifact-tab {
  @apply px-4 py-2 text-white/70 hover:text-white;
  @apply border-b-2 border-transparent;
  @apply transition-colors duration-200;
}

.artifact-tab[aria-selected="true"] {
  @apply text-white border-purple-500;
}
```

---

## Testing Checklist

- [ ] Split view renders correctly on desktop
- [ ] Resize works with mouse drag
- [ ] Resize works with keyboard arrows
- [ ] Mobile collapses to single-pane
- [ ] Toggle button works on mobile
- [ ] Focus order is logical
- [ ] Screen reader announces changes
- [ ] Empty state displays when no artifact
- [ ] Artifact opens in correct tab
- [ ] Route params sync with state
- [ ] LocalStorage persists preferences

---

## Future Enhancements

- Split-screen keyboard shortcuts
- Multiple artifact tabs (like browser tabs)
- Artifact history/versioning UI
- Drag-and-drop to resize (alternative to divider)
- Artifact templates/gallery
