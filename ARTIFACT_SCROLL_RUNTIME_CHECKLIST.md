# Artifact Scroll Coupling - Runtime Verification Checklist

## Prerequisites

- Node.js and npm installed
- Application dependencies installed (`npm install` in `apps/web`)
- Modern browser with DevTools (Chrome, Firefox, Edge)

---

## Step 1: Start the Application

1. Open terminal in project root (`/home/dp/Desktop/2.0`)
2. Navigate to web app:
   ```bash
   cd apps/web
   ```
3. Start development server:
   ```bash
   npm run dev
   ```
4. Note the local URL (typically `http://localhost:5173` or similar)
5. Open browser and navigate to the URL

---

## Step 2: Open Browser DevTools

1. Press `F12` or `Ctrl+Shift+I` (Linux/Windows) or `Cmd+Option+I` (Mac)
2. Arrange DevTools panels:
   - **Elements** panel (primary)
   - **Console** panel (secondary)
   - **Computed** styles visible in Elements panel (toggle if needed)

---

## Step 3: Inspect DOM Hierarchy

1. In **Elements** panel, locate the root `<main>` element:
   - Look for `id="main"` attribute
   - Should have classes: `pl-[48px] pt-16 flex-1 flex flex-col min-h-0 overflow-hidden`
   - Expand to view children

2. Verify SplitContainer structure:
   - Find `<div>` with class containing `flex h-full w-full min-h-0 overflow-hidden`
   - Should have two child panels (left = chat, right = artifact)

3. Locate chat scroll container:
   - Find `<div>` with class `flex-1 overflow-y-auto chat-container relative`
   - **Expected**: This is the ONLY element with `overflow-y-auto`

4. Locate artifact pane root:
   - Find `<div>` with class `artifact-pane`
   - Expand to view nested structure
   - **Expected**: All nested divs should have `overflow-hidden`

---

## Step 4: Run Scroll Container Detection Script

1. Open **Console** panel
2. Paste and run:
   ```js
   (function(){
     const els = [...document.querySelectorAll('*')].filter(e=>{
       const cs = getComputedStyle(e);
       return /(auto|scroll)/.test(cs.overflowY);
     });
     return els.map(e=>({
       node: e.tagName + '.' + (e.className || 'no-class'),
       h: e.clientHeight,
       oh: getComputedStyle(e).overflowY,
       scrollHeight: e.scrollHeight,
       scrollTop: e.scrollTop
     }));
   })()
   ```

3. **Expected Output Pattern**:
   ```js
   [
     {
       node: "DIV.chat-container",
       h: 823,  // clientHeight
       oh: "auto",
       scrollHeight: 2500,  // If chat has many messages
       scrollTop: 0  // Current scroll position
     }
     // Should be ONLY ONE element, or very few (sidebar, etc.)
   ]
   ```

4. **Verify**: Only ONE element should have `overflowY: "auto"` - the chat container. Artifact pane should NOT appear in results.

---

## Step 5: Inspect Computed Styles

1. In **Elements** panel, select the artifact pane root element (`.artifact-pane`)
2. In **Computed** styles panel (right side), check:
   - `overflow-y` → **Expected**: `hidden`
   - `overflow-x` → **Expected**: `hidden` or `visible`
   - `height` → **Expected**: Calculated value (e.g., `823px`)
   - `min-height` → **Expected**: `0px`

3. Select the artifact content wrapper (inside artifact pane, should have `flex-1 min-h-0 overflow-hidden`):
   - Check `overflow-y` → **Expected**: `hidden`
   - Check `scrollHeight` vs `clientHeight`:
     ```js
     const artifactContent = document.querySelector('.artifact-pane').querySelector('[data-artifact-id]')?.parentElement;
     console.log('scrollHeight:', artifactContent?.scrollHeight);
     console.log('clientHeight:', artifactContent?.clientHeight);
     ```
   - **Expected**: If artifact content is tall, `scrollHeight > clientHeight` but no scrollbar appears

---

## Step 6: Create Long Chat Conversation

1. In the chat interface, send multiple messages to build up history:
   - Send 10-15 messages
   - Ensure chat messages exceed viewport height
   - Verify scrollbar appears in chat column

2. Verify chat scroll container properties:
   ```js
   const chatContainer = document.querySelector('.chat-container');
   console.log('Chat scrollHeight:', chatContainer.scrollHeight);
   console.log('Chat clientHeight:', chatContainer.clientHeight);
   console.log('Chat scrollTop:', chatContainer.scrollTop);
   ```
   - **Expected**: `scrollHeight > clientHeight`, indicating scrollable content

---

## Step 7: Create Artifact

1. Trigger artifact creation:
   - Ask for a table: "Create a table with 5 columns and 20 rows"
   - Or use existing artifact creation flow
   - Verify split view opens with artifact pane on the right

2. Verify artifact pane is visible:
   ```js
   const artifactPane = document.querySelector('.artifact-pane');
   console.log('Artifact pane exists:', !!artifactPane);
   console.log('Artifact pane computed overflow-y:', getComputedStyle(artifactPane).overflowY);
   ```

---

## Step 8: Verify Scroll Coupling

### 8a. Check Initial Scroll Positions

In **Console**, run:
```js
const chatContainer = document.querySelector('.chat-container');
const artifactPane = document.querySelector('.artifact-pane');

console.log('=== Initial State ===');
console.log('Chat scrollTop:', chatContainer.scrollTop);
console.log('Chat scrollHeight:', chatContainer.scrollHeight);
console.log('Chat clientHeight:', chatContainer.clientHeight);
console.log('Artifact scrollTop:', artifactPane.scrollTop);
console.log('Artifact scrollHeight:', artifactPane.scrollHeight);
console.log('Artifact clientHeight:', artifactPane.clientHeight);
console.log('Artifact getBoundingClientRect().top:', artifactPane.getBoundingClientRect().top);
```

**Expected**:
- Chat `scrollTop` may be > 0 if scrolled
- Artifact `scrollTop` should be 0 (forced by prevention code)
- Artifact `scrollHeight` may be > `clientHeight` if content is tall
- Artifact has no scrollbar (overflow-hidden)

### 8b. Scroll Chat Column

1. Scroll chat column down (mouse wheel or scrollbar)
2. In **Console**, run again:
```js
const chatContainer = document.querySelector('.chat-container');
const artifactPane = document.querySelector('.artifact-pane');

console.log('=== After Chat Scroll ===');
console.log('Chat scrollTop:', chatContainer.scrollTop);
console.log('Artifact scrollTop:', artifactPane.scrollTop);
console.log('Artifact getBoundingClientRect().top:', artifactPane.getBoundingClientRect().top);
```

**Expected**:
- Chat `scrollTop` increases
- Artifact `scrollTop` stays 0 (or gets reset by prevention code)
- **Bug**: Artifact `getBoundingClientRect().top` may change, indicating visual coupling

### 8c. Monitor Scroll Prevention Code

1. In **Console**, check if scroll prevention interval is running:
   ```js
   // This will show if MutationObserver is active
   const artifactPane = document.querySelector('.artifact-pane');
   const observer = new MutationObserver(() => {
     console.log('Artifact pane mutated, scrollTop:', artifactPane.scrollTop);
   });
   observer.observe(artifactPane, { attributes: true, attributeFilter: ['style'] });
   
   // Try to manually scroll artifact pane
   artifactPane.scrollTop = 100;
   console.log('Set scrollTop to 100, actual:', artifactPane.scrollTop);
   
   // Wait 150ms
   setTimeout(() => {
     console.log('After 150ms, scrollTop:', artifactPane.scrollTop);
     observer.disconnect();
   }, 150);
   ```

   **Expected**: `scrollTop` gets reset to 0 by prevention code (ArtifactPane.tsx:105-118)

---

## Step 9: Verify Height Constraints

1. Check `<main>` element computed styles:
   ```js
   const main = document.querySelector('main#main');
   const cs = getComputedStyle(main);
   console.log('Main height:', cs.height);
   console.log('Main overflow-y:', cs.overflowY);
   console.log('Main clientHeight:', main.clientHeight);
   ```
   - **Expected**: `height: calc(100vh - 64px)` (or equivalent), `overflow-y: hidden`

2. Check SplitContainer root:
   ```js
   const splitContainer = document.querySelector('.artifact-pane').parentElement.parentElement;
   const cs = getComputedStyle(splitContainer);
   console.log('SplitContainer height:', cs.height);
   console.log('SplitContainer overflow-y:', cs.overflowY);
   ```
   - **Expected**: `overflow-y: hidden`, `height: 100%` or calculated value

---

## Step 10: Capture Evidence

1. Take screenshot of DevTools Elements panel showing:
   - `<main>` element expanded
   - SplitContainer structure
   - Chat scroll container highlighted
   - Artifact pane expanded showing all `overflow-hidden` elements

2. Copy Console output from scroll detection script (Step 4)

3. Copy Console output from scroll coupling verification (Step 8)

4. Note any observations:
   - Does artifact pane visual position shift when chat scrolls?
   - Does artifact content get clipped?
   - Is there any scrollbar on artifact pane?
   - Does artifact `scrollTop` get reset automatically?

---

## Step 11: Document Findings

Create a summary with:
- Number of scroll containers found (should be 1 - chat only)
- Artifact pane `overflow-y` computed value (should be `hidden`)
- Artifact pane `scrollHeight` vs `clientHeight` (if content is tall)
- Whether artifact `scrollTop` changes when chat scrolls (should be no, but visual position may shift)
- Whether scroll prevention code is active (should be yes, interval running)

---

## Expected Results Summary

| Check | Expected Value | Actual Value | Pass/Fail |
|-------|---------------|--------------|-----------|
| Number of `overflow-y-auto` elements | 1 (chat container only) | ___ | ___ |
| Artifact pane `overflow-y` | `hidden` | ___ | ___ |
| Artifact pane `scrollTop` | `0` (forced) | ___ | ___ |
| Artifact scrollHeight > clientHeight? | Yes (if content tall) | ___ | ___ |
| Artifact has scrollbar? | No | ___ | ___ |
| Artifact visual position changes when chat scrolls? | **Yes (BUG)** | ___ | ___ |

---

## Troubleshooting

**If scroll detection script returns no results**:
- Ensure split view is open
- Check that chat has messages
- Verify you're looking at the correct DOM tree

**If artifact pane is not found**:
- Ensure artifact has been created
- Check that `splitView` is true in UI store
- Verify artifact pane is rendered in split view mode

**If computed styles don't show**:
- Ensure Elements panel is selected
- Check that Computed styles panel is visible
- Try selecting element directly in Elements tree

