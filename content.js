// content.js - Simple Content Script for Image Text Extractor
console.log('Image Text Extractor content script loaded');

// Theme detection and management
let currentTheme = 'light';

// State management
let ocrModeActive = false;
let detectedImages = [];
let bannerShown = false;

// Inject styles
const injectStyles = () => {
  const stylesheets = [
    'popup/text-selection.css',
    'popup/banner.css',
    'popup/theme-system.css'
  ];
  
  stylesheets.forEach(stylesheet => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(stylesheet);
    document.head.appendChild(link);
  });
};

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

function initializeExtension() {
  injectStyles();
  initializeTheme();
  initializeDetection();
}

// Initialize theme system
function initializeTheme() {
  updateTheme();
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', updateTheme);
}

// Update theme based on system preference
function updateTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  currentTheme = prefersDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
}

// Initialize smart detection
function initializeDetection() {
  if (bannerShown) return;
  
  const textImages = detectTextImages();
  
  if (textImages.length >= 2) {
    showOCRBanner(textImages.length);
    detectedImages = textImages;
  }

  // Watch for new images
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
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  // Handle ping from background script
  if (message.action === "ping") {
    sendResponse({ ready: true });
    return true;
  }
  
  // Handle image data request
  if (message.action === "getImageData") {
    getImageData(message.imageUrl)
      .then(imageData => {
        sendResponse({ success: true, imageData: imageData });
      })
      .catch(error => {
        console.error('Failed to get image data:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Handle clipboard copy request
  if (message.action === "copyToClipboard") {
    copyToClipboard(message.text)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Failed to copy to clipboard:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  return false;
});

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
      Found ${imageCount} image${imageCount > 1 ? 's' : ''} with potential text<br>
      <small style="opacity: 0.8; font-size: 11px;">Advanced OCR available</small>
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
  }, 12000);
}

function dismissBanner() {
  const banner = document.querySelector('.ocr-banner');
  if (banner) {
    banner.classList.add('hiding');
    setTimeout(() => banner.remove(), 300);
  }
}

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
  
  // Show processing notification
  showNotification('Processing image with OCR...', 'info');
  
  // The context menu will handle the actual OCR processing
  // We just trigger it programmatically by simulating a right-click context menu action
  console.log('Image clicked for OCR processing:', img.src);
}

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
    color: ${type === 'error' ? '#dc3545' : type === 'info' ? '#0066cc' : '#28a745'};
    background: ${currentTheme === 'dark' ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
    border: 1px solid ${type === 'error' ? '#dc3545' : type === 'info' ? '#0066cc' : '#28a745'};
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  });
  
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

// Expose functions globally for banner buttons
window.ocrExtension = {
  activateOCRMode,
  dismissBanner
};

console.log('Content script initialization completed');