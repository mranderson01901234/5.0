# Code Block UI Demo

## Example Usage

When a user or assistant sends a message with code blocks, they will now be rendered with the modern glassmorphic UI.

### Example 1: JavaScript Code

Input:
```
\`\`\`javascript
import React, { useState, useEffect } from 'react';

const ExpenseTracker = () => {
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses));
  }, [expenses]);

  const addExpense = () => {
    // Add expense logic here
  };

  return (
    <div className="container">
      <h1>Expense Tracker</h1>
      {/* UI components */}
    </div>
  );
};

export default ExpenseTracker;
\`\`\`
```

Output: Rendered as a beautiful glassmorphic code block with:
- **Language Badge**: Small blue badge showing "javascript"
- **Copy Button**: Hover-activated button in top-right
- **Line Numbers**: 1-22 on the left side in grey
- **Syntax Highlighting**:
  - `import`, `const`, `export`, `default`, `return` → Amber
  - `React`, `useState`, `useEffect`, `ExpenseTracker`, `addExpense` → Blue
  - `'react'`, `'expenses'`, `"container"`, `"Expense Tracker"` → Cyan
  - `// Add expense logic here` → Slate grey

### Example 2: Python Code

Input:
```
\`\`\`python
def calculate_fibonacci(n):
    """Calculate Fibonacci sequence up to n terms."""
    sequence = []
    a, b = 0, 1
    
    for i in range(n):
        sequence.append(a)
        a, b = b, a + b
    
    return sequence

# Example usage
result = calculate_fibonacci(10)
print(f"Fibonacci sequence: {result}")
\`\`\`
```

Output: Rendered with:
- **Language Badge**: "python"
- **Syntax Highlighting**:
  - `def`, `return`, `for`, `in`, `range` → Amber
  - `calculate_fibonacci`, `append`, `print` → Blue
  - `"""Calculate..."""`, `"Fibonacci sequence: {result}"` → Cyan
  - `# Example usage` → Slate grey
  - `0`, `1`, `10` → Violet

### Example 3: Generic/Unknown Language

Input:
```
\`\`\`
SELECT users.name, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'completed'
ORDER BY orders.created_at DESC;
\`\`\`
```

Output: Rendered with:
- **No Language Badge**: (no language specified)
- **No Syntax Highlighting**: Just clean monospace text with line numbers
- **Same Glassmorphic Container**: Still looks modern and professional

## Visual Design Specifications

### Container
- **Background**: `rgba(30, 41, 59, 0.3)` - Semi-transparent slate
- **Backdrop Filter**: `blur(16px)` - Glassmorphic effect
- **Border**: `1px solid rgba(71, 85, 105, 0.4)` - Subtle slate border
- **Border Radius**: `12px` - Rounded corners
- **Box Shadow**: Soft drop shadow for depth
- **Margin**: `16px 0` - Vertical spacing

### Header Bar
- **Height**: Minimal `24px` padding
- **Background**: Integrated into container (no separate background)
- **Layout**: Flexbox with space-between
- **Elements**:
  - Left: Language badge (if applicable)
  - Right: Copy button

### Language Badge
- **Background**: `rgba(59, 130, 246, 0.2)` - Blue with transparency
- **Border**: `1px solid rgba(59, 130, 246, 0.3)` - Blue border
- **Color**: `rgba(96, 165, 250, 1)` - Bright blue text
- **Padding**: `2px 8px`
- **Font**: `12px medium`
- **Border Radius**: `6px`

### Copy Button
- **Default State**: 60% opacity, subtle grey
- **Hover State**: 100% opacity, blue highlight
- **Copied State**: Green confirmation
- **Transition**: 200ms smooth
- **Icon**: SVG copy icon
- **Size**: `12px` text with `12px` icon

### Code Content
- **Font**: Monospace (`Monaco`, `Consolas`, `Courier New`)
- **Font Size**: `13px`
- **Line Height**: `1.6`
- **Padding**: `12px 16px`
- **Max Height**: `600px` with scroll

### Line Numbers
- **Width**: `48px` fixed
- **Alignment**: Right-aligned
- **Color**: `#64748b` (slate-500)
- **Padding Right**: `16px`
- **User Select**: None (not selectable)

### Syntax Colors
1. **Keywords** (`#f59e0b` - amber-500): const, let, var, function, return, if, else, etc.
2. **Functions** (`#60a5fa` - blue-400): Function names, method calls
3. **Strings** (`#22d3ee` - cyan-400): String literals in quotes
4. **Comments** (`#64748b` - slate-500): Single and multi-line comments
5. **Numbers** (`#a78bfa` - violet-400): Numeric values
6. **Operators** (`#fb923c` - orange-400): +, -, *, /, =, etc.
7. **Classes** (`#34d399` - emerald-400): Class names
8. **Default** (`#e2e8f0` - slate-200): Regular text

### Scrollbars
- **Width**: `8px`
- **Track**: Transparent
- **Thumb**: `rgba(71, 85, 105, 0.5)` - Semi-transparent slate
- **Thumb Hover**: `rgba(71, 85, 105, 0.7)` - More opaque
- **Border Radius**: `4px`

## Responsive Behavior

### Width
- **Desktop**: Full chat width minus padding (typically ~90% of chat area)
- **Mobile**: Full width with horizontal scroll if needed
- **Max Width**: Inherits from parent container

### Height
- **Auto**: Adjusts to content
- **Max**: 600px
- **Overflow**: Vertical scroll with custom scrollbar

### Horizontal Overflow
- **Behavior**: Horizontal scroll for long lines
- **Scrollbar**: Custom styled, only appears when needed

## User Interactions

### Copy Functionality
1. **Default**: Copy button visible at 60% opacity
2. **Hover**: Button highlights in blue, 100% opacity
3. **Click**: Copies entire code block to clipboard
4. **Feedback**: Button changes to "Copied!" with green styling for 2 seconds
5. **Reset**: Returns to default state after 2 seconds

### Hover Effects
- **Container**: No hover effect (stays stable)
- **Copy Button**: Opacity and color transition
- **Line Numbers**: No hover effect (stable)
- **Code Lines**: No hover effect (stable)

## Integration

The code block UI is automatically detected and rendered when:
1. Message content contains triple backticks (\`\`\`)
2. Optional language identifier follows opening backticks
3. Code content is between opening and closing backticks
4. Closing backticks are on their own line

Example markdown:
```
\`\`\`javascript
console.log('Hello World!');
\`\`\`
```

This will be parsed and rendered as a CodeBlock component with syntax highlighting.

## Browser Compatibility

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

- **Keyboard Navigation**: Copy button is keyboard accessible
- **Screen Readers**: Code content is readable
- **Color Contrast**: All colors meet WCAG AA standards
- **Focus States**: Clear focus indicators on interactive elements

## Performance

- **Lazy Rendering**: Large code blocks are optimized
- **Syntax Highlighting**: Client-side with minimal overhead
- **Memory**: Efficient line-by-line rendering
- **Scrolling**: Smooth with hardware acceleration

## Known Limitations

1. **Syntax Highlighting**: Basic implementation, not as advanced as Prism.js or highlight.js
2. **Language Detection**: Requires explicit language identifier in markdown
3. **Themes**: Single dark theme (matches chat design)
4. **Line Wrapping**: Long lines scroll horizontally (no word wrap)

## Future Enhancements

- [ ] Advanced syntax highlighting library integration
- [ ] Theme customization
- [ ] Line highlighting for specific lines
- [ ] Code folding for long blocks
- [ ] Download as file option
- [ ] Inline code execution (for specific languages)
- [ ] Diff view for code changes
- [ ] Search within code block

