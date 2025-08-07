# Textract - Image Text Extractor

## Folder setup
```md
extractext/
.
├── manifest.json
├── src/
│   ├── background.js
│   ├── content.js
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── assets/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── libs/
│       └── tesseract.min.js
└── README.md
```

##  Setup Instructions

## 1. Download Tesseract.js

You need to download Tesseract.js and place it in your extension folder:

### Option A: Download from CDN
```bash
# Create the libs directory
mkdir libs

# Download Tesseract.js (latest version)
curl -o libs/tesseract.min.js https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.4/tesseract.min.js
```

### Option B: Manual Download
1. Go to: https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.4/tesseract.min.js
2. Save the file as `libs/tesseract.min.js` in your extension folder

## 2. Final Project Structure
```
text-extractor-extension/
├── manifest.json
├── background.js          ← Updated with Tesseract.js OCR
├── content.js            ← Updated to pass settings
├── popup.html
├── popup.js
├── libs/
│   └── tesseract.min.js  ← Download this file
└── icons/ (optional)
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## 3. Load Extension
1. Open Chrome/Edge and go to `chrome://extensions/` or `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select your extension folder
5. The extension should load and show up in your extensions list

## 4. Test It Out!
1. Go to any webpage with images containing text
2. Right-click on an image
3. Select "Copy text from image"
4. Wait a moment (first run takes longer as Tesseract initializes)
5. Paste the extracted text anywhere!

## Features Now Working:
- Real OCR with Tesseract.js
- Image preprocessing for better accuracy
- User settings (auto-enhance, notifications)
- Usage statistics tracking
- Error handling and user feedback
- Works offline (no API calls needed)

## Performance Notes:
- First OCR operation takes 3-5 seconds (Tesseract initialization)
- Subsequent operations are much faster (1-2 seconds)
- Larger/higher resolution images take longer to process
- Auto-enhance improves accuracy but adds slight processing time

## Troubleshooting:
- If context menu doesn't appear: Refresh the page and try again
- If OCR seems slow: This is normal for the first use
- If no text extracted: Try images with clearer, larger text
- Check browser console for detailed error messages

## Potential Improvements (Pick what interests you!)
### User Experience:

Add keyboard shortcut (Ctrl+Shift+T) as alternative to right-click
Show processing indicator while OCR is running
Add "Copy last extracted text" option in popup
Preview extracted text before copying (optional dialog)

### Performance & Accuracy:

Add language detection and multi-language support
Implement text region detection (highlight detected text areas)
Add image quality pre-check (skip tiny/blurry images)
Cache OCR results for identical images

### Features:

Export extracted text to file
History of recently extracted text
Batch processing multiple images
Integration with note-taking apps

### Distribution:

Polish the UI and icons
Write better description/screenshots
Submit to Chrome Web Store
Add Firefox compatibility (fairly easy)