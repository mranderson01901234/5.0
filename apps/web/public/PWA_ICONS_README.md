# PWA Icons

## Current Status
A placeholder SVG icon has been created at `pwa-icon.svg`.

## Required Icons
The PWA manifest requires the following PNG icons:
- `pwa-icon-192.png` - 192x192px
- `pwa-icon-512.png` - 512x512px

## How to Generate Icons

### Option 1: Using ImageMagick (if installed)
```bash
convert pwa-icon.svg -resize 192x192 pwa-icon-192.png
convert pwa-icon.svg -resize 512x512 pwa-icon-512.png
```

### Option 2: Using Inkscape (if installed)
```bash
inkscape pwa-icon.svg --export-filename=pwa-icon-192.png --export-width=192 --export-height=192
inkscape pwa-icon.svg --export-filename=pwa-icon-512.png --export-width=512 --export-height=512
```

### Option 3: Online Tools
1. Upload `pwa-icon.svg` to https://cloudconvert.com/svg-to-png
2. Set dimensions to 192x192 and 512x512
3. Download and place in `/public` directory

### Option 4: Design Tool
Open `pwa-icon.svg` in Figma, Sketch, or Adobe Illustrator and export as PNG at the required sizes.

## Customization
Edit `pwa-icon.svg` to customize the icon design. The current design uses:
- Background color: `#7c5cff` (purple)
- Icon: Simple chat/assistant avatar

## Note
For production, consider creating a custom branded icon that represents your application.
