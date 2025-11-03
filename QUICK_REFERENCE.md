# Quick Reference: Opera Colorscheme & ChatInput Code Snippets

## 1. Colorscheme - Exact CSS Variables

### Opera's globals.css (lines 9-19)
```css
:root {
  --background: 15 15 15;
  --foreground: 255 255 255;
  
  --glass-light: rgba(255, 255, 255, 0.05);
  --glass-medium: rgba(255, 255, 255, 0.08);
  --glass-heavy: rgba(255, 255, 255, 0.12);
  
  --purple: 168 85 247;
  --blue: 59 130 246;
}

body {
  @apply bg-[#0f0f0f] text-white/95 antialiased;
}
```

### Glass Effect Utilities (lines 30-47)
```css
.glass {
  @apply backdrop-blur-xl;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.glass-light {
  @apply backdrop-blur-[12px];
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-heavy {
  @apply backdrop-blur-[20px];
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

## 2. ChatInput Container Styling

### Main Container Class
```tsx
className={cn(
  'glass rounded-lg border border-white/15 shadow-2xl shadow-black/50 overflow-hidden',
  className
)}
```

### Breakdown:
- `glass` - Glass effect utility class
- `rounded-lg` - Large border radius
- `border border-white/15` - 15% white border
- `shadow-2xl shadow-black/50` - Large shadow with 50% black opacity
- `overflow-hidden` - Clip content to rounded corners

## 3. Textarea Styling

### Opera's Textarea Component (lines 61-67)
```tsx
className={cn(
  'w-full bg-black/40 border border-white/15 rounded-md px-3 py-2 pr-28',
  'text-white/95 placeholder:text-white/30',
  'focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/15',
  'resize-none font-sans text-sm leading-relaxed transition-all',
  className
)}
```

### Key Features:
- Background: `bg-black/40` (40% black)
- Border: `border-white/15` (15% white)
- Text: `text-white/95` (95% white)
- Placeholder: `text-white/30` (30% white)
- Focus: Border becomes `white/30`, adds ring

## 4. Button Variants

### Opera's Button Variants (lines 16-22)
```typescript
const buttonVariants = {
  primary: 'glass bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-white/10 hover:from-purple-500/30 hover:to-blue-500/30 hover:border-white/20 hover:shadow-lg hover:shadow-purple-500/20',
  secondary: 'glass-light bg-white/5 border border-white/10 hover:bg-white/8 hover:text-white/90 hover:border-white/15',
  icon: 'p-1.5 rounded border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all group',
  ghost: 'text-white/70 hover:text-white/90 hover:bg-white/5 transition-colors',
  mode: 'px-2 py-1 rounded text-xs font-semibold transition-all uppercase tracking-wide',
};
```

## 5. ChatInput Structure

### Component Hierarchy
```
ChatInput (glass container)
├── Attachments Preview (if attachments.length > 0)
│   └── Attachment cards with preview/remove
├── Hidden File Input
└── Main Input Area
    ├── Input Field Container
    │   ├── Textarea (auto-resize)
    │   └── Action Buttons (absolute positioned)
    │       ├── Paperclip (attach file)
    │       ├── Mic (voice input)
    │       └── Send (submit)
    ├── Action Buttons Row (Search, Research, Artifact)
    └── Bottom Row
        ├── Auth Buttons (if not signed in)
        └── Quick Actions (if signed in)
```

## 6. Key Icons Used

From `lucide-react`:
- `Search` - Search icon
- `Send` - Send message
- `Mic` - Voice input
- `Paperclip` - Attach file
- `BookOpen` - Research mode
- `Package` - Artifact mode
- `X` - Remove attachment

## 7. Tailwind Config Extensions

### Opera's Tailwind Config (key parts)
```javascript
theme: {
  extend: {
    colors: {
      background: {
        primary: '#0f0f0f',
        secondary: '#1a1a1a',
        tertiary: '#252525',
      },
      accent: {
        DEFAULT: '#7c3aed',      // Primary accent
        soft: '#a78bfa',         // Soft accent (hover)
        muted: '#4c1d95',         // Muted accent (dividers)
      },
      purple: {
        500: '#a855f7',
        600: '#9333ea',
      },
      blue: {
        500: '#3b82f6',
        600: '#2563eb',
      },
    },
    boxShadow: {
      'card': '0 0 10px rgba(30, 30, 30, 0.8)',
      'card-hover': '0 4px 12px rgba(0, 0, 0, 0.3)',
      'soft': '0 4px 12px rgba(0, 0, 0, 0.3)',
      'medium': '0 8px 20px rgba(0, 0, 0, 0.4)',
    },
  },
}
```

## 8. File Attachment Handling

### File Types Supported
- Images: `image/*`
- Documents: `.pdf`, `.doc`, `.docx`, `.txt`, `.csv`, `.json`, `.md`, `.xlsx`, `.xls`, `.rtf`, `.odt`

### File Size Limits
- Images: 100MB max
- Documents: 50MB max

### Attachment Preview Structure
```typescript
interface FileAttachment {
  file: File;
  preview?: string;        // base64 for images
  content?: string;        // text content for documents
  type: 'image' | 'document';
  mimeType: string;
  size: number;
  isProcessing?: boolean;
  error?: string;
}
```

## 9. Action Buttons Styling

### Search/Research/Artifact Buttons
```tsx
className="px-2 py-1 text-xs font-medium text-white border border-white/20 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
```

### Features:
- Small padding (`px-2 py-1`)
- Small text (`text-xs`)
- Glass effect (`bg-white/5 backdrop-blur-sm`)
- Border with hover state
- Disabled state styling

## 10. Auth Buttons (when signed out)

### Login Button
```tsx
className="px-4 py-1.5 text-xs font-medium text-black bg-white rounded-lg hover:bg-white/95 active:bg-white/90 transition-all duration-200 flex items-center justify-center shadow-sm"
```

### Sign Up Button
```tsx
className="px-4 py-1.5 text-xs font-medium text-white bg-white/[0.12] backdrop-blur-md border border-white/[0.15] rounded-lg hover:bg-white/[0.18] hover:border-white/[0.25] active:bg-white/[0.15] transition-all duration-200 flex items-center justify-center shadow-[0_0_0_0.5px_rgba(255,255,255,0.05)]"
```

## 11. Utility Function

### cn() Utility (from utils.ts)
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs.filter(Boolean)));
}
```

## 12. Key Animations

### Button Hover/Tap (from Button.tsx)
```typescript
const motionProps = {
  whileHover: !disabled && !isLoading && shouldAnimate 
    ? { scale: 1.02 } 
    : undefined,
  whileTap: !disabled && !isLoading && shouldAnimate 
    ? { scale: 0.98 } 
    : undefined,
};
```

## 13. Color Comparison

| Element | Opera | Current Build |
|---------|-------|---------------|
| Background | `#0f0f0f` | `#0b0c10` |
| Glass BG | `rgba(255,255,255,0.05-0.12)` | `color-mix(in srgb, var(--surface) 92%, transparent)` |
| Border | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.09)` |
| Text | `white/95` | `#e6e7ea` |
| Accent | Purple `#a855f7` + Blue `#3b82f6` | Blue `#2ea0ff` |

## 14. Critical CSS Classes to Add

```css
/* Add to theme.css or globals.css */
.glass {
  @apply backdrop-blur-xl;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.glass-light {
  @apply backdrop-blur-[12px];
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-heavy {
  @apply backdrop-blur-[20px];
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

## 15. Minimum Required Changes

### For Basic Colorscheme:
1. Update `--bg` to `#0f0f0f`
2. Add glass utility classes
3. Update body background

### For Basic ChatInput:
1. Add glass container styling
2. Update textarea styling
3. Add icon buttons (Send, Paperclip, Mic)
4. Implement auto-resize textarea

### For Full ChatInput:
1. All of the above +
2. File attachment handling
3. Mode buttons (Search, Research, Artifact)
4. Auth integration
5. Loading states

---

## File Locations Reference

### Opera Source Files:
- Colorscheme: `/Desktop/opera/apps/web/app/globals.css`
- ChatInput: `/Desktop/opera/packages/ui/src/components/ChatInput.tsx`
- Button: `/Desktop/opera/packages/ui/src/components/Button.tsx`
- Textarea: `/Desktop/opera/packages/ui/src/components/Textarea.tsx`
- Utils: `/Desktop/opera/packages/ui/src/shared/utils.ts`
- Tailwind Config: `/Desktop/opera/apps/web/tailwind.config.ts`

### Current Build Target Files:
- Colorscheme: `/Desktop/2.0/apps/web/src/index.css`
- Theme: `/Desktop/2.0/apps/web/src/theme.css`
- ChatInput: `/Desktop/2.0/apps/web/src/components/chat/ChatInput.tsx` (new)
- CenterComposer: `/Desktop/2.0/apps/web/src/components/home/CenterComposer.tsx` (update)
- Button: `/Desktop/2.0/apps/web/src/components/ui/button.tsx` (update)
- Textarea: `/Desktop/2.0/apps/web/src/components/ui/textarea.tsx` (update)
- Tailwind Config: `/Desktop/2.0/apps/web/tailwind.config.cjs` (update)

