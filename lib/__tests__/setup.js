// Global test setup to mock problematic modules
const path = require('path');

// Mock the problematic modules
jest.mock('~/config/environment', () => ({
  environmentConfig: {
    VITE_APP_MODE: 'test',
    VITE_DEBUG: 'false',
  },
}));

jest.mock('~/utils/storage', () => ({
  saveResource: jest.fn().mockResolvedValue('saves/test-slug/test-file.jpg'),
}));

jest.mock('~/utils/tools', () => ({
  fetchAndResizeImage: jest.fn().mockResolvedValue({
    blob: new Blob(['mock image data'], { type: 'image/jpeg' }),
    width: 100,
    height: 100,
  }),
  fetchWithTimeout: jest.fn().mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue('<html><body>Mock HTML</body></html>'),
    headers: {
      get: jest.fn((name) => name === 'content-type' ? 'text/html' : null),
    },
  }),
  imageToDataUrl: jest.fn().mockResolvedValue('data:image/jpeg;base64,mock-data-url'),
}));

// Mock the mime package
jest.mock('mime', () => ({
  getType: jest.fn((extension) => {
    if (!extension) return null;
    
    const mimeTypes = {
      'html': 'text/html',
      'htm': 'text/html',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json',
    };
    
    return mimeTypes[extension.toLowerCase()] || null;
  }),
  
  getExtension: jest.fn((mimeType) => {
    if (!mimeType) return null;
    
    const extensions = {
      'text/html': 'html',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'text/markdown': 'md',
      'application/json': 'json',
    };
    
    return extensions[mimeType] || null;
  })
}));

// Mock the @mozilla/readability package with a flexible mock
jest.mock('@mozilla/readability', () => {
  let mockReadability = {
    title: "Test Article Title",
    content: "<p>This is test content with some words to test reading time calculation.</p>",
    length: 100,
    byline: "Test Author",
    publishedTime: "2023-01-15T10:00:00Z",
  };

  return {
    Readability: jest.fn().mockImplementation(() => ({
      parse: jest.fn().mockReturnValue(mockReadability),
    })),
    __setMockReadability: (newMock) => {
      mockReadability = newMock;
    },
  };
});
