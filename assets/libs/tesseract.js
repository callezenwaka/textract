// Background script for Image Text Extractor with Tesseract.js
console.log('Image Text Extractor background script loaded');

// Import Tesseract.js
importScripts('libs/tesseract.min.js');

let isProcessing = false;
let worker = null;

// Initialize Tesseract worker
async function initializeTesseract() {
  if (worker) return worker;
  
  try {
    console.log('Initializing Tesseract worker...');
    worker = await Tesseract.createWorker('eng', 1, {
      logger: m => console.log('Tesseract:', m)
    });
    
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\\ \n\t',
    });
    
    console.log('Tesseract worker initialized successfully');
    return worker;
  } catch (error) {
    console.error('Failed to initialize Tesseract:', error);
    throw error;
  }
}

// Create context menu when extension installs
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "extractText",
    title: "Copy text from image",
    contexts: ["image"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  });
  
  // Initialize Tesseract in the background
  initializeTesseract().catch(error => {
    console.error('Failed to initialize Tesseract on install:', error);
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "extractText") {
    console.log('Extract text requested for:', info.srcUrl);
    
    try {
      // Send message to content script to handle the image
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "extractText",
        imageUrl: info.srcUrl,
        frameUrl: info.frameUrl || info.pageUrl
      });
      
      if (response.success) {
        console.log('Text extracted successfully:', response.text.substring(0, 100) + '...');
        
        // Update statistics
        await updateStats(true);
      } else {
        console.error('Text extraction failed:', response.error);
        await updateStats(false);
      }
    } catch (error) {
      console.error('Error communicating with content script:', error);
      await updateStats(false);
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "processImage") {
    processImageWithOCR(message.imageData, message.settings)
      .then(text => {
        sendResponse({ success: true, text: text });
      })
      .catch(error => {
        console.error('OCR processing failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Main OCR Processing function with Tesseract.js
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

// Preprocess image for better OCR results
async function preprocessImage(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      // Scale up small images for better OCR
      const scale = Math.min(2, Math.max(1, 800 / Math.max(img.width, img.height)));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      // Draw image with scaling
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
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
      
      // Return processed image as data URL
      resolve(canvas.toDataURL('image/png'));
    };
    
    img.src = imageDataUrl;
  });
}

// Clean up extracted text
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
    .replace(/[^\w\s.,!?;:'"()[\]{}-+=@#$%^&*~`<>/\\]/g, '');
}

// Update statistics
async function updateStats(success) {
  try {
    const stats = await chrome.storage.local.get({
      processedCount: 0,
      successCount: 0
    });
    
    stats.processedCount++;
    if (success) {
      stats.successCount++;
    }
    
    await chrome.storage.local.set(stats);
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

// Clean up worker when extension is disabled/removed
chrome.runtime.onSuspend.addListener(async () => {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
});