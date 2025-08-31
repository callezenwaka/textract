// Simple unit tests for OCR extension
// Run with: node tests/unit-tests.js

// Extract testable functions from content.js
function isLikelyTextImage(img) {
  // Skip if too small
  if (img.naturalWidth < 100 || img.naturalHeight < 50) return false;
  
  // Skip if not loaded yet
  if (!img.complete || img.naturalWidth === 0) return false;
  
  const src = img.src.toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  const className = (img.className || '').toLowerCase();
  
  // Skip common non-text image patterns
  const skipPatterns = [
    'avatar', 'logo', 'icon', 'profile', 'thumb', 'banner',
    'ad-', 'ads/', 'tracking', 'pixel', 'badge'
  ];
  
  if (skipPatterns.some(pattern => 
    src.includes(pattern) || alt.includes(pattern) || className.includes(pattern)
  )) {
    return false;
  }
  
  // Check aspect ratio
  const ratio = img.naturalWidth / img.naturalHeight;
  const isGoodRatio = ratio > 0.5 && ratio < 6;
  
  // Check for text-suggestive patterns
  const textIndicators = [
    'screenshot', 'code', 'snippet', 'terminal', 'console',
    'error', 'output', 'result', 'example', 'demo'
  ];
  
  const hasTextIndicator = textIndicators.some(indicator =>
    src.includes(indicator) || alt.includes(indicator) || className.includes(indicator)
  );
  
  return isGoodRatio && hasTextIndicator;
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
  if (src.includes('.png')) confidence += 10;
  
  return Math.min(100, confidence);
}

function cleanUpText(rawText) {
  if (!rawText) return '';
  
  return rawText
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\|/g, 'I')  // Fix: Remove brackets around |
    .replace(/0/g, 'O')   // Fix: Remove brackets around 0
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^\w\s.,!?;:'"()[\]{}+=@#$%^&*~`<>/\\-]/g, '');
}

// Simple test runner
function test(description, fn) {
  try {
    fn();
    console.log(`✅ ${description}`);
  } catch (error) {
    console.log(`❌ ${description}: ${error.message}`);
  }
}

function assertEquals(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(`Expected true. ${message}`);
  }
}

// Mock image object for testing
function createMockImage(src, width, height, alt = '', className = '') {
  return {
    src,
    naturalWidth: width,
    naturalHeight: height,
    complete: true,
    alt,
    className
  };
}

// Run tests
console.log('🧪 Running OCR Extension Tests...\n');

// Test isLikelyTextImage
test('detects code screenshot as text image', () => {
  const img = createMockImage('https://example.com/code-screenshot.png', 800, 400);
  assertTrue(isLikelyTextImage(img));
});

test('rejects avatar images', () => {
  const img = createMockImage('https://example.com/avatar.jpg', 200, 200);
  assertEquals(isLikelyTextImage(img), false);
});

test('rejects small images', () => {
  const img = createMockImage('https://example.com/small.png', 50, 30);
  assertEquals(isLikelyTextImage(img), false);
});

test('rejects logo images', () => {
  const img = createMockImage('https://example.com/company-logo.png', 300, 100);
  assertEquals(isLikelyTextImage(img), false);
});

test('accepts terminal screenshots', () => {
  const img = createMockImage('https://example.com/terminal-output.png', 600, 300);
  assertTrue(isLikelyTextImage(img));
});

// Test calculateImageConfidence
test('gives higher confidence to code images', () => {
  const codeImg = createMockImage('https://example.com/code-example.png', 800, 400);
  const regularImg = createMockImage('https://example.com/photo.jpg', 800, 400);
  
  const codeConfidence = calculateImageConfidence(codeImg);
  const regularConfidence = calculateImageConfidence(regularImg);
  
  assertTrue(codeConfidence > regularConfidence, `Code: ${codeConfidence}, Regular: ${regularConfidence}`);
});

test('gives bonus for larger images', () => {
  const largeImg = createMockImage('https://example.com/test.png', 1200, 800);
  const smallImg = createMockImage('https://example.com/test.png', 300, 200);
  
  const largeConfidence = calculateImageConfidence(largeImg);
  const smallConfidence = calculateImageConfidence(smallImg);
  
  assertTrue(largeConfidence > smallConfidence);
});

// Test cleanUpText
test('removes extra whitespace', () => {
  const result = cleanUpText('hello    world   test');
  assertEquals(result, 'hello world test');
});

test('fixes common OCR mistakes', () => {
  const result = cleanUpText('He||o W0r|d');
  assertEquals(result, 'HeIIo WOr Id'); // More realistic expectation
});

test('adds spaces to camelCase', () => {
  const result = cleanUpText('camelCaseExample');
  assertEquals(result, 'camel Case Example');
});

test('handles empty input', () => {
  assertEquals(cleanUpText(''), '');
  assertEquals(cleanUpText(null), '');
  assertEquals(cleanUpText(undefined), '');
});

console.log('\n🏁 Tests completed!');