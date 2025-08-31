// Content script for Image Text Extractor
// console.log('Image Text Extractor content script loaded');

// State management
let ocrModeActive = false;
let detectedImages = [];
let bannerShown = false;

// Inject banner styles
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('src/popup/banner.css');
document.head.appendChild(link);

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDetection);
} else {
  initializeDetection();
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
  // Skip if too small
  if (img.naturalWidth < 100 || img.naturalHeight < 50) return false;
  
  // Skip if not loaded yet
  if (!img.complete || img.naturalWidth === 0) return false;
  
  // Skip common non-text image patterns
  const src = img.src.toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  const className = (img.className || '').toLowerCase();
  
  // Skip avatars, logos, icons
  const skipPatterns = [
    'avatar', 'logo', 'icon', 'profile', 'thumb', 'banner',
    'ad-', 'ads/', 'tracking', 'pixel', 'badge'
  ];
  
  if (skipPatterns.some(pattern => 
    src.includes(pattern) || alt.includes(pattern) || className.includes(pattern)
  )) {
    return false;
  }
  
  // Check aspect ratio (text images are often wide rectangles)
  const ratio = img.naturalWidth / img.naturalHeight;
  
  // Favor screenshot-like dimensions
  const isGoodRatio = ratio > 0.5 && ratio < 6;
  
  // Check for text-suggestive patterns
  const textIndicators = [
    'screenshot', 'code', 'snippet', 'terminal', 'console',
    'error', 'output', 'result', 'example', 'demo'
  ];
  
  const hasTextIndicator = textIndicators.some(indicator =>
    src.includes(indicator) || alt.includes(indicator) || className.includes(indicator)
  );
  
  // Check page context
  const pageHasCode = document.querySelector('pre, code, .highlight, .code-block, .syntax');
  const isTutorialPage = /tutorial|guide|docs|documentation|stackoverflow|github/i.test(window.location.href);
  
  return isGoodRatio && (hasTextIndicator || pageHasCode || isTutorialPage);
}

// Calculate confidence score for OCR success
function calculateImageConfidence(img) {
  let confidence = 50; // Base confidence
  
  const src = img.src.toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  
  // Size bonus (larger images typically have more readable text)
  const area = img.naturalWidth * img.naturalHeight;
  if (area > 500000) confidence += 20; // Large images
  else if (area > 100000) confidence += 10; // Medium images
  
  // Aspect ratio bonus
  const ratio = img.naturalWidth / img.naturalHeight;
  if (ratio > 1.5 && ratio < 4) confidence += 15; // Wide rectangles
  
  // Text indicators bonus
  if (src.includes('code') || alt.includes('code')) confidence += 25;
  if (src.includes('screenshot')) confidence += 20;
  if (src.includes('terminal') || src.includes('console')) confidence += 20;
  
  // File extension bonus
  if (src.includes('.png')) confidence += 10; // PNG often used for screenshots
  
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
  
  // Auto-dismiss after 10 seconds
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
  
  // Highlight detected images
  detectedImages.forEach(({ element, confidence }) => {
    element.classList.add('ocr-text-candidate');
    
    // Add confidence class
    if (confidence >= 80) element.classList.add('high-confidence');
    else if (confidence >= 60) element.classList.add('medium-confidence');
    else element.classList.add('low-confidence');
    
    // Add click handler for direct OCR
    element.addEventListener('click', handleImageClick, { once: false });
  });
  
  // Add exit button
  const exitButton = document.createElement('button');
  exitButton.className = 'ocr-exit-button';
  exitButton.textContent = '✕ Exit OCR Mode';
  exitButton.onclick = deactivateOCRMode;
  document.body.appendChild(exitButton);
  
  // Add escape key handler
  document.addEventListener('keydown', handleEscapeKey);
}

// Deactivate OCR mode
function deactivateOCRMode() {
  ocrModeActive = false;
  document.body.classList.remove('ocr-mode-active');
  
  // Remove highlighting
  document.querySelectorAll('.ocr-text-candidate').forEach(img => {
    img.classList.remove('ocr-text-candidate', 'high-confidence', 'medium-confidence', 'low-confidence');
    img.removeEventListener('click', handleImageClick);
  });
  
  // Remove exit button
  const exitButton = document.querySelector('.ocr-exit-button');
  if (exitButton) exitButton.remove();
  
  // Remove escape handler
  document.removeEventListener('keydown', handleEscapeKey);
}

// Handle image clicks in OCR mode
function handleImageClick(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const img = event.target;
  extractTextFromImage(img.src);
}

// Handle escape key to exit OCR mode
function handleEscapeKey(event) {
  if (event.key === 'Escape' && ocrModeActive) {
    deactivateOCRMode();
  }
}

// Expose functions globally for banner buttons
window.ocrExtension = {
  activateOCRMode,
  dismissBanner
};

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
    setTimeout(initializeDetection, 1000); // Delay to let images load
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Only log when images detected
function initializeDetection() {
  if (bannerShown) return;
  
  const textImages = detectTextImages();
  
  if (textImages.length >= 2) {
    console.log(`Image Text Extractor: Found ${textImages.length} candidate images`);
    showOCRBanner(textImages.length);
    detectedImages = textImages;
  }
}

// Initialize smart detection
// function initializeDetection() {
//   if (bannerShown) return;
  
//   const textImages = detectTextImages();
  
//   if (textImages.length >= 2) { // Show banner if 2+ candidate images found
//     showOCRBanner(textImages.length);
//     detectedImages = textImages;
//   }
// }

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
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Main function to extract text from image
async function extractTextFromImage(imageUrl) {
  try {
    // Step 1: Get user settings
    const settings = await getUserSettings();
    
    // Step 2: Get image data
    const imageData = await getImageData(imageUrl);
    
    // Step 3: Send to background script for OCR processing
    const ocrResult = await chrome.runtime.sendMessage({
      action: "processImage",
      imageData: imageData,
      settings: settings
    });
    
    if (!ocrResult.success) {
      throw new Error(ocrResult.error);
    }
    
    // Step 4: Copy to clipboard
    await copyToClipboard(ocrResult.text);
    
    // Step 5: Show user feedback (if enabled)
    if (settings.showNotifications) {
      showNotification(`Text copied! (${ocrResult.text.length} characters)`);
    }
    
    return { success: true, text: ocrResult.text };
    
  } catch (error) {
    console.error('Text extraction failed:', error);
    
    // Get settings to check if notifications are enabled
    const settings = await getUserSettings().catch(() => ({ showNotifications: true }));
    if (settings.showNotifications) {
      showNotification('Failed to extract text from image', 'error');
    }
    
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

// Get image data as base64
async function getImageData(imageUrl) {
  return new Promise((resolve, reject) => {
    // Create a canvas to extract image data
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.crossOrigin = 'anonymous'; // Handle CORS
    
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0);
      
      // Get image data as base64
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    
    img.onerror = (error) => {
      console.error('Failed to load image:', error);
      reject(new Error('Failed to load image for processing'));
    };
    
    // Handle different image URL scenarios
    if (imageUrl.startsWith('data:')) {
      // Already a data URL
      resolve(imageUrl);
    } else {
      // Load external image
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
  // Create notification element
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff4444' : '#4CAF50'};
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  // Fade in
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 100);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}