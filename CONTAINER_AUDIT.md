# CONTAINER_AUDIT.md

## High-Level Container Tree Map

### Root Level
```
<body>
  ├─ className: (none)
  ├─ inline style: (none)
  ├─ display: block
  ├─ height: 100% (from html,body { height: 100% })
  ├─ overflow: hidden (from index.css:34)
  └─ file: apps/web/src/index.css:32-35
```

### App Root
```
<div className="h-screen">
  ├─ file: apps/web/src/App.tsx:24
  ├─ className: "h-screen"
  ├─ inline style: (none)
  ├─ display: block
  ├─ height: 100vh (h-screen)
  └─ overflow: (inherited from body: hidden)
```

### Main Layout Container
```
<div className="min-h-screen flex flex-col">
  ├─ file: apps/web/src/layouts/MainChatLayout.tsx:497
  ├─ className: "min-h-screen flex flex-col"
  ├─ inline style: (none)
  ├─ display: flex
  ├─ flex-direction: column
  ├─ min-height: 100vh
  └─ height: (auto, grows to content)
```

### Main Content Area
```
<main id="main" className="pl-[48px] pt-16 flex-1 flex flex-col min-h-0 overflow-hidden" 
      style={{ height: 'calc(100vh - 64px)', position: 'relative' }}>
  ├─ file: apps/web/src/layouts/MainChatLayout.tsx:511
  ├─ className: "pl-[48px] pt-16 flex-1 flex flex-col min-h-0 overflow-hidden"
  ├─ inline style: { height: 'calc(100vh - 64px)', position: 'relative' }
  ├─ display: flex
  ├─ flex-direction: column
  ├─ height: calc(100vh - 64px) (FIXED HEIGHT)
  ├─ min-height: 0
  ├─ overflow: hidden (CRITICAL: prevents all scrolling at this level)
  └─ position: relative
```

### Split View Container (when splitView === true)
```
<SplitContainer>
  ├─ file: apps/web/src/components/SplitContainer.tsx:29
  ├─ className: "flex h-full w-full min-h-0 overflow-hidden relative"
  ├─ inline style: (none)
  ├─ display: flex
  ├─ flex-direction: row
  ├─ height: 100% (h-full)
  ├─ width: 100%
  ├─ min-height: 0
  ├─ overflow: hidden (CRITICAL: prevents scrolling at split level)
  └─ position: relative

  ├─ Left Panel (Chat)
  │   <div className="flex-shrink-0 h-full min-h-0 flex flex-col relative"
  │        style={{ width: `${leftWidth}%`, position: 'relative' }}>
  │   ├─ file: apps/web/src/components/SplitContainer.tsx:32
  │   ├─ className: "flex-shrink-0 h-full min-h-0 flex flex-col relative"
  │   ├─ inline style: { width: `${leftWidth}%`, position: 'relative' }
  │   ├─ display: flex
  │   ├─ flex-direction: column
  │   ├─ height: 100%
  │   ├─ min-height: 0
  │   ├─ overflow: (inherited: hidden from parent)
  │   └─ flex-shrink: 0
  │
  │   └─ ChatPanel (from MainChatLayout.tsx:67)
  │       <div className="flex-1 flex flex-col h-full min-h-0 relative">
  │       ├─ file: apps/web/src/layouts/MainChatLayout.tsx:67
  │       ├─ className: "flex-1 flex flex-col h-full min-h-0 relative"
  │       ├─ display: flex
  │       ├─ flex-direction: column
  │       ├─ height: 100%
  │       ├─ min-height: 0
  │       └─ overflow: (inherited: hidden)
  │
  │       └─ Chat Content Container
  │           <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative" 
  │                style={{ position: 'relative' }}>
  │           ├─ file: apps/web/src/layouts/MainChatLayout.tsx:85
  │           ├─ className: "flex-1 flex flex-col min-h-0 overflow-hidden relative"
  │           ├─ inline style: { position: 'relative' }
  │           ├─ display: flex
  │           ├─ flex-direction: column
  │           ├─ min-height: 0
  │           ├─ overflow: hidden (CRITICAL: prevents scrolling here)
  │           └─ position: relative
  │
  │           └─ SCROLL OWNER (Chat Container)
  │               <div className="flex-1 overflow-y-auto chat-container" 
  │                    style={{ paddingBottom: '200px', position: 'absolute', 
  │                            top: 0, left: 0, right: 0, bottom: 0 }}>
  │               ├─ file: apps/web/src/layouts/MainChatLayout.tsx:87-88
  │               ├─ className: "flex-1 overflow-y-auto chat-container"
  │               ├─ inline style: { paddingBottom: '200px', position: 'absolute', 
  │               │                  top: 0, left: 0, right: 0, bottom: 0 }
  │               ├─ display: block
  │               ├─ overflow-y: auto (SCROLL OWNER)
  │               ├─ overflow-x: hidden (from index.css:39-40)
  │               ├─ position: absolute (ABSOLUTE POSITIONING)
  │               └─ height: (constrained by absolute positioning)
  │
  ├─ Divider
  │   ├─ file: apps/web/src/components/Divider.tsx:13
  │   ├─ className: "resizable-divider w-1 bg-white/10 hover:bg-purple-500/30 cursor-col-resize..."
  │   └─ (static divider, no scroll impact)
  │
  └─ Right Panel (Artifact)
      <div className="flex-shrink-0 h-full min-h-0 flex flex-col relative"
           style={{ width: `${rightWidth}%`, position: 'relative' }}>
      ├─ file: apps/web/src/components/SplitContainer.tsx:42-44
      ├─ className: "flex-shrink-0 h-full min-h-0 flex flex-col relative"
      ├─ inline style: { width: `${rightWidth}%`, position: 'relative' }
      ├─ display: flex
      ├─ flex-direction: column
      ├─ height: 100%
      ├─ min-height: 0
      ├─ overflow: (inherited: hidden from parent)
      └─ flex-shrink: 0
      
      └─ Portal Target
          <div id="artifact-root" className="min-h-0 h-full relative">
          ├─ file: apps/web/src/components/SplitContainer.tsx:47
          ├─ className: "min-h-0 h-full relative"
          ├─ display: block
          ├─ height: 100%
          ├─ min-height: 0
          ├─ overflow: (inherited: hidden)
          └─ position: relative
          
          └─ ArtifactPortal (renders via createPortal)
              └─ ArtifactPane
                  <div className="artifact-pane h-full min-h-0 flex flex-col bg-[#0f0f0f] 
                                  border-l border-white/10 backdrop-blur-xl overflow-hidden">
                  ├─ file: apps/web/src/components/ArtifactPane.tsx:101
                  ├─ className: "artifact-pane h-full min-h-0 flex flex-col ... overflow-hidden"
                  ├─ display: flex
                  ├─ flex-direction: column
                  ├─ height: 100%
                  ├─ min-height: 0
                  ├─ overflow: hidden (CRITICAL: prevents pane-level scroll)
                  └─ (from index.css:532-533: overflow: hidden)
                  
                  └─ Artifact Content Container
                      <div className="h-full min-h-0 flex flex-col">
                      ├─ file: apps/web/src/components/ArtifactPane.tsx:106
                      ├─ className: "h-full min-h-0 flex flex-col"
                      ├─ display: flex
                      ├─ flex-direction: column
                      ├─ height: 100%
                      ├─ min-height: 0
                      └─ overflow: (inherited: hidden)
                      
                      ├─ Sticky Header
                      │   <header className="sticky top-0 z-10 ...">
                      │   ├─ file: apps/web/src/components/ArtifactPane.tsx:108
                      │   ├─ className: "sticky top-0 z-10 ..."
                      │   ├─ position: sticky
                      │   └─ top: 0
                      │
                      └─ SCROLL OWNER (Artifact Scroll Container)
                          <div id="artifact-scroll" ref={scrollRef}
                               className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                          ├─ file: apps/web/src/components/ArtifactPane.tsx:130-133
                          ├─ className: "flex-1 min-h-0 overflow-y-auto overscroll-contain"
                          ├─ id: "artifact-scroll"
                          ├─ display: block
                          ├─ overflow-y: auto (SCROLL OWNER)
                          ├─ overflow-x: hidden (from index.css:540)
                          ├─ min-height: 0
                          └─ flex: 1
```

## Current Scroll Owners

### Chat Scroll Owner
- **Location**: `apps/web/src/layouts/MainChatLayout.tsx:87-88`
- **Selector**: `.chat-container`
- **CSS**: `overflow-y: auto` (from className + index.css:39-40)
- **Position**: `absolute` (top: 0, left: 0, right: 0, bottom: 0)
- **Height**: Constrained by absolute positioning within parent with `overflow-hidden`

### Artifact Scroll Owner
- **Location**: `apps/web/src/components/ArtifactPane.tsx:130-133`
- **Selector**: `#artifact-scroll`
- **CSS**: `overflow-y: auto` (from className + index.css:539)
- **Position**: `static` (default)
- **Height**: `flex: 1` (fills remaining space after header)

## Critical Height Constraints

1. **main#main**: `height: calc(100vh - 64px)` (FIXED)
   - File: `apps/web/src/layouts/MainChatLayout.tsx:511`
   - Constrains entire chat/artifact area

2. **SplitContainer**: `height: 100%` (inherits from main)
   - File: `apps/web/src/components/SplitContainer.tsx:29`

3. **Chat container**: Absolute positioned, fills parent
   - File: `apps/web/src/layouts/MainChatLayout.tsx:88`

4. **Artifact pane**: `height: 100%` (inherits from parent)
   - File: `apps/web/src/components/ArtifactPane.tsx:101`

## Overflow Blockers

### Blocks Scrolling:
1. `html, body`: `overflow: hidden` (index.css:34)
2. `main#main`: `overflow-hidden` (MainChatLayout.tsx:511)
3. `SplitContainer`: `overflow-hidden` (SplitContainer.tsx:29)
4. Chat content wrapper: `overflow-hidden` (MainChatLayout.tsx:85)
5. `artifact-pane`: `overflow-hidden` (ArtifactPane.tsx:101 + index.css:533)

### Allows Scrolling:
1. `.chat-container`: `overflow-y-auto` (MainChatLayout.tsx:87)
2. `#artifact-scroll`: `overflow-y-auto` (ArtifactPane.tsx:133)

