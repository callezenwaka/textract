// Popup script for Image Text Extractor
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  loadStats();
  setupEventListeners();
});

// Load user settings from storage
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get({
      showNotifications: true,
      autoEnhance: true,
      multiLanguage: false
    });
    
    document.getElementById('showNotifications').checked = settings.showNotifications;
    document.getElementById('autoEnhance').checked = settings.autoEnhance;
    document.getElementById('multiLanguage').checked = settings.multiLanguage;
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load usage statistics
async function loadStats() {
  try {
    const stats = await chrome.storage.local.get({
      processedCount: 0,
      successCount: 0
    });
    
    document.getElementById('processedCount').textContent = stats.processedCount;
    
    const successRate = stats.processedCount > 0 
      ? Math.round((stats.successCount / stats.processedCount) * 100)
      : 0;
    document.getElementById('successRate').textContent = successRate + '%';
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// Setup event listeners for settings
function setupEventListeners() {
  const settings = ['showNotifications', 'autoEnhance', 'multiLanguage'];
  
  settings.forEach(setting => {
    const checkbox = document.getElementById(setting);
    if (checkbox) {
      checkbox.addEventListener('change', function() {
        saveSettings();
      });
    }
  });
}

// Save settings to storage
async function saveSettings() {
  try {
    const settings = {
      showNotifications: document.getElementById('showNotifications').checked,
      autoEnhance: document.getElementById('autoEnhance').checked,
      multiLanguage: document.getElementById('multiLanguage').checked
    };
    
    await chrome.storage.sync.set(settings);
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}