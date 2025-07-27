// Canvas stub for browser compatibility
// This provides empty implementations of canvas methods that linkedom expects

export default class Canvas {
  constructor() {
    // Empty constructor
  }
}

export class ImageData {
  constructor() {
    // Empty constructor
  }
}

export class DOMParser {
  constructor() {
    // Empty constructor
  }
}

// Export other canvas-related classes that might be needed
export const createCanvas = () => new Canvas();
export const createImageData = () => new ImageData();
