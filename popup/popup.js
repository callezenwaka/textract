// popup/popup.js - Fixed Popup Script for Image Text Extractor
document.addEventListener('DOMContentLoaded', async function() {
  try {
    await initializePopup();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showError('Failed to load extension settings');
  }
});

async function initializePopup() {
  // Show loading state
  showLoadingState();
  
  try {
    // Load settings and stats in parallel
    await Promise.all([
      loadSettings(),
      loadStats()
    ]);
    
    // Setup event listeners after successful load
    setupEventListeners();
    
    // Hide loading state
    hideLoadingState();
    
  } catch (error) {
    hideLoadingState();
    throw error;
  }
}

// Load user settings from storage with error handling
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get({
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    });
    
    // Validate elements exist before setting values
    const elements = {
      showNotifications: document.getElementById('showNotifications'),
      autoEnhance: document.getElementById('autoEnhance'),
      multiLanguage: document.getElementById('multiLanguage')
    };
    
    // Check if all elements exist
    Object.entries(elements).forEach(([key, element]) => {
      if (!element) {
        console.warn(`Element with ID '${key}' not found`);
        return;
      }
      element.checked = settings[key];
    });
    
    console.log('Settings loaded successfully:', settings);
    
  } catch (error) {
    console.error('Failed to load settings:', error);
    // Set default values if loading fails
    setDefaultSettings();
    throw new Error('Settings loading failed');
  }
}

// Load usage statistics with error handling
async function loadStats() {
  try {
    const stats = await chrome.storage.local.get({
      processedCount: 0,
      successCount: 0
    });
    
    const processedElement = document.getElementById('processedCount');
    const successRateElement = document.getElementById('successRate');
    
    if (processedElement) {
      processedElement.textContent = stats.processedCount;
    }
    
    if (successRateElement) {
      const successRate = stats.processedCount > 0 
        ? Math.round((stats.successCount / stats.processedCount) * 100)
        : 0;
      successRateElement.textContent = successRate + '%';
    }
    
    console.log('Stats loaded successfully:', stats);
    
  } catch (error) {
    console.error('Failed to load stats:', error);
    // Show default values if loading fails
    const processedElement = document.getElementById('processedCount');
    const successRateElement = document.getElementById('successRate');
    
    if (processedElement) processedElement.textContent = '0';
    if (successRateElement) successRateElement.textContent = '0%';
    
    throw new Error('Stats loading failed');
  }
}

// Setup event listeners for settings with proper error handling
function setupEventListeners() {
  const settings = ['showNotifications', 'autoEnhance', 'multiLanguage'];
  
  settings.forEach(setting => {
    const checkbox = document.getElementById(setting);
    if (checkbox) {
      checkbox.addEventListener('change', handleSettingChange);
      checkbox.addEventListener('error', handleSettingError);
    } else {
      console.warn(`Checkbox element '${setting}' not found`);
    }
  });
}

// Handle setting changes with debouncing and error handling
let saveTimeout;
async function handleSettingChange(event) {
  const checkbox = event.target;
  
  // Add visual feedback
  checkbox.disabled = true;
  
  // Clear previous save timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  // Debounce saves to avoid excessive storage writes
  saveTimeout = setTimeout(async () => {
    try {
      await saveSettings();
      checkbox.disabled = false;
      showSaveSuccess();
    } catch (error) {
      console.error('Failed to save settings:', error);
      checkbox.disabled = false;
      showSaveError();
    }
  }, 500);
}

// Handle setting errors
function handleSettingError(event) {
  console.error('Setting error:', event);
  showError('Setting update failed');
}

// Save settings to storage with validation
async function saveSettings() {
  try {
    const elements = {
      showNotifications: document.getElementById('showNotifications'),
      autoEnhance: document.getElementById('autoEnhance'),
      multiLanguage: document.getElementById('multiLanguage')
    };
    
    // Validate all elements exist
    const missingElements = Object.entries(elements)
      .filter(([key, element]) => !element)
      .map(([key]) => key);
    
    if (missingElements.length > 0) {
      throw new Error(`Missing elements: ${missingElements.join(', ')}`);
    }
    
    const settings = {
      showNotifications: elements.showNotifications.checked,
      autoEnhance: elements.autoEnhance.checked,
      multiLanguage: elements.multiLanguage.checked
    };
    
    await chrome.storage.sync.set(settings);
    console.log('Settings saved successfully:', settings);
    
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

// Set default settings when loading fails
function setDefaultSettings() {
  const defaultSettings = {
    showNotifications: true,
    autoEnhance: true,
    multiLanguage: false
  };
  
  Object.entries(defaultSettings).forEach(([key, value]) => {
    const element = document.getElementById(key);
    if (element) {
      element.checked = value;
    }
  });
}

// Show loading state
function showLoadingState() {
  const elements = ['showNotifications', 'autoEnhance', 'multiLanguage'];
  elements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = true;
    }
  });
  
  // Show loading indicator if it exists
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = 'block';
  }
}

// Hide loading state
function hideLoadingState() {
  const elements = ['showNotifications', 'autoEnhance', 'multiLanguage'];
  elements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = false;
    }
  });
  
  // Hide loading indicator if it exists
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
}

// Visual feedback functions
function showSaveSuccess() {
  showMessage('Settings saved', 'success');
}

function showSaveError() {
  showMessage('Failed to save settings', 'error');
}

function showError(message) {
  showMessage(message, 'error');
}

function showMessage(message, type = 'info') {
  // Create or update message element
  let messageElement = document.getElementById('message');
  
  if (!messageElement) {
    messageElement = document.createElement('div');
    messageElement.id = 'message';
    messageElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 1000;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(-10px);
    `;
    document.body.appendChild(messageElement);
  }
  
  // Set message and style based on type
  messageElement.textContent = message;
  messageElement.className = `message ${type}`;
  
  // Style based on type
  const styles = {
    success: { backgroundColor: '#4CAF50', color: 'white' },
    error: { backgroundColor: '#f44336', color: 'white' },
    info: { backgroundColor: '#2196F3', color: 'white' }
  };
  
  Object.assign(messageElement.style, styles[type] || styles.info);
  
  // Show message
  requestAnimationFrame(() => {
    messageElement.style.opacity = '1';
    messageElement.style.transform = 'translateY(0)';
  });
  
  // Hide message after delay
  setTimeout(() => {
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageElement.parentNode.removeChild(messageElement);
      }
    }, 300);
  }, 2000);
}

// Handle unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled error in popup:', event.error);
  showError('An unexpected error occurred');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in popup:', event.reason);
  showError('An unexpected error occurred');
});

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadSettings,
    saveSettings,
    loadStats,
    showMessage
  };
}