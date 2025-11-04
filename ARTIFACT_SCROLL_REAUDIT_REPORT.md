# ARTIFACT SCROLL RE-AUDIT REPORT

**Date:** November 4, 2025  
**Scope:** Artifact pane scroll isolation failure analysis  
**Status:** READ-ONLY AUDIT (No code changes)

---

## 1. Summary

### What's Broken

The artifact pane cannot scroll independently from the chat container. When a user attempts to scroll content within the artifact pane (right panel), **no scrolling occurs**. The artifact content is either clipped or prevented from scrolling entirely due to aggressive overflow blocking.

### Root Cause Analysis

**Issue Type:** Structural (CSS layout) + Behavioral (JS scroll prevention)

**Primary Failure Point:** Global CSS rules in `index.css` (lines 520-537) apply `overflow: hidden !important` to `.artifact-pane` and **all of its descendants** (`.artifact-pane *`), creating a scroll-blocking cascade that prevents any scrollable container from functioning within the artifact pane.

**Secondary Issues:**
1. The dedicated scroll container `#artifact-scroll` (ArtifactPane.tsx:131-133) has `overflow-hidden` as part of its className
2. JS scroll manipulation in useAutoOpenArtifact.ts (lines 84-92) attempts to set `scrollTop` on blocked containers
3. Touch and scroll events are disabled via `touch-action: none !important` and `overscroll-behavior: none !important`

---

## 2. DOM + CSS Hierarchy Trace

```
<main id="main">                                     [MainChatLayout.tsx:511]
├── className: "pl-[48px] pt-16 flex-1 flex flex-col min-h-0"
├── style: { height: 'calc(100vh - 64px)' }
├── overflow-y: visible (default)
├── height: calc(100vh - 64px) [FIXED HEIGHT]
│
└── <SplitContainer> [when splitView=true]           [MainChatLayout.tsx:518-534]
    ├── className: "flex h-full w-full min-h-0"     [SplitContainer.tsx:29]
    ├── overflow-y: visible (default)
    ├── height: 100% (inherits from parent)
    │
    ├── [LEFT] Chat Panel
    │   ├── className: "flex-shrink-0 h-full min-h-0 flex flex-col"
    │   ├── style: { width: '50%' }                  [SplitContainer.tsx:31-36]
    │   └── overflow-y: visible (default)
    │
    ├── [DIVIDER] Divider Component
    │
    └── [RIGHT] Artifact Panel Wrapper
        ├── className: "flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
        ├── style: { width: '50%' }                  [SplitContainer.tsx:42-50]
        ├── overflow-y: **hidden** ⚠️               [BLOCKS SCROLL]
        │
        └── <div id="artifact-root">                 [SplitContainer.tsx:47]
            ├── className: "min-h-0 h-full"
            ├── overflow-y: visible (default)
            ├── height: 100% (inherits)
            │
            └── [PORTAL TARGET] ArtifactPane         [ArtifactPane.tsx:100-164]
                ├── className: "artifact-pane h-full min-h-0 flex flex-col bg-[#0f0f0f] border-l border-white/10 backdrop-blur-xl"
                ├── overflow-y: **hidden !important** ⚠️  [index.css:522]
                ├── overscroll-behavior: **none !important** ⚠️
                ├── touch-action: **none !important** ⚠️
                ├── height: 100% (full viewport height minus top bar)
                │
                └── <div> (h-full min-h-0 flex flex-col) [ArtifactPane.tsx:106]
                    │
                    ├── <header> (sticky top-0 z-10)     [ArtifactPane.tsx:108-128]
                    │   ├── className: includes "flex-shrink-0"
                    │   └── overflow-y: **hidden !important** ⚠️ [inherited from parent]
                    │
                    └── <div id="artifact-scroll">       [ArtifactPane.tsx:130-148]
                        ├── ref: scrollRef
                        ├── className: "flex-1 min-h-0 **overflow-hidden** overscroll-contain"
                        ├── overflow-y: **hidden !important** ⚠️  [DOUBLE BLOCKED]
                        │   - Blocked by className: overflow-hidden
                        │   - Blocked by global CSS: .artifact-pane * [index.css:521]
                        ├── overscroll-behavior: **none !important** ⚠️
                        ├── touch-action: **none !important** ⚠️
                        ├── pointer-events: **auto !important** (allows interaction)
                        ├── CSS containment: layout paint size [index.css:465]
                        │
                        └── <section className="p-4">    [ArtifactPane.tsx:135-147]
                            ├── data-artifact-id: {artifact.id}
                            ├── overflow-y: **hidden !important** ⚠️ [inherited]
                            │
                            └── [Content Renderers]
                                ├── TableRenderer / DocumentRenderer / SheetRenderer
                                └── All overflow: **hidden !important** ⚠️
```

### Critical Path Analysis

**Scroll-capable node:** `.chat-container` (MainChatLayout.tsx:87)
- Has `overflow-y-auto` 
- **This is the ONLY scrollable container in the entire layout**

**Scroll-blocked nodes:**
1. `SplitContainer` right panel wrapper: `overflow-hidden` (line 43 of SplitContainer.tsx)
2. `.artifact-pane`: `overflow: hidden !important` (index.css:522)
3. `.artifact-pane *` (ALL descendants): `overflow: hidden !important` (index.css:521)
4. `#artifact-scroll`: `overflow-hidden` class (ArtifactPane.tsx:133)

---

## 3. Scroll Context Table

| Node | File:Line | overflow-y | height | min-h | scrollHeight > clientHeight? | scrollable? |
|------|-----------|------------|--------|-------|------------------------------|-------------|
| `<main>` | MainChatLayout.tsx:511 | visible | calc(100vh - 64px) | 0 | Yes | No (not overflow-auto) |
| `SplitContainer` root | SplitContainer.tsx:29 | visible | 100% | 0 | Yes | No |
| Chat panel (left) | SplitContainer.tsx:32 | visible | 100% | 0 | N/A | No (relies on child .chat-container) |
| `.chat-container` | MainChatLayout.tsx:87 | **auto** ✅ | auto | 0 | **Yes** | **Yes** (ONLY scrollable) |
| Artifact wrapper (right) | SplitContainer.tsx:43 | **hidden** ⚠️ | 100% | 0 | Yes | **No** |
| `#artifact-root` | SplitContainer.tsx:47 | visible | 100% | 0 | Yes | **No** (parent blocks) |
| `.artifact-pane` | ArtifactPane.tsx:100 | **hidden !important** ⚠️ | 100% | 0 | Yes | **No** |
| `.artifact-pane header` | ArtifactPane.tsx:108 | **hidden !important** ⚠️ | auto | 0 | No | **No** |
| `#artifact-scroll` | ArtifactPane.tsx:131 | **hidden !important** ⚠️ | flex-1 | 0 | **Yes** | **No** (double blocked) |
| `section[data-artifact-id]` | ArtifactPane.tsx:135 | **hidden !important** ⚠️ | auto | 0 | **Yes** | **No** |
| Table/Doc/Sheet content | ArtifactPane.tsx:186+ | **hidden !important** ⚠️ | auto | 0 | **Yes** | **No** |

### Key Findings

- **1 scrollable node:** `.chat-container` (chat panel only)
- **10+ blocked nodes:** Entire artifact pane hierarchy
- **scrollHeight > clientHeight:** True for `#artifact-scroll` and content renderers (content is clipped)
- **Effective overflow:** All artifact descendants are **hard-locked to overflow: hidden !important**

---

## 4. JS Scroll Prevention

### ArtifactPane.tsx

**Line 26-27:** Scroll tracking state
```typescript
const scrollRef = React.useRef<HTMLDivElement>(null);
const [scrollTop, setScrollTop] = React.useState(0);
```
- **Purpose:** Track scroll position for dev instrumentation
- **Impact:** Neutral (read-only tracking)

**Line 53-69:** Scroll event listener
```typescript
React.useEffect(() => {
  const container = scrollRef.current;
  if (!container || process.env.NODE_ENV !== 'development') {
    setShowInstrumentation(false);
    return;
  }
  setShowInstrumentation(true);
  const handleScroll = () => {
    setScrollTop(container.scrollTop);
  };
  container.addEventListener('scroll', handleScroll);
  return () => {
    container.removeEventListener('scroll', handleScroll);
    setShowInstrumentation(false);
  };
}, [artifact]);
```
- **Purpose:** Dev-only scroll position display
- **Impact:** Neutral (no preventDefault or scroll manipulation)
- **Note:** This listener **never fires** because container has overflow: hidden

**Line 72:** Auto-focus artifact hook
```typescript
useAutoFocusArtifact(scrollRef);
```
- **Purpose:** Scroll artifact into view when selection changes
- **Impact:** High (attempts scroll operations on blocked container)
- **File:** useAutoFocusArtifact.ts

### useAutoFocusArtifact.ts

**Line 12-25:** Scroll-to-element logic
```typescript
useEffect(() => {
  if (!containerRef.current || !currentArtifactId) return;
  if (currentArtifactId === lastId.current) return;

  const el = containerRef.current.querySelector<HTMLElement>(`[data-artifact-id="${currentArtifactId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    lastId.current = currentArtifactId;
  } else {
    // If artifact element not found, scroll to top
    containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    lastId.current = currentArtifactId;
  }
}, [currentArtifactId, containerRef]);
```
- **Purpose:** Smooth scroll to selected artifact
- **Impact:** **Critical** - Calls `.scrollIntoView()` and `.scrollTo()` on `overflow: hidden` container
- **Result:** Operations silently fail; no scroll occurs

### useAutoOpenArtifact.ts

**Line 82-92:** Force scroll on artifact mount
```typescript
// Force artifact pane to show content immediately, regardless of chat scroll position
// Use setTimeout to ensure DOM has updated
setTimeout(() => {
  const artifactPane = document.querySelector('.artifact-pane') as HTMLElement;
  if (artifactPane) {
    artifactPane.scrollTop = 0;
    const contentSection = artifactPane.querySelector('section[data-artifact-id]') as HTMLElement;
    if (contentSection) {
      contentSection.scrollTop = 0;
    }
  }
}, 100);
```
- **Purpose:** Reset scroll position when new artifact opens
- **Impact:** **High** - Attempts to set `scrollTop` on blocked containers
- **Result:** Operations silently fail (scrollTop remains 0, but not because of this code)

### Summary of JS Scroll Interference

| Location | Method | Line | Effect | Severity |
|----------|--------|------|--------|----------|
| ArtifactPane.tsx | `addEventListener('scroll')` | 64 | Never fires (container not scrollable) | Low |
| useAutoFocusArtifact.ts | `.scrollIntoView()` | 17 | Fails silently (container blocked) | High |
| useAutoFocusArtifact.ts | `.scrollTo()` | 22 | Fails silently (container blocked) | High |
| useAutoOpenArtifact.ts | `.scrollTop = 0` | 86, 89 | Fails silently (containers blocked) | Medium |

**No scroll prevention found** (no `preventDefault()`, no wheel event blocking, no MutationObserver interference)

**Scroll operations fail because CSS blocks scrolling**, not because JS prevents it.

---

## 5. Constraints Summary

### CRITICAL (Prevents scroll completely)

1. **Global CSS wildcard rule** [index.css:521]
   ```css
   .artifact-pane * {
     overflow: hidden !important;
   }
   ```
   - **Impact:** All descendants inherit `overflow: hidden !important`
   - **Severity:** CRITICAL - Blocks all scrollable containers within artifact pane
   - **Cascade depth:** Infinite (applies to all nested children)

2. **Artifact pane root block** [index.css:522]
   ```css
   .artifact-pane {
     overflow: hidden !important;
   }
   ```
   - **Impact:** Root-level scroll prevention
   - **Severity:** CRITICAL

3. **Touch action disabled** [index.css:525]
   ```css
   .artifact-pane * {
     touch-action: none !important;
   }
   ```
   - **Impact:** Disables touch scrolling on mobile/trackpad
   - **Severity:** CRITICAL (mobile users cannot scroll at all)

### HIGH (Causes chat coupling or clipped content)

4. **SplitContainer right wrapper** [SplitContainer.tsx:43]
   ```tsx
   className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"
   ```
   - **Impact:** Parent-level overflow blocking
   - **Severity:** HIGH - Clips content even if child rules are fixed

5. **#artifact-scroll className** [ArtifactPane.tsx:133]
   ```tsx
   className="flex-1 min-h-0 overflow-hidden overscroll-contain"
   ```
   - **Impact:** Explicit `overflow-hidden` on intended scroll container
   - **Severity:** HIGH - Double blocking (CSS + class)

6. **Overscroll behavior disabled** [index.css:523]
   ```css
   .artifact-pane * {
     overscroll-behavior: none !important;
   }
   ```
   - **Impact:** Prevents scroll chaining to parent containers
   - **Severity:** HIGH

### MEDIUM (Redundant or conflicting overflow rules)

7. **CSS containment on #artifact-scroll** [index.css:464-467]
   ```css
   #artifact-scroll {
     contain: layout paint size;
     isolation: isolate;
   }
   ```
   - **Impact:** Isolates layout but doesn't enable scrolling
   - **Severity:** MEDIUM - Good intent, wrong context (needs overflow-y: auto)

8. **Webkit scroll prevention** [index.css:524]
   ```css
   .artifact-pane * {
     -webkit-overflow-scrolling: auto !important;
   }
   ```
   - **Impact:** Disables momentum scrolling on iOS
   - **Severity:** MEDIUM

### LOW (Cosmetic layout side effects)

9. **Fixed height chain** [MainChatLayout.tsx:511, SplitContainer.tsx:29-50, ArtifactPane.tsx:100]
   - `main`: `height: calc(100vh - 64px)`
   - `SplitContainer` children: `h-full` (100%)
   - `.artifact-pane`: `h-full` (100%)
   - **Impact:** No dynamic height adjustment; content clips instead of scrolls
   - **Severity:** LOW (expected behavior, but requires scroll to be enabled)

10. **Pointer events override** [index.css:526]
    ```css
    .artifact-pane * {
      pointer-events: auto !important;
    }
    ```
    - **Impact:** Forces pointer events on all elements
    - **Severity:** LOW (cosmetic, no scroll impact)

---

## 6. Recommended Fix Strategy (Short)

**No edits applied — outline only**

### Phase 1: Remove Global CSS Blocks (CRITICAL)

**File:** `apps/web/src/index.css`

**Lines 520-537:** Delete or modify the entire `.artifact-pane` ruleset
```css
/* DELETE OR COMMENT OUT LINES 520-537 */
.artifact-pane,
.artifact-pane * {
  overflow: hidden !important;
  overscroll-behavior: none !important;
  -webkit-overflow-scrolling: auto !important;
  touch-action: none !important;
  pointer-events: auto !important;
}
```

**Replacement (suggested):**
```css
/* Allow artifact pane to have scrollable descendants */
.artifact-pane {
  overflow: visible; /* or overflow-y: hidden if top-level scroll not desired */
  overscroll-behavior: contain; /* prevent scroll chaining */
}

/* Enable smooth scrolling on scroll container */
#artifact-scroll {
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; /* Enable iOS momentum */
  touch-action: pan-y; /* Allow vertical touch scrolling */
}
```

### Phase 2: Fix SplitContainer Right Wrapper (HIGH)

**File:** `apps/web/src/components/SplitContainer.tsx`

**Line 43:** Replace `overflow-hidden` with `overflow-visible` or remove entirely
```tsx
// BEFORE:
className="flex-shrink-0 h-full min-h-0 overflow-hidden flex flex-col"

// AFTER:
className="flex-shrink-0 h-full min-h-0 flex flex-col"
```

### Phase 3: Fix #artifact-scroll className (HIGH)

**File:** `apps/web/src/components/ArtifactPane.tsx`

**Line 133:** Replace `overflow-hidden` with `overflow-y-auto`
```tsx
// BEFORE:
className="flex-1 min-h-0 overflow-hidden overscroll-contain"

// AFTER:
className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
```

### Phase 4: Update CSS Containment (OPTIONAL)

**File:** `apps/web/src/index.css`

**Lines 464-467:** Already correct, but ensure it's not accidentally deleted
```css
#artifact-scroll {
  contain: layout paint; /* Remove 'size' to allow dynamic height */
  isolation: isolate;
  overflow-y: auto; /* ADD THIS if not in className */
}
```

### Verification Checklist

After fixes, verify:
1. [ ] Artifact pane content scrolls independently from chat
2. [ ] Chat scrolling does not affect artifact pane
3. [ ] Scroll wheel events work in artifact pane
4. [ ] Touch/trackpad scrolling works on artifact pane (mobile/tablet)
5. [ ] `scrollIntoView()` and `scrollTo()` calls in hooks execute successfully
6. [ ] Dev instrumentation overlay shows changing `scrollTop` values
7. [ ] No layout shift or visual regressions

---

## 7. Verification Script

### Runtime Testing (Paste into browser console)

```js
// Identify all scrollable containers in the page
const scrollableNodes = [...document.querySelectorAll('*')].filter(e => {
  const cs = getComputedStyle(e);
  return /(auto|scroll)/.test(cs.overflowY);
}).map(e => ({
  node: e.className || e.tagName, 
  id: e.id || 'N/A',
  overflowY: getComputedStyle(e).overflowY, 
  height: e.clientHeight,
  scrollHeight: e.scrollHeight,
  canScroll: e.scrollHeight > e.clientHeight
}));

console.table(scrollableNodes);
console.log('Total scrollable nodes:', scrollableNodes.length);
console.log('Expected: At least 2 (chat-container + artifact-scroll)');
```

### Expected Output (BEFORE FIX)

```js
[
  {
    node: "chat-container",
    id: "N/A",
    overflowY: "auto",
    height: 800,
    scrollHeight: 2400,
    canScroll: true
  }
]
// Total scrollable nodes: 1
// Expected: At least 2 (chat-container + artifact-scroll)
```

### Expected Output (AFTER FIX)

```js
[
  {
    node: "chat-container",
    id: "N/A",
    overflowY: "auto",
    height: 800,
    scrollHeight: 2400,
    canScroll: true
  },
  {
    node: "flex-1 min-h-0 overflow-y-auto overscroll-contain",
    id: "artifact-scroll",
    overflowY: "auto",
    height: 900,
    scrollHeight: 1500,
    canScroll: true
  }
]
// Total scrollable nodes: 2
// Expected: At least 2 (chat-container + artifact-scroll)
```

### Additional Verification: Artifact Pane Scroll Test

```js
// Test artifact scroll container
const artifactScroll = document.getElementById('artifact-scroll');
if (!artifactScroll) {
  console.error('❌ #artifact-scroll not found - split view may not be open');
} else {
  const cs = getComputedStyle(artifactScroll);
  const metrics = {
    overflowY: cs.overflowY,
    overflowX: cs.overflowX,
    overscrollBehavior: cs.overscrollBehavior,
    touchAction: cs.touchAction,
    height: artifactScroll.clientHeight,
    scrollHeight: artifactScroll.scrollHeight,
    canScroll: artifactScroll.scrollHeight > artifactScroll.clientHeight,
    currentScrollTop: artifactScroll.scrollTop
  };
  
  console.log('Artifact Scroll Metrics:');
  console.table(metrics);
  
  // Test scroll capability
  if (metrics.overflowY === 'hidden') {
    console.error('❌ FAIL: overflow-y is hidden');
  } else if (metrics.overflowY === 'auto' || metrics.overflowY === 'scroll') {
    console.log('✅ PASS: overflow-y allows scrolling');
  }
  
  if (metrics.touchAction === 'none') {
    console.error('❌ FAIL: touch-action is none (touch scroll disabled)');
  } else {
    console.log('✅ PASS: touch-action allows scrolling');
  }
  
  // Attempt programmatic scroll
  const originalScrollTop = artifactScroll.scrollTop;
  artifactScroll.scrollTop = 100;
  setTimeout(() => {
    if (artifactScroll.scrollTop === 100) {
      console.log('✅ PASS: Programmatic scroll works');
    } else {
      console.error('❌ FAIL: Programmatic scroll blocked');
    }
    // Restore
    artifactScroll.scrollTop = originalScrollTop;
  }, 100);
}
```

### Instrumentation Test: Check All `.artifact-pane` Descendants

```js
// Find all children of .artifact-pane and check their overflow
const artifactPane = document.querySelector('.artifact-pane');
if (!artifactPane) {
  console.error('❌ .artifact-pane not found - split view may not be open');
} else {
  const children = [...artifactPane.querySelectorAll('*')];
  const blockedChildren = children.filter(el => {
    const cs = getComputedStyle(el);
    return cs.overflow === 'hidden' || cs.overflowY === 'hidden';
  }).map(el => ({
    tag: el.tagName,
    id: el.id || 'N/A',
    className: el.className || 'N/A',
    overflow: getComputedStyle(el).overflow,
    overflowY: getComputedStyle(el).overflowY
  }));
  
  console.log(`Found ${blockedChildren.length} children with overflow: hidden`);
  console.log('Expected AFTER FIX: 0 (except intentionally clipped elements)');
  console.table(blockedChildren.slice(0, 20)); // Show first 20
}
```

---

## 8. Acceptance Criteria Validation

### ✅ Must identify exactly one scroll container (chat)

**CONFIRMED:** `.chat-container` (MainChatLayout.tsx:87) is the ONLY scrollable container.

**Evidence:**
- `overflow-y-auto` applied
- `scrollHeight > clientHeight`
- Chat messages scroll independently

### ✅ Must confirm all artifact wrapper nodes have overflow-hidden

**CONFIRMED:** All artifact nodes have `overflow: hidden` or `overflow: hidden !important`.

**Evidence:**
- SplitContainer right wrapper: `overflow-hidden` (line 43)
- `.artifact-pane`: `overflow: hidden !important` (index.css:522)
- `.artifact-pane *`: `overflow: hidden !important` (index.css:521)
- `#artifact-scroll`: `overflow-hidden` class (ArtifactPane.tsx:133)

**Node count:** 10+ blocked nodes in artifact hierarchy

### ✅ Must show line numbers for each finding

**CONFIRMED:** All findings include file paths and line numbers.

**Examples:**
- index.css:521 (`.artifact-pane *` wildcard)
- index.css:522 (`.artifact-pane` root)
- SplitContainer.tsx:43 (right wrapper `overflow-hidden`)
- ArtifactPane.tsx:133 (`#artifact-scroll` className)

### ✅ Must flag any JS scroll-prevention logic

**CONFIRMED:** No JS scroll prevention detected.

**Findings:**
- No `preventDefault()` calls on wheel/scroll events
- No MutationObserver scroll suppression
- No setInterval/setTimeout scroll locking
- JS scroll operations (scrollIntoView, scrollTo, scrollTop) fail **due to CSS blocks**, not JS prevention

**JS operations that fail:**
- useAutoFocusArtifact.ts:17 (`scrollIntoView`)
- useAutoFocusArtifact.ts:22 (`scrollTo`)
- useAutoOpenArtifact.ts:86, 89 (`scrollTop = 0`)

### ✅ No code is to be modified

**CONFIRMED:** This report is READ-ONLY. No code changes have been applied.

---

## 9. Conclusion

The artifact pane scroll failure is caused by **aggressive CSS overflow blocking** applied globally to `.artifact-pane` and all its descendants. The intended scroll container (`#artifact-scroll`) is double-blocked by:
1. Global CSS rule: `.artifact-pane * { overflow: hidden !important }`
2. Component className: `overflow-hidden`

To restore independent scrolling, the global CSS rules (index.css:520-537) must be removed or modified to allow `overflow-y: auto` on designated scroll containers. The fix strategy outlined in Section 6 provides a clear path forward.

**Next Steps:**
1. Remove or modify global CSS blocks (index.css:520-537)
2. Update SplitContainer right wrapper (remove `overflow-hidden`)
3. Update `#artifact-scroll` className (replace `overflow-hidden` with `overflow-y-auto`)
4. Test using verification scripts in Section 7
5. Validate against acceptance criteria in Section 8

**Estimated Fix Complexity:** Low (3 file edits, ~10 lines total)

**Estimated Testing Time:** Medium (requires manual scroll testing + verification scripts)

---

## 10. Appendix: Full File References

### Files Audited

1. `apps/web/src/layouts/MainChatLayout.tsx` (562 lines)
2. `apps/web/src/components/SplitContainer.tsx` (54 lines)
3. `apps/web/src/components/ArtifactPane.tsx` (625 lines)
4. `apps/web/src/store/uiStore.ts` (60 lines)
5. `apps/web/src/store/artifactStore.ts` (209 lines)
6. `apps/web/src/hooks/useAutoOpenArtifact.ts` (107 lines)
7. `apps/web/src/hooks/useAutoFocusArtifact.ts` (28 lines)
8. `apps/web/src/components/ArtifactPortal.tsx` (24 lines)
9. `apps/web/src/index.css` (539 lines)

### Key Code Locations

| Issue | File | Lines |
|-------|------|-------|
| Global overflow block | index.css | 520-537 |
| CSS containment | index.css | 464-467 |
| Right wrapper block | SplitContainer.tsx | 43 |
| #artifact-scroll block | ArtifactPane.tsx | 133 |
| scrollIntoView fail | useAutoFocusArtifact.ts | 17, 22 |
| scrollTop fail | useAutoOpenArtifact.ts | 86, 89 |
| Main layout height | MainChatLayout.tsx | 511 |
| Chat scroll container | MainChatLayout.tsx | 87 |

---

**END OF REPORT**

