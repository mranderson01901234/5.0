# RUNTIME_TRACE.md

## Instructions

To complete this audit, run the dev server and execute the following console commands in the browser:

```bash
# Start dev server
pnpm dev:web
```

Then open the app in a browser, navigate to chat view, create a long conversation, open split view, and create an artifact.

## Console Commands to Execute

### A. List Scroll Owners

```js
[...document.querySelectorAll('*')].filter(e=>{
  const c=getComputedStyle(e);
  return /(auto|scroll)/.test(c.overflowY);
}).map(e=>({ 
  sel: e.id?('#'+e.id):e.className, 
  tag:e.tagName, 
  oy:getComputedStyle(e).overflowY, 
  h:e.clientHeight, 
  sh:e.scrollHeight 
}))
```

**Expected Output Format:**
```js
[
  { sel: "chat-container", tag: "DIV", oy: "auto", h: 800, sh: 1200 },
  { sel: "#artifact-scroll", tag: "DIV", oy: "auto", h: 600, sh: 900 },
  // ... more scroll owners
]
```

**Paste Results Here:**
```
[Manual execution required - paste console output here]
```

---

### B. Find Elements with Event Listeners

```js
// If getEventListeners exists (Chrome DevTools):
const els=[...document.querySelectorAll('*')];
const blocked=els.map(e=>({e, ev:(window.getEventListeners? getEventListeners(e):{})}))
  .filter(x=>Object.keys(x.ev).some(k=>['wheel','mousewheel','touchmove','scroll'].includes(k)));
blocked.map(x=>({node:x.e.id?('#'+x.e.id):x.e.className, ev:Object.keys(x.ev)}))
```

**Expected Output Format:**
```js
[
  { node: "#artifact-scroll", ev: ["scroll"] },
  { node: ".chat-container", ev: ["scroll"] },
  // ... more event listeners
]
```

**Paste Results Here:**
```
[Manual execution required - paste console output here]
```

**Note:** If `getEventListeners` is not available (Firefox/other browsers), note "unsupported" below.

---

### C. Current Artifact Target + Selection Pointers

```js
({
  currentArtifactId: (window.__dbg_ui?.currentArtifactId)||null,
  splitView: (window.__dbg_ui?.splitView)||null
})
```

**Expected Output Format:**
```js
{
  currentArtifactId: "artifact-123",
  splitView: true
}
```

**Paste Results Here:**
```
[Manual execution required - paste console output here]
```

**Note:** If debug vars are absent, note that below.

---

### D. Scroll Metrics Before/After Artifact Creation

**Before artifact creation (long chat, split view open):**

```js
const q=s=>document.querySelector(s);
const probe=(s)=>{ 
  const e=q(s); 
  if(!e) return null; 
  const c=getComputedStyle(e); 
  return {
    sel:s, 
    oy:c.overflowY, 
    h:e.clientHeight, 
    sh:e.scrollHeight, 
    st:e.scrollTop
  }; 
};

[
  probe('.chat-container, #chat, [data-chat]'),
  probe('#artifact-scroll, .artifact-scroll, [data-artifact-scroll]')
]
```

**Expected Output Format:**
```js
[
  { sel: ".chat-container", oy: "auto", h: 800, sh: 1200, st: 400 },
  { sel: "#artifact-scroll", oy: "auto", h: 600, sh: 600, st: 0 }
]
```

**Before Artifact Creation - Paste Results Here:**
```
[Manual execution required - paste console output here]
```

**After artifact creation:**

Execute the same probe command again after creating an artifact.

**After Artifact Creation - Paste Results Here:**
```
[Manual execution required - paste console output here]
```

**Selectors Used:**
- Chat container: `.chat-container` (from MainChatLayout.tsx:87)
- Artifact scroll: `#artifact-scroll` (from ArtifactPane.tsx:130)

---

## Static Analysis Findings (from code review)

### Scroll Owners (from code analysis):

1. **Chat Container**
   - Selector: `.chat-container`
   - Location: `apps/web/src/layouts/MainChatLayout.tsx:87`
   - CSS: `overflow-y: auto` (className + index.css:39)
   - Position: `absolute` (fills parent)
   - Expected scrollHeight: > clientHeight when messages exist

2. **Artifact Scroll Container**
   - Selector: `#artifact-scroll`
   - Location: `apps/web/src/components/ArtifactPane.tsx:130-133`
   - CSS: `overflow-y: auto` (className + index.css:539)
   - Position: `static` (flex child)
   - Expected scrollHeight: > clientHeight when artifact content is tall

### JavaScript Scroll Manipulation (from code analysis):

1. **useAutoOpenArtifact.ts:86-89**
   - Wrong target: `.artifact-pane` (overflow-hidden)
   - Should target: `#artifact-scroll`
   - Effect: No-op (cannot scroll hidden container)

2. **useChatStream.ts:394-397**
   - Wrong target: `.artifact-pane` (overflow-hidden)
   - Should target: `#artifact-scroll`
   - Effect: No-op (cannot scroll hidden container)

3. **useAutoFocusArtifact.ts:18,22**
   - Correct target: `scrollRef.current` (`#artifact-scroll`)
   - Effect: Works correctly

### Event Listeners (from code analysis):

1. **ArtifactPane.tsx:64**
   - Event: `scroll`
   - Target: `scrollRef.current` (`#artifact-scroll`)
   - Purpose: Track scrollTop for dev overlay
   - Passive: No

---

## Notes

- **Runtime checks require manual execution** - paste console output above
- **Static analysis completed** - see sections above for code-based findings
- **Key finding**: JS scroll manipulation targets wrong element (`.artifact-pane` instead of `#artifact-scroll`)

