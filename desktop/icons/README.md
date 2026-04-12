# Icon Assets

`icon.svg` is the master vector source for the Ultra Computer logo.

## Generating Required Formats

electron-builder needs platform-specific icon files before you can package the app.
Generate them from `icon.svg` using one of the methods below.

### Required files

| File           | Size(s)               | Platform      |
|----------------|-----------------------|---------------|
| `icon.ico`     | 16, 32, 48, 64, 256 px| Windows       |
| `icon.icns`    | 16–1024 px (multi)    | macOS         |
| `icon.png`     | 512×512 px            | Linux         |
| `icon-tray.png`| 16×16 or 22×22 px     | All (tray)    |

### Using `electron-icon-builder` (recommended)

```bash
npm install -g electron-icon-builder
electron-icon-builder --input=icon.svg --output=./
```

This generates all formats automatically.

### Using ImageMagick

```bash
# PNG (Linux)
convert -background none icon.svg -resize 512x512 icon.png

# Tray PNG
convert -background none icon.svg -resize 22x22 icon-tray.png

# ICO (Windows) — requires multi-size
convert -background none icon.svg \
  \( -clone 0 -resize 16x16 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 icon.ico

# ICNS (macOS) — requires iconutil or png2icns
mkdir icon.iconset
convert -background none icon.svg -resize 16x16   icon.iconset/icon_16x16.png
convert -background none icon.svg -resize 32x32   icon.iconset/icon_16x16@2x.png
convert -background none icon.svg -resize 32x32   icon.iconset/icon_32x32.png
convert -background none icon.svg -resize 64x64   icon.iconset/icon_32x32@2x.png
convert -background none icon.svg -resize 128x128 icon.iconset/icon_128x128.png
convert -background none icon.svg -resize 256x256 icon.iconset/icon_128x128@2x.png
convert -background none icon.svg -resize 256x256 icon.iconset/icon_256x256.png
convert -background none icon.svg -resize 512x512 icon.iconset/icon_256x256@2x.png
convert -background none icon.svg -resize 512x512 icon.iconset/icon_512x512.png
convert -background none icon.svg -resize 1024x1024 icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
```

### Online converters

- https://cloudconvert.com/svg-to-ico  
- https://cloudconvert.com/svg-to-icns  
- https://www.pngtoico.com/
