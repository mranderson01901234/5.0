# CSS_OVERFLOW_MAP.md

## Overflow Patterns

### `overflow-` (Tailwind classes)

#### `overflow-hidden`
- **apps/web/src/layouts/MainChatLayout.tsx:85** - Chat content wrapper
- **apps/web/src/layouts/MainChatLayout.tsx:511** - main#main
- **apps/web/src/components/SplitContainer.tsx:29** - SplitContainer root
- **apps/web/src/components/ArtifactPane.tsx:101** - artifact-pane
- **apps/web/src/components/layout/Sidebar.tsx:133** - Sidebar content wrapper
- **apps/web/src/components/home/CenterComposer.tsx:80** - Composer container
- **apps/web/src/components/settings/SettingsDialog.tsx:141** - Settings dialog content
- **apps/web/src/components/settings/SettingsDialog.tsx:155** - Tabs root
- **apps/web/src/components/ui/scroll-area.tsx:11** - Scroll area wrapper
- **apps/web/src/components/ui/tooltip.tsx:19** - Tooltip container

**Count**: 10 instances
**Conflict**: Multiple containers blocking scroll - main, SplitContainer, artifact-pane all have overflow-hidden

#### `overflow-y-auto`
- **apps/web/src/layouts/MainChatLayout.tsx:87** - `.chat-container` (SCROLL OWNER)
- **apps/web/src/layouts/MainChatLayout.tsx:513** - PromptTester wrapper
- **apps/web/src/components/ArtifactPane.tsx:133** - `#artifact-scroll` (SCROLL OWNER)
- **apps/web/src/components/layout/Sidebar.tsx:138** - Sidebar conversation list
- **apps/web/src/components/home/CenterComposer.tsx:99** - Textarea max-height container
- **apps/web/src/components/telemetry/EventStream.tsx:123** - Event stream container
- **apps/web/src/components/chat/CodeBlock.tsx:239** - Code block container
- **apps/web/src/components/settings/SettingsDialog.tsx:179** - Settings content scroll
- **apps/web/src/components/chat/SourcesDropdown.tsx:39** - Sources dropdown
- **apps/web/src/components/debug/ViewportDebug.tsx:139** - Debug panel scroll

**Count**: 10 instances
**Conflict**: Both `.chat-container` and `#artifact-scroll` are scroll owners - should be independent

#### `overflow-auto`
- **apps/web/src/components/ErrorBoundary.tsx:29** - Error message pre tag
- **apps/web/src/components/fallbacks/SidebarFallback.tsx:24** - Fallback error
- **apps/web/src/components/fallbacks/MessageListFallback.tsx:23** - Fallback error
- **apps/web/src/pages/PromptTester.tsx:402** - Test output container

**Count**: 4 instances
**Conflict**: None (small containers)

### `overflow:` (inline styles)

#### `overflow: hidden`
- **apps/web/src/index.css:34** - `html, body { overflow: hidden; }`
- **apps/web/src/index.css:533** - `.artifact-pane { overflow: hidden; }`

**Count**: 2 instances (global)
**Conflict**: Global body overflow-hidden prevents page-level scroll (intended)

#### `overflow-y: auto`
- **apps/web/src/index.css:39** - `.chat-container, #artifact-scroll { overflow-y: auto !important; }`
- **apps/web/src/index.css:471** - `.chat-container { overflow-y: auto !important; }`
- **apps/web/src/index.css:539** - `#artifact-scroll { overflow-y: auto !important; }`

**Count**: 3 instances (with !important)
**Conflict**: Duplicate rules for same selectors (lines 39 and 471/539)

#### `overflow-x: hidden`
- **apps/web/src/index.css:40** - `.chat-container, #artifact-scroll { overflow-x: hidden !important; }`
- **apps/web/src/index.css:472** - `.chat-container { overflow-x: hidden; }`
- **apps/web/src/index.css:540** - `#artifact-scroll { overflow-x: hidden !important; }`
- **apps/web/src/index.css:148** - `.message-content { overflow-x: hidden !important; }`
- **apps/web/src/index.css:164** - `.message-content-user { overflow-x: hidden !important; }`
- **apps/web/src/index.css:174** - `.user-message-bubble .message-content-user p { overflow-x: hidden !important; }`
- **apps/web/src/index.css:190** - `.user-message-bubble { overflow-x: hidden !important; }`
- **apps/web/src/index.css:374** - `.message-content [data-math="true"] { overflow-x: hidden; }`
- **apps/web/src/index.css:400** - `.user-message-bubble > [data-math="true"] { overflow-x: hidden; }`

**Count**: 9 instances
**Conflict**: Multiple rules preventing horizontal scroll (intended for content, not containers)

## Height Patterns

### `h-screen` (100vh)
- **apps/web/src/App.tsx:24** - App root container
- **apps/web/src/components/layout/Sidebar.tsx:97** - Sidebar fixed container

**Count**: 2 instances
**Conflict**: None

### `h-full` (100%)
- **apps/web/src/layouts/MainChatLayout.tsx:67** - ChatPanel wrapper
- **apps/web/src/components/SplitContainer.tsx:29** - SplitContainer root
- **apps/web/src/components/SplitContainer.tsx:32** - Left panel (chat)
- **apps/web/src/components/SplitContainer.tsx:43** - Right panel (artifact)
- **apps/web/src/components/SplitContainer.tsx:47** - artifact-root
- **apps/web/src/components/ArtifactPane.tsx:101** - artifact-pane
- **apps/web/src/components/ArtifactPane.tsx:106** - Artifact content wrapper
- **apps/web/src/components/layout/Sidebar.tsx:103** - Sidebar inner container
- **apps/web/src/components/layout/Sidebar.tsx:138** - Sidebar conversation list

**Count**: 9 instances
**Conflict**: Chain of h-full containers creating height inheritance chain

### `min-h-0`
- **apps/web/src/layouts/MainChatLayout.tsx:67** - ChatPanel wrapper
- **apps/web/src/layouts/MainChatLayout.tsx:85** - Chat content wrapper
- **apps/web/src/layouts/MainChatLayout.tsx:511** - main#main
- **apps/web/src/components/SplitContainer.tsx:29** - SplitContainer root
- **apps/web/src/components/SplitContainer.tsx:32** - Left panel
- **apps/web/src/components/SplitContainer.tsx:43** - Right panel
- **apps/web/src/components/SplitContainer.tsx:47** - artifact-root
- **apps/web/src/components/ArtifactPane.tsx:101** - artifact-pane
- **apps/web/src/components/ArtifactPane.tsx:106** - Artifact content wrapper
- **apps/web/src/components/ArtifactPane.tsx:133** - artifact-scroll
- **apps/web/src/components/layout/Sidebar.tsx:133** - Sidebar content wrapper

**Count**: 11 instances
**Conflict**: Critical for flex scrolling - allows flex children to shrink below content size

### `min-h-full`
- **apps/web/src/layouts/MainChatLayout.tsx:497** - Main layout root
- **apps/web/src/pages/Dashboard.tsx:18** - Dashboard container
- **apps/web/src/pages/TelemetryDashboard.tsx:13** - Telemetry dashboard
- **apps/web/src/auth/Guard.tsx:10** - Auth guard container

**Count**: 4 instances
**Conflict**: None (different pages)

### `max-h-`
- **apps/web/src/components/home/CenterComposer.tsx:99** - `max-h-[200px]` textarea container
- **apps/web/src/components/ErrorBoundary.tsx:29** - `max-h-40` error message
- **apps/web/src/components/fallbacks/SidebarFallback.tsx:24** - `max-h-28` fallback
- **apps/web/src/components/fallbacks/MessageListFallback.tsx:23** - `max-h-32` fallback
- **apps/web/src/components/chat/SourcesDropdown.tsx:39** - `max-h-64` sources dropdown
- **apps/web/src/components/debug/ViewportDebug.tsx:139** - `max-h-[80vh]` debug panel
- **apps/web/src/pages/PromptTester.tsx:402** - `max-h-96` test output
- **apps/web/src/components/settings/SettingsDialog.tsx:139** - `max-h-[85vh]` dialog

**Count**: 8 instances
**Conflict**: None (small containers)

### `fixed` (position: fixed)
- **apps/web/src/layouts/MainChatLayout.tsx:92** - User message anchor (fixed)
- **apps/web/src/layouts/MainChatLayout.tsx:118** - Chat input container (fixed)
- **apps/web/src/components/layout/Sidebar.tsx:97** - Sidebar (fixed)
- **apps/web/src/components/layout/TopBar.tsx:5** - TopBar (fixed)
- **apps/web/src/components/chat/MessageList.tsx:196** - Scroll to bottom button (fixed)
- **apps/web/src/components/ArtifactPane.tsx:152** - Dev instrumentation overlay (fixed)
- **apps/web/src/components/debug/ViewportDebug.tsx:133** - Debug panel (fixed)
- **apps/web/src/components/settings/SettingsDialog.tsx:135** - Dialog overlay (fixed)
- **apps/web/src/components/settings/SettingsDialog.tsx:138** - Dialog content (fixed)
- **apps/web/src/components/ui/sheet.tsx:19** - Sheet overlay (fixed)
- **apps/web/src/components/ui/sheet.tsx:41** - Sheet content (fixed)
- **apps/web/src/mobile/components/MobileSidebar.tsx:83** - Mobile sidebar overlay (fixed)
- **apps/web/src/mobile/components/MobileSidebar.tsx:92** - Mobile sidebar content (fixed)
- **apps/web/src/mobile/ui/PullToScrollButton.tsx:14** - Mobile scroll button (fixed)
- **apps/web/src/mobile/ui/OfflineBanner.tsx:12** - Mobile offline banner (fixed)

**Count**: 15 instances
**Conflict**: Fixed elements remove from flow - chat input container overlaps chat content

### `sticky` (position: sticky)
- **apps/web/src/components/ArtifactPane.tsx:108** - Artifact header (sticky top-0)
- **apps/web/src/components/layout/Sidebar.tsx:182** - Sidebar footer (sticky bottom-0)
- **apps/web/src/index.css:489** - `.fixed-user-message { position: sticky; }`

**Count**: 3 instances
**Conflict**: None

### `calc(100vh - ...)` (inline styles)
- **apps/web/src/layouts/MainChatLayout.tsx:511** - `main#main { height: calc(100vh - 64px) }`

**Count**: 1 instance
**Conflict**: Fixed height on main container constrains entire layout

## Summary of Conflicts

### Critical Conflicts:
1. **Duplicate overflow-y rules** (index.css:39, 471, 539)
   - Same selectors with !important flags
   - Could cause maintenance issues

2. **Fixed height container** (MainChatLayout.tsx:511)
   - `main#main` has `height: calc(100vh - 64px)`
   - Constrains entire chat/artifact area

3. **Multiple overflow-hidden blockers**
   - main, SplitContainer, artifact-pane all have overflow-hidden
   - Creates nested scroll isolation (may be intentional)

4. **Wrong scroll target in JS**
   - `useAutoOpenArtifact.ts:86` and `useChatStream.ts:394` target `.artifact-pane` (overflow-hidden)
   - Should target `#artifact-scroll` (overflow-y-auto)

### Non-Critical:
- Multiple `overflow-x: hidden` rules (intended for content wrapping)
- Multiple `min-h-0` rules (intended for flex scrolling)

## De-duplication Summary

### Most Common Patterns:
1. `overflow-hidden`: 10 instances (5 in layout containers)
2. `overflow-y-auto`: 10 instances (2 scroll owners)
3. `h-full`: 9 instances (height inheritance chain)
4. `min-h-0`: 11 instances (critical for flex scrolling)
5. `fixed`: 15 instances (mostly overlays/dialogs)

### Redundant Rules:
- `index.css:39-40` and `index.css:471-472` both target `.chat-container`
- `index.css:39` and `index.css:539` both target `#artifact-scroll`
- Should consolidate to single rule per selector

