// Mock for the storage module to avoid environment import issues
const storage = {
  saveResource: async (localPath, slug, dataUrl, mimeType) => {
    // Return a mock file path
    return `saves/${slug}/${localPath}`;
  }
};

module.exports = storage;
