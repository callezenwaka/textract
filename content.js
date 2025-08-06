// Content script for Image Text Extractor
console.log('Image Text Extractor content script loaded');

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
    // Step 1: Get image data
    const imageData = await getImageData(imageUrl);
    
    // Step 2: Send to background script for OCR processing
    const ocrResult = await chrome.runtime.sendMessage({
      action: "processImage",
      imageData: imageData
    });
    
    if (!ocrResult.success) {
      throw new Error(ocrResult.error);
    }
    
    // Step 3: Copy to clipboard
    await copyToClipboard(ocrResult.text);
    
    // Step 4: Show user feedback
    showNotification(`Text copied! (${ocrResult.text.length} characters)`);
    
    return { success: true, text: ocrResult.text };
    
  } catch (error) {
    console.error('Text extraction failed:', error);
    showNotification('Failed to extract text from image', 'error');
    return { success: false, error: error.message };
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