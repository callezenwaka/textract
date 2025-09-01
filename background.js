// background.js - Merged Background Script for Image Text Extractor
console.log('Image Text Extractor background script loaded');

// Import Tesseract.js
try {
  importScripts('assets/libs/tesseract.min.js');
  console.log('Tesseract.js imported successfully');
} catch (error) {
  console.error('Failed to import Tesseract.js:', error);
}

let isProcessing = false;
let worker = null;

// Initialize Tesseract worker (only when needed)
async function initializeTesseract() {
  if (worker) return worker;
  
  try {
    console.log('Initializing Tesseract worker...');
    
    // Check if Tesseract is available
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract not loaded');
    }
    
    // Create worker with explicit worker path for service worker environment
    worker = await Tesseract.createWorker('eng', 1, {
      logger: m => console.log('Tesseract:', m),
      workerPath: chrome.runtime.getURL('assets/libs/tesseract.min.js'),
      // Use CDN paths for core and language data since service workers can fetch external resources
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int'
    });
    
    await worker.setParameters({
      tesseract_pageseg_mode: '1', // Use string instead of enum
      tesseract_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\\ \n\t',
    });
    
    console.log('Tesseract worker initialized successfully');
    return worker;
  } catch (error) {
    console.error('Failed to initialize Tesseract:', error);
    worker = null;
    throw error;
  }
}

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  try {
    // Create context menu
    await createContextMenu();
    
    // Initialize storage if first install
    if (details.reason === 'install') {
      await initializeStorage();
    }
    
    // Don't initialize Tesseract here - wait until it's actually needed
    console.log('Extension initialization completed');
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
});

// Create context menu with error handling
async function createContextMenu() {
  try {
    // Remove existing menu items
    await chrome.contextMenus.removeAll();
    
    // Create new context menu
    await chrome.contextMenus.create({
      id: "extractText",
      title: "Copy text from image",
      contexts: ["image"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });
    
    console.log('Context menu created successfully');
  } catch (error) {
    console.error('Failed to create context menu:', error);
    throw error;
  }
}

// Initialize storage with default values
async function initializeStorage() {
  try {
    // Set default settings
    const defaultSettings = {
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    };
    
    const existingSettings = await chrome.storage.sync.get(Object.keys(defaultSettings));
    
    // Only set defaults for missing keys
    const settingsToSet = {};
    Object.entries(defaultSettings).forEach(([key, value]) => {
      if (existingSettings[key] === undefined) {
        settingsToSet[key] = value;
      }
    });
    
    if (Object.keys(settingsToSet).length > 0) {
      await chrome.storage.sync.set(settingsToSet);
      console.log('Default settings initialized:', settingsToSet);
    }
    
    // Initialize stats
    const defaultStats = {
      processedCount: 0,
      successCount: 0,
      installDate: Date.now()
    };
    
    const existingStats = await chrome.storage.local.get(Object.keys(defaultStats));
    
    const statsToSet = {};
    Object.entries(defaultStats).forEach(([key, value]) => {
      if (existingStats[key] === undefined) {
        statsToSet[key] = value;
      }
    });
    
    if (Object.keys(statsToSet).length > 0) {
      await chrome.storage.local.set(statsToSet);
      console.log('Default stats initialized:', statsToSet);
    }
    
  } catch (error) {
    console.error('Failed to initialize storage:', error);
    throw error;
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "extractText") {
    return;
  }
  
  console.log('Extract text requested for:', info.srcUrl);
  
  let success = false;
  let errorMessage = '';
  
  try {
    // Validate inputs
    if (!info.srcUrl) {
      throw new Error('No image URL provided');
    }
    
    if (!tab || !tab.id) {
      throw new Error('Invalid tab information');
    }
    
    // Get settings for processing
    const settings = await chrome.storage.sync.get({
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    });
    
    // Get image data from content script
    const imageResponse = await sendMessageWithTimeout(tab.id, {
      action: "getImageData",
      imageUrl: info.srcUrl
    }, 10000);
    
    if (!imageResponse || !imageResponse.success) {
      throw new Error(imageResponse?.error || 'Failed to get image data');
    }
    
    // Process image with OCR in background script
    const text = await processImageWithOCR(imageResponse.imageData, settings);
    
    // Send result back to content script to copy to clipboard
    const clipboardResponse = await sendMessageWithTimeout(tab.id, {
      action: "copyToClipboard",
      text: text
    }, 5000);
    
    if (!clipboardResponse || !clipboardResponse.success) {
      throw new Error('Failed to copy text to clipboard');
    }
    
    success = true;
    console.log('Text extracted successfully:', text.substring(0, 100) + '...');
    
    // Show success notification if enabled
    if (settings.showNotifications) {
      await showNotification(`Text copied! (${text.length} characters)`, 'success');
    }
    
  } catch (error) {
    console.error('Text extraction failed:', error);
    errorMessage = error.message || 'Text extraction failed';
    
    // Show error notification
    const settings = await chrome.storage.sync.get({ showNotifications: true });
    if (settings.showNotifications) {
      await showNotification('Failed to extract text from image', 'error');
    }
  } finally {
    // Update statistics
    await updateStats(success, errorMessage);
  }
});

// Send message with timeout
function sendMessageWithTimeout(tabId, message, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message timeout'));
    }, timeout);
    
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  // Handle ping from content script
  if (message.action === "ping") {
    sendResponse({ ready: true });
    return true;
  }
  
  // Handle OCR processing request (legacy support)
  if (message.action === "processImage") {
    chrome.storage.sync.get({
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    })
    .then(settings => processImageWithOCR(message.imageData, settings))
    .then(text => {
      sendResponse({ success: true, text: text });
    })
    .catch(error => {
      console.error('OCR processing failed:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  // Handle settings request from content script
  if (message.action === "getSettings") {
    chrome.storage.sync.get({
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    })
      .then(settings => sendResponse(settings))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  return false;
});

// Main OCR Processing function with Tesseract.js (from your original working code)
async function processImageWithOCR(imageDataUrl, settings = {}) {
  if (isProcessing) {
    throw new Error('Another image is currently being processed. Please wait.');
  }
  
  isProcessing = true;
  
  try {
    console.log('Starting OCR processing...');
    const startTime = Date.now();
    
    // Initialize worker if needed
    const tesseractWorker = await initializeTesseract();
    
    // Preprocess image if auto-enhance is enabled
    let processedImage = imageDataUrl;
    if (settings.autoEnhance) {
      processedImage = await preprocessImage(imageDataUrl);
    }
    
    // Run OCR
    console.log('Running Tesseract OCR...');
    const { data: { text, confidence } } = await tesseractWorker.recognize(processedImage);
    
    const processingTime = Date.now() - startTime;
    console.log(`OCR completed in ${processingTime}ms with confidence: ${confidence}%`);
    
    // Clean up the extracted text
    const cleanedText = cleanUpText(text);
    
    if (!cleanedText.trim()) {
      throw new Error('No text found in image');
    }
    
    console.log('Extracted text:', cleanedText.substring(0, 200) + '...');
    return cleanedText;
    
  } catch (error) {
    console.error('OCR processing error:', error);
    throw error;
  } finally {
    isProcessing = false;
  }
}

// Preprocess image for better OCR results (from your original working code)
async function preprocessImage(imageDataUrl) {
  return new Promise((resolve, reject) => {
    try {
      // Create OffscreenCanvas for service worker environment
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d');
      
      // Load image
      fetch(imageDataUrl)
        .then(response => response.blob())
        .then(blob => createImageBitmap(blob))
        .then(imageBitmap => {
          // Scale up small images for better OCR
          const scale = Math.min(2, Math.max(1, 800 / Math.max(imageBitmap.width, imageBitmap.height)));
          canvas.width = imageBitmap.width * scale;
          canvas.height = imageBitmap.height * scale;
          
          // Draw image with scaling
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
          
          // Get image data for processing
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Enhance contrast and convert to grayscale
          for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            
            // Enhance contrast (simple threshold)
            const enhanced = gray > 128 ? 255 : 0;
            
            data[i] = enhanced;     // R
            data[i + 1] = enhanced; // G
            data[i + 2] = enhanced; // B
            // Alpha stays the same
          }
          
          // Put processed data back
          ctx.putImageData(imageData, 0, 0);
          
          // Convert to blob and then to data URL
          canvas.convertToBlob({ type: 'image/png' })
            .then(blob => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('Failed to convert processed image'));
              reader.readAsDataURL(blob);
            });
        })
        .catch(error => {
          console.error('Error in image preprocessing:', error);
          // Return original image if preprocessing fails
          resolve(imageDataUrl);
        });
    } catch (error) {
      console.error('Preprocessing error:', error);
      // Return original image if preprocessing fails
      resolve(imageDataUrl);
    }
  });
}

// Clean up extracted text (from your original working code)
function cleanUpText(rawText) {
  if (!rawText) return '';
  
  return rawText
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Fix common OCR mistakes
    .replace(/[|]/g, 'I')  // Common mistake: | instead of I
    .replace(/[0]/g, 'O')  // Sometimes 0 instead of O in words
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
    // Remove weird characters that might be OCR artifacts
    .replace(/[^\w\s.,!?;:'"()\[\]{}\-+=@#$%^&*~`<>/\\]/g, '');
}

// Update statistics with error handling
async function updateStats(success, errorMessage = '') {
  try {
    const stats = await chrome.storage.local.get({
      processedCount: 0,
      successCount: 0,
      lastError: null,
      lastProcessed: null
    });
    
    stats.processedCount++;
    stats.lastProcessed = Date.now();
    
    if (success) {
      stats.successCount++;
      stats.lastError = null; // Clear previous error on success
    } else {
      stats.lastError = errorMessage;
    }
    
    await chrome.storage.local.set(stats);
    console.log('Stats updated:', { 
      processed: stats.processedCount, 
      success: stats.successCount, 
      rate: Math.round((stats.successCount / stats.processedCount) * 100) + '%'
    });
    
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

// Show notification
async function showNotification(message, type = 'basic') {
  try {
    const notificationId = `extractext_${Date.now()}`;
    
    const notificationOptions = {
      type: 'basic',
      iconUrl: 'assets/icons/icon48.png',
      title: 'Image Text Extractor',
      message: message
    };
    
    await chrome.notifications.create(notificationId, notificationOptions);
    
    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      chrome.notifications.clear(notificationId);
    }, 5000);
    
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
});

// Clean up worker when extension is disabled/removed
chrome.runtime.onSuspend.addListener(async () => {
  console.log('Extension suspended, cleaning up...');
  
  if (worker) {
    try {
      await worker.terminate();
      worker = null;
      console.log('Tesseract worker terminated');
    } catch (error) {
      console.error('Error terminating worker:', error);
    }
  }
});

// Error handling for unhandled errors
self.addEventListener('error', (event) => {
  console.error('Unhandled error in background script:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in background script:', event.reason);
});

console.log('Background script initialization completed');