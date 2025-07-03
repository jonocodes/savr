# SAVR App Icons

This directory contains the icon assets for the SAVR PWA.

## Current Files

- `icon.svg` - Source SVG icon (use this to generate PNG files)
- `favicon.png` - Placeholder for 16x16 favicon
- `icon.png` - Placeholder for 192x192 PWA icon
- `adaptive-icon.png` - Placeholder for 512x512 Android adaptive icon
- `splash-icon.png` - Placeholder for 512x512 splash screen icon
- `icon-generator.html` - Tool to generate PNG icons from SVG

## How to Generate Icons

### Option 1: Use the HTML Generator (Easiest)

1. Open `icon-generator.html` in your browser
2. Click the download buttons for each size
3. Replace the placeholder files with the downloaded PNGs

### Option 2: Use Online Tools

1. Use the SVG at `icon.svg` as your source
2. Convert using online tools like:
   - [Convertio](https://convertio.co/svg-png/)
   - [CloudConvert](https://cloudconvert.com/svg-to-png)
   - [Figma](https://figma.com) (import SVG, export PNG)

### Option 3: Use Command Line Tools

```bash
# Using ImageMagick
convert icon.svg -resize 16x16 favicon.png
convert icon.svg -resize 192x192 icon.png
convert icon.svg -resize 512x512 adaptive-icon.png

# Using Inkscape
inkscape -w 16 -h 16 icon.svg -o favicon.png
inkscape -w 192 -h 192 icon.svg -o icon.png
inkscape -w 512 -h 512 icon.svg -o adaptive-icon.png
```

## Required Sizes

- `favicon.png` - 16x16px (browser tab icon)
- `icon.png` - 192x192px (PWA manifest)
- `adaptive-icon.png` - 512x512px (Android adaptive icons)
- `splash-icon.png` - 512x512px (app splash screen)

## Icon Design

The current icon features:

- Blue circular background (#007AFF)
- White book/article with text lines
- Orange bookmark tab
- "SAVR" text at the bottom

Feel free to modify the SVG to create your own design!
