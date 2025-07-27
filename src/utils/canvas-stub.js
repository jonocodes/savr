// Canvas stub for browser compatibility
// This provides empty implementations of canvas methods that linkedom expects

class Canvas {
  constructor() {
    // Empty constructor
  }
}

class ImageData {
  constructor() {
    // Empty constructor
  }
}

class DOMParser {
  constructor() {
    // Empty constructor
  }
}

// Export for ES modules
export default Canvas;
export { ImageData, DOMParser };

// Also export for CommonJS compatibility
if (typeof module !== "undefined" && module.exports) {
  module.exports = Canvas;
  module.exports.ImageData = ImageData;
  module.exports.DOMParser = DOMParser;
}

// Export other canvas-related classes that might be needed
export const createCanvas = () => new Canvas();
export const createImageData = () => new ImageData();
