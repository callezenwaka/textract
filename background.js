// Background script for Image Text Extractor
console.log('Image Text Extractor background script loaded');

// Create context menu when extension installs
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "extractText",
    title: "Copy text from image",
    contexts: ["image"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
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
      } else {
        console.error('Text extraction failed:', response.error);
      }
    } catch (error) {
      console.error('Error communicating with content script:', error);
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "processImage") {
    processImageWithOCR(message.imageData)
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

// OCR Processing function (placeholder for now)
async function processImageWithOCR(imageData) {
  // TODO: Implement Tesseract.js OCR here
  // For now, return dummy text to test the pipeline
  console.log('Processing image with OCR...');
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return "This is dummy OCR text - Tesseract.js integration coming next!";
}