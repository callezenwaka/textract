// Content script for Image Text Extractor
console.log('Image Text Extractor content script loaded');

// Import Tesseract.js
const script = document.createElement('script');
script.src = chrome.runtime.getURL('assets/libs/tesseract.min.js');
document.head.appendChild(script);

// Theme detection and management
let currentTheme = 'light';

// State management
let ocrModeActive = false;
let detectedImages = [];
let bannerShown = false;

// Inject text selection styles
const textSelectionLink = document.createElement('link');
textSelectionLink.rel = 'stylesheet';
textSelectionLink.href = chrome.runtime.getURL('popup/text-selection.css');
document.head.appendChild(textSelectionLink);

// State for text selection
let currentOverlay = null;
let selectedWords = new Set();
let isSelecting = false;
let selectionToolbar = null;
let currentImageElement = null;

// Inject banner styles
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('popup/banner.css');
document.head.appendChild(link);

// Initialize on page load - ONLY ONE WAY
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDetection);
} else {
  initializeDetection();
}

initializeTheme();

// Also detect on dynamic content changes
const observer = new MutationObserver((mutations) => {
  let newImagesFound = false;
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        if (node.tagName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
          newImagesFound = true;
        }
      });
    }
  });
  
  if (newImagesFound && !bannerShown) {
    setTimeout(initializeDetection, 1000);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initialize smart detection
function initializeDetection() {
  if (bannerShown) return;
  
  const textImages = detectTextImages();
  
  if (textImages.length >= 2) {
    showOCRBanner(textImages.length);
    detectedImages = textImages;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractText") {
    console.log('Processing extract text request for:', message.imageUrl);
    
    extractTextFromImage(message.imageUrl)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error('Error in extractTextFromImage:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
});

// Initialize theme system
function initializeTheme() {
  // Inject theme system CSS
  const themeLink = document.createElement('link');
  themeLink.rel = 'stylesheet';
  themeLink.href = chrome.runtime.getURL('popup/theme-system.css');
  document.head.appendChild(themeLink);
  
  // Detect initial theme
  updateTheme();
  
  // Listen for theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', updateTheme);
}

// Update theme based on system preference
function updateTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  currentTheme = prefersDark ? 'dark' : 'light';
  
  // Update document class for theme-aware components
  document.documentElement.setAttribute('data-theme', currentTheme);
  
  console.log(`Extractext: Theme updated to ${currentTheme}`);
}

// Main function to extract text from image
async function extractTextFromImage(imageUrl) {
  try {
    const settings = await getUserSettings();
    const imageData = await getImageData(imageUrl);
    
    // Wait for Tesseract to be available
    await waitForTesseract();
    
    // Process image with Tesseract.js
    const ocrResult = await processImageWithTesseract(imageData, settings);
    
    if (!ocrResult.success) {
      throw new Error(ocrResult.error);
    }
    
    await copyToClipboard(ocrResult.text);
    
    if (settings.showNotifications) {
      showNotification(`Text copied! (${ocrResult.text.length} characters)`);
    }
    
    return { success: true, text: ocrResult.text };
    
  } catch (error) {
    console.error('Text extraction failed:', error);
    
    const settings = await getUserSettings().catch(() => ({ showNotifications: true }));
    if (settings.showNotifications) {
      showNotification('Failed to extract text from image', 'error');
    }
    
    return { success: false, error: error.message };
  }
}

// Enhanced text extraction with bounds
async function extractTextWithBounds(imageUrl) {
  try {
    const settings = await getUserSettings();
    const imageData = await getImageData(imageUrl);
    
    const ocrResult = await chrome.runtime.sendMessage({
      action: "processImage",
      imageData: imageData,
      settings: settings
    });
    
    if (!ocrResult.success) {
      throw new Error(ocrResult.error);
    }
    
    // Show text selection overlay instead of immediately copying
    if (ocrResult.words && ocrResult.words.length > 0) {
      createTextSelectionOverlay(currentImageElement, ocrResult);
    } else {
      // Fallback to old behavior if no word bounds available
      await copyToClipboard(ocrResult.text);
      if (settings.showNotifications) {
        showNotification(`Text copied! (${ocrResult.text.length} characters)`);
      }
    }
    
    return { success: true, text: ocrResult.text };
    
  } catch (error) {
    console.error('Text extraction failed:', error);
    
    const settings = await getUserSettings().catch(() => ({ showNotifications: true }));
    if (settings.showNotifications) {
      showNotification('Failed to extract text from image', 'error');
    }
    
    return { success: false, error: error.message };
  }
}

// Wait for Tesseract.js to be loaded
async function waitForTesseract() {
  return new Promise((resolve) => {
    if (typeof Tesseract !== 'undefined') {
      resolve();
      return;
    }
    
    const checkInterval = setInterval(() => {
      if (typeof Tesseract !== 'undefined') {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 10000);
  });
}

// Process image with Tesseract.js
async function processImageWithTesseract(imageData, settings) {
  try {
    console.log('Starting Tesseract OCR processing...');
    
    // Create Tesseract worker
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => console.log('Tesseract:', m)
    });
    
    // Set parameters
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\\ \n\t',
    });
    
    // Run OCR
    const { data } = await worker.recognize(imageData);
    
    // Clean up worker
    await worker.terminate();
    
    if (!data.text.trim()) {
      throw new Error('No text found in image');
    }
    
    // Clean up text
    const cleanText = data.text
      .replace(/\s+/g, ' ')
      .trim();
    
    return { success: true, text: cleanText, confidence: data.confidence };
    
  } catch (error) {
    console.error('Tesseract OCR failed:', error);
    return { success: false, error: error.message };
  }
}

// Get user settings from storage
async function getUserSettings() {
  try {
    return await chrome.storage.sync.get({
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    });
  } catch (error) {
    console.error('Failed to get settings:', error);
    return {
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    };
  }
}

// Smart image detection
function detectTextImages() {
  const images = document.querySelectorAll('img');
  const candidates = [];
  
  Array.from(images).forEach(img => {
    if (isLikelyTextImage(img)) {
      candidates.push({
        element: img,
        confidence: calculateImageConfidence(img)
      });
    }
  });
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Determine if image likely contains text
function isLikelyTextImage(img) {
  if (img.naturalWidth < 100 || img.naturalHeight < 50) return false;
  if (!img.complete || img.naturalWidth === 0) return false;
  
  const src = img.src.toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  const className = (img.className || '').toLowerCase();
  
  const skipPatterns = [
    'avatar', 'logo', 'icon', 'profile', 'thumb', 'banner',
    'ad-', 'ads/', 'tracking', 'pixel', 'badge'
  ];
  
  if (skipPatterns.some(pattern => 
    src.includes(pattern) || alt.includes(pattern) || className.includes(pattern)
  )) {
    return false;
  }
  
  const ratio = img.naturalWidth / img.naturalHeight;
  const isGoodRatio = ratio > 0.5 && ratio < 6;
  
  const textIndicators = [
    'screenshot', 'code', 'snippet', 'terminal', 'console',
    'error', 'output', 'result', 'example', 'demo'
  ];
  
  const hasTextIndicator = textIndicators.some(indicator =>
    src.includes(indicator) || alt.includes(indicator) || className.includes(indicator)
  );
  
  const pageHasCode = document.querySelector('pre, code, .highlight, .code-block, .syntax');
  const isTutorialPage = /tutorial|guide|docs|documentation|stackoverflow|github/i.test(window.location.href);
  
  return isGoodRatio && (hasTextIndicator || pageHasCode || isTutorialPage);
}

// Calculate confidence score for OCR success
function calculateImageConfidence(img) {
  let confidence = 50;
  
  const src = img.src.toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  
  const area = img.naturalWidth * img.naturalHeight;
  if (area > 500000) confidence += 20;
  else if (area > 100000) confidence += 10;
  
  const ratio = img.naturalWidth / img.naturalHeight;
  if (ratio > 1.5 && ratio < 4) confidence += 15;
  
  if (src.includes('code') || alt.includes('code')) confidence += 25;
  if (src.includes('screenshot')) confidence += 20;
  if (src.includes('terminal') || src.includes('console')) confidence += 20;
  
  if (src.includes('.png')) confidence += 10;
  
  return Math.min(100, confidence);
}

// Show OCR detection banner
function showOCRBanner(imageCount) {
  if (bannerShown) return;
  bannerShown = true;
  
  const banner = document.createElement('div');
  banner.className = 'ocr-banner';
  banner.innerHTML = `
    <span class="ocr-banner-icon">📝</span>
    <span class="ocr-banner-message">
      Found ${imageCount} image${imageCount > 1 ? 's' : ''} that might contain text
    </span>
    <button class="ocr-banner-button primary" onclick="window.ocrExtension.activateOCRMode()">
      Highlight images
    </button>
    <button class="ocr-banner-button" onclick="window.ocrExtension.dismissBanner()">
      Not now
    </button>
    <button class="ocr-banner-close" onclick="window.ocrExtension.dismissBanner()">×</button>
  `;
  
  document.body.appendChild(banner);
  
  setTimeout(() => {
    if (document.querySelector('.ocr-banner')) {
      dismissBanner();
    }
  }, 10000);
}

// Dismiss banner
function dismissBanner() {
  const banner = document.querySelector('.ocr-banner');
  if (banner) {
    banner.classList.add('hiding');
    setTimeout(() => banner.remove(), 300);
  }
}

// Activate OCR highlighting mode
function activateOCRMode() {
  dismissBanner();
  ocrModeActive = true;
  document.body.classList.add('ocr-mode-active');
  
  detectedImages.forEach(({ element, confidence }) => {
    element.classList.add('ocr-text-candidate');
    
    if (confidence >= 80) element.classList.add('high-confidence');
    else if (confidence >= 60) element.classList.add('medium-confidence');
    else element.classList.add('low-confidence');
    
    element.addEventListener('click', handleImageClick, { once: false });
  });
  
  const exitButton = document.createElement('button');
  exitButton.className = 'ocr-exit-button';
  exitButton.textContent = '✕ Exit OCR Mode';
  exitButton.onclick = deactivateOCRMode;
  document.body.appendChild(exitButton);
  
  document.addEventListener('keydown', handleEscapeKey);
}

// Deactivate OCR mode
function deactivateOCRMode() {
  ocrModeActive = false;
  document.body.classList.remove('ocr-mode-active');
  
  document.querySelectorAll('.ocr-text-candidate').forEach(img => {
    img.classList.remove('ocr-text-candidate', 'high-confidence', 'medium-confidence', 'low-confidence');
    img.removeEventListener('click', handleImageClick);
  });
  
  const exitButton = document.querySelector('.ocr-exit-button');
  if (exitButton) exitButton.remove();
  
  document.removeEventListener('keydown', handleEscapeKey);
}

// Handle image clicks in OCR mode
function handleImageClick(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const img = event.target;
  currentImageElement = img;
  
  // Show loading state
  showNotification('Analyzing text regions...', 'info');
  
  extractTextWithBounds(img.src);
}

// Handle escape key to exit OCR mode
function handleEscapeKey(event) {
  if (event.key === 'Escape' && ocrModeActive) {
    deactivateOCRMode();
  }
}

// Get image data as base64
async function getImageData(imageUrl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      ctx.drawImage(img, 0, 0);
      
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    
    img.onerror = (error) => {
      console.error('Failed to load image:', error);
      reject(new Error('Failed to load image for processing'));
    };
    
    if (imageUrl.startsWith('data:')) {
      resolve(imageUrl);
    } else {
      img.src = imageUrl;
    }
  });
}

// Copy text to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    console.log('Text copied to clipboard:', text.substring(0, 50) + '...');
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    throw new Error('Failed to copy text to clipboard');
  }
}

// Show notification to user
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.className = `notification ${type}`;
  
  // Base styles that work with CSS variables
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    backdrop-filter: blur(10px);
    z-index: 10000;
    opacity: 0;
    transition: all 0.3s ease;
    max-width: 300px;
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  });
  
  // Auto remove
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, type === 'info' ? 4000 : 3000);
}

// Create text selection overlay on image
function createTextSelectionOverlay(imgElement, ocrResult) {
  // Remove any existing overlay
  removeTextSelectionOverlay();
  
  // Create wrapper container
  const wrapper = document.createElement('div');
  wrapper.className = 'image-text-overlay';
  
  // Replace image with wrapper
  imgElement.parentNode.insertBefore(wrapper, imgElement);
  wrapper.appendChild(imgElement);
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'text-selection-overlay active';
  wrapper.appendChild(overlay);
  currentOverlay = overlay;
  
  // Calculate scaling factors
  const displayRect = imgElement.getBoundingClientRect();
  const naturalWidth = ocrResult.imageSize.width;
  const naturalHeight = ocrResult.imageSize.height;
  
  const scaleX = imgElement.offsetWidth / naturalWidth;
  const scaleY = imgElement.offsetHeight / naturalHeight;
  
  // Create selectable words
  ocrResult.words.forEach((word, index) => {
    const wordElement = document.createElement('span');
    wordElement.className = 'selectable-word';
    wordElement.textContent = word.text;
    wordElement.dataset.wordIndex = index;
    wordElement.dataset.originalText = word.text;
    
    // Position the word element
    const scaledX = word.bbox.x0 * scaleX;
    const scaledY = word.bbox.y0 * scaleY;
    const scaledWidth = (word.bbox.x1 - word.bbox.x0) * scaleX;
    const scaledHeight = (word.bbox.y1 - word.bbox.y0) * scaleY;
    
    wordElement.style.left = scaledX + 'px';
    wordElement.style.top = scaledY + 'px';
    wordElement.style.width = scaledWidth + 'px';
    wordElement.style.height = scaledHeight + 'px';
    wordElement.style.lineHeight = scaledHeight + 'px';
    
    // Add event listeners
    wordElement.addEventListener('mousedown', startTextSelection);
    wordElement.addEventListener('mouseenter', continueTextSelection);
    wordElement.addEventListener('mouseup', endTextSelection);
    
    overlay.appendChild(wordElement);
  });
  
  // Add click outside to close
  document.addEventListener('click', handleClickOutsideSelection);
  document.addEventListener('keydown', handleSelectionKeydown);
  
  // Show initial instruction
  showNotification('Click and drag to select text, or click "Copy All"', 'info');
  
  // Create toolbar
  createSelectionToolbar(ocrResult.text);
}

// Text selection handlers
function startTextSelection(event) {
  event.preventDefault();
  isSelecting = true;
  selectedWords.clear();
  
  // Clear previous selections
  document.querySelectorAll('.selectable-word.selected').forEach(word => {
    word.classList.remove('selected');
  });
  
  // Select clicked word
  const wordElement = event.target;
  wordElement.classList.add('selected', 'just-selected');
  selectedWords.add(parseInt(wordElement.dataset.wordIndex));
  
  updateSelectionToolbar();
  
  // Remove animation class after animation
  setTimeout(() => wordElement.classList.remove('just-selected'), 300);
}

function continueTextSelection(event) {
  if (!isSelecting) return;
  
  const wordElement = event.target;
  if (!wordElement.classList.contains('selectable-word')) return;
  
  // Add to selection if not already selected
  const wordIndex = parseInt(wordElement.dataset.wordIndex);
  if (!selectedWords.has(wordIndex)) {
    wordElement.classList.add('selected', 'just-selected');
    selectedWords.add(wordIndex);
    updateSelectionToolbar();
    
    // Remove animation class
    setTimeout(() => wordElement.classList.remove('just-selected'), 300);
  }
}

function endTextSelection(event) {
  isSelecting = false;
}

// Create selection toolbar
function createSelectionToolbar(fullText) {
  removeSelectionToolbar();
  
  const toolbar = document.createElement('div');
  toolbar.className = 'text-selection-toolbar';
  
  toolbar.innerHTML = `
    <span class="selection-count">0 words selected</span>
    <button class="copy-selection" disabled>Copy Selection</button>
    <button class="copy-all primary">Copy All</button>
    <button class="clear-selection">Clear</button>
    <button class="close-selection">✕</button>
  `;
  
  document.body.appendChild(toolbar);
  selectionToolbar = toolbar;
  
  // Position toolbar near the image
  positionToolbar();
  
  // Show toolbar
  setTimeout(() => toolbar.classList.add('visible'), 100);
  
  // Add event listeners
  toolbar.querySelector('.copy-selection').addEventListener('click', copySelectedText);
  toolbar.querySelector('.copy-all').addEventListener('click', () => copyAllText(fullText));
  toolbar.querySelector('.clear-selection').addEventListener('click', clearSelection);
  toolbar.querySelector('.close-selection').addEventListener('click', removeTextSelectionOverlay);
}

// Update toolbar state
function updateSelectionToolbar() {
  if (!selectionToolbar) return;
  
  const count = selectedWords.size;
  const countSpan = selectionToolbar.querySelector('.selection-count');
  const copyButton = selectionToolbar.querySelector('.copy-selection');
  
  countSpan.textContent = `${count} word${count !== 1 ? 's' : ''} selected`;
  copyButton.disabled = count === 0;
  
  if (count > 0) {
    copyButton.classList.add('primary');
  } else {
    copyButton.classList.remove('primary');
  }
}

// Position toolbar near the image
function positionToolbar() {
  if (!selectionToolbar || !currentImageElement) return;
  
  const imgRect = currentImageElement.getBoundingClientRect();
  const toolbarRect = selectionToolbar.getBoundingClientRect();
  
  let top = imgRect.bottom + 10;
  let left = imgRect.left + (imgRect.width - toolbarRect.width) / 2;
  
  // Keep toolbar on screen
  if (left < 10) left = 10;
  if (left + toolbarRect.width > window.innerWidth - 10) {
    left = window.innerWidth - toolbarRect.width - 10;
  }
  
  if (top + toolbarRect.height > window.innerHeight - 10) {
    top = imgRect.top - toolbarRect.height - 10;
  }
  
  selectionToolbar.style.left = left + 'px';
  selectionToolbar.style.top = top + 'px';
}

// Copy selected text
async function copySelectedText() {
  if (selectedWords.size === 0) return;
  
  const selectedWordsArray = Array.from(selectedWords).sort((a, b) => a - b);
  const wordElements = document.querySelectorAll('.selectable-word');
  
  const selectedText = selectedWordsArray
    .map(index => wordElements[index]?.dataset.originalText || '')
    .filter(text => text.trim())
    .join(' ');
  
  if (selectedText.trim()) {
    await copyToClipboard(selectedText);
    showNotification(`Selected text copied! (${selectedText.length} characters)`);
    removeTextSelectionOverlay();
  }
}

// Copy all text
async function copyAllText(fullText) {
  await copyToClipboard(fullText);
  showNotification(`All text copied! (${fullText.length} characters)`);
  removeTextSelectionOverlay();
}

// Clear selection
function clearSelection() {
  selectedWords.clear();
  document.querySelectorAll('.selectable-word.selected').forEach(word => {
    word.classList.remove('selected');
  });
  updateSelectionToolbar();
}

// Handle click outside selection
function handleClickOutsideSelection(event) {
  if (!currentOverlay) return;
  
  // Don't close if clicking on overlay or toolbar
  if (currentOverlay.contains(event.target) || 
      (selectionToolbar && selectionToolbar.contains(event.target))) {
    return;
  }
  
  removeTextSelectionOverlay();
}

// Handle keyboard shortcuts
function handleSelectionKeydown(event) {
  if (!currentOverlay) return;
  
  if (event.key === 'Escape') {
    removeTextSelectionOverlay();
  } else if (event.key === 'Enter' || (event.metaKey && event.key === 'c')) {
    if (selectedWords.size > 0) {
      copySelectedText();
    }
  } else if (event.metaKey && event.key === 'a') {
    event.preventDefault();
    selectAllWords();
  }
}

// Select all words
function selectAllWords() {
  selectedWords.clear();
  document.querySelectorAll('.selectable-word').forEach((word, index) => {
    word.classList.add('selected');
    selectedWords.add(index);
  });
  updateSelectionToolbar();
}

// Remove text selection overlay
function removeTextSelectionOverlay() {
  // Remove overlay
  if (currentOverlay) {
    const wrapper = currentOverlay.parentElement;
    if (wrapper && wrapper.classList.contains('image-text-overlay')) {
      const img = wrapper.querySelector('img');
      if (img) {
        wrapper.parentNode.insertBefore(img, wrapper);
      }
      wrapper.remove();
    }
    currentOverlay = null;
  }
  
  // Remove toolbar
  removeSelectionToolbar();
  
  // Clear state
  selectedWords.clear();
  isSelecting = false;
  currentImageElement = null;
  
  // Remove event listeners
  document.removeEventListener('click', handleClickOutsideSelection);
  document.removeEventListener('keydown', handleSelectionKeydown);
}

// Remove selection toolbar
function removeSelectionToolbar() {
  if (selectionToolbar) {
    selectionToolbar.remove();
    selectionToolbar = null;
  }
}

// Theme-aware banner creation
function createThemedBanner(imageCount) {
  const banner = document.createElement('div');
  banner.className = 'ocr-banner';
  
  // Add theme-specific classes
  if (currentTheme === 'dark') {
    banner.classList.add('dark-theme');
  }
  
  banner.innerHTML = `
    <span class="ocr-banner-icon">📝</span>
    <span class="ocr-banner-message">
      Found ${imageCount} image${imageCount > 1 ? 's' : ''} that might contain text
    </span>
    <button class="ocr-banner-button primary" onclick="window.extractextExtension.activateOCRMode()">
      Highlight images
    </button>
    <button class="ocr-banner-button" onclick="window.extractextExtension.dismissBanner()">
      Not now
    </button>
    <button class="ocr-banner-close" onclick="window.extractextExtension.dismissBanner()">×</button>
  `;
  
  return banner;
}

// Expose functions globally for banner buttons
window.ocrExtension = {
  activateOCRMode,
  dismissBanner
};