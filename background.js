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
  // Pass through messages to content script for OCR processing
  return false; // Let content script handle the response
});







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

// Clean up when extension is disabled/removed
chrome.runtime.onSuspend.addListener(async () => {
  console.log('Extension suspended, cleaning up...');
});