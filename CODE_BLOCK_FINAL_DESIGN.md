# Code Block UI - Final Design

## Overview
Modern code block component with **colorful syntax highlighting** for code and **monochrome grey UI** for all controls and container.

## Design Specifications

### Container (Monochrome)
- **Background**: `rgba(55, 55, 60, 0.4)` - Dark grey semi-transparent
- **Backdrop Filter**: `blur(12px)` - Glassmorphic effect
- **Border**: `1px solid rgba(75, 75, 80, 0.5)` - Grey border
- **Border Radius**: `8px` - Rounded corners
- **Margin**: `16px 0` - Vertical spacing

### Inline Controls (Monochrome)
Located inside the code block at the top:

#### Language Badge
- **Background**: `rgba(100, 100, 105, 0.3)` - Grey transparent
- **Border**: `1px solid rgba(100, 100, 105, 0.4)` - Grey border
- **Color**: `rgba(156, 163, 175, 1)` - Grey text (gray-400)
- **Font**: `10px uppercase` with tracking
- **Position**: Top-left inside code block

#### Copy Button
- **Default State**: Grey transparent background, grey text
- **Hover State**: Slightly more opaque grey
- **Copied State**: Grey confirmation
- **Icon**: Grey SVG icons
- **Position**: Top-right inside code block

### Divider Line
- **Border**: `border-b border-gray-700/30`
- **Position**: Below controls, above code
- **Purpose**: Separates controls from code content

### Line Numbers (Monochrome)
- **Color**: `#6b7280` (gray-500)
- **Width**: `48px` fixed
- **Alignment**: Right-aligned
- **User Select**: None (not selectable)

### Code Syntax Highlighting (Colorful)
1. **Keywords** (`#f59e0b` - amber-500): 
   - `const`, `let`, `var`, `function`, `return`, `if`, `else`, `for`, `while`, `import`, `export`, `from`, `class`, etc.

2. **Functions** (`#60a5fa` - blue-400):
   - Function names, method calls
   - Example: `useState`, `useEffect`, `console.log`

3. **Strings** (`#22d3ee` - cyan-400):
   - String literals in single/double/backtick quotes
   - Example: `'react'`, `"Hello World"`

4. **Comments** (`#64748b` - slate-500):
   - Single-line `//` and multi-line `/* */` comments
   - Example: `// This is a comment`

5. **Numbers** (`#a78bfa` - violet-400):
   - Numeric values
   - Example: `42`, `3.14`

6. **Operators** (`#fb923c` - orange-400):
   - `+`, `-`, `*`, `/`, `=`, etc.

7. **Classes** (`#34d399` - emerald-400):
   - Class names

8. **Default** (`#e2e8f0` - slate-200):
   - Regular code text

### Scrollbars (Monochrome)
- **Width**: `8px`
- **Track**: Transparent
- **Thumb**: `rgba(100, 100, 105, 0.5)` - Grey
- **Thumb Hover**: `rgba(100, 100, 105, 0.7)` - Darker grey
- **Border Radius**: `4px`

## Visual Example

```
┌─────────────────────────────────────────────────────┐
│  [jsx]                              [📋 Copy]       │  ← Grey UI
├─────────────────────────────────────────────────────┤  ← Grey divider
│                                                     │
│  1   import React from 'react';                    │  ← Colorful code
│  2   ↑      ↑            ↑                         │     - orange keywords
│  3   const MyComponent = () => {                   │     - cyan strings
│  4     return <div>Hello</div>;                    │     - blue functions
│  5   };                                            │
│                                                     │
└─────────────────────────────────────────────────────┘
     ↑
   Grey container
```

## Key Design Principles

✅ **Monochrome UI**: All controls, badges, borders, and container in grey tones
✅ **Colorful Code**: Syntax highlighting uses vibrant colors for readability
✅ **Minimal**: No bulky headers, controls are inline and subtle
✅ **Clean Separation**: Divider line separates UI from code
✅ **Glassmorphic**: Semi-transparent background with blur effect
✅ **Full Width**: Utilizes full chat area width

## Layout Structure

```
CodeBlock Component
└── Container (grey glassmorphic)
    └── Scrollable Area
        ├── Control Bar (grey, inside code block)
        │   ├── Language Badge (left, grey)
        │   └── Copy Button (right, grey)
        ├── Divider Line (grey)
        └── Code Content (colorful syntax highlighting)
            └── Line Numbers (grey) + Code Lines (colorful)
```

## Color Palette Summary

### UI Elements (Monochrome Grey)
- Container: `rgba(55, 55, 60, 0.4)`
- Border: `rgba(75, 75, 80, 0.5)`
- Badge: `rgba(100, 100, 105, 0.3)`
- Button: `rgba(100, 116, 139, 0.2)` - grey variations
- Line Numbers: `#6b7280`
- Divider: `border-gray-700/30`

### Code Syntax (Colorful)
- Keywords: `#f59e0b` (amber)
- Functions: `#60a5fa` (blue)
- Strings: `#22d3ee` (cyan)
- Comments: `#64748b` (slate)
- Numbers: `#a78bfa` (violet)
- Operators: `#fb923c` (orange)
- Classes: `#34d399` (emerald)
- Default: `#e2e8f0` (light slate)

## User Interactions

1. **Hover**: Copy button becomes slightly more prominent
2. **Click Copy**: Button shows "Copied" confirmation for 2 seconds
3. **Scroll**: Custom grey scrollbars appear when content overflows
4. **Line Selection**: Code can be selected and copied

## Browser Support
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

## Implementation Files
- `apps/web/src/components/chat/CodeBlock.tsx` - Main component
- `apps/web/src/components/chat/MessageList.tsx` - Integration

## Usage
Automatically renders when markdown code blocks are detected:

\`\`\`javascript
const greeting = "Hello World";
console.log(greeting);
\`\`\`

Result: Renders with grey UI and colorful syntax highlighting!

