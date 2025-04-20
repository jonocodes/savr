// This file serves as a bridge between the browser extension and the SAVR app
// It provides functions to communicate with the extension from the app

/**
 * Initialize the extension connector
 * @returns {Object} The extension connector object
 */
function initExtension() {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.error('Extension connector can only be used in a browser environment');
    return null;
  }

  // Check if the extension is installed by sending a ping message
  function checkExtensionPresence() {
    return new Promise((resolve) => {
      // Create a unique message ID
      const messageId = `ping-${Date.now()}`;
      
      // Set up a listener for the response
      const listener = function(event) {
        const data = event.data;
        if (data && data.source === 'SAVR_EXTENSION' && data.messageId === messageId) {
          window.removeEventListener('message', listener);
          resolve(true);
        }
      };
      
      window.addEventListener('message', listener);
      
      // Send the ping message
      window.postMessage({
        source: 'SAVR_PWA',
        messageId,
        action: 'ping'
      }, '*');
      
      // Set a timeout to resolve with false if no response is received
      setTimeout(() => {
        window.removeEventListener('message', listener);
        resolve(false);
      }, 1000);
    });
  }

  /**
   * Save a page using the extension
   * @param {string} url - The URL of the page to save
   * @returns {Promise<Object>} - A promise that resolves with the result
   */
  function savePage(url) {
    return new Promise((resolve, reject) => {
      const messageId = `save-${Date.now()}`;
      
      // Set up a listener for the response
      const listener = function(event) {
        const data = event.data;
        if (data && data.source === 'SAVR_EXTENSION' && data.messageId === messageId) {
          window.removeEventListener('message', listener);
          
          if (data.success) {
            resolve(data.data);
          } else {
            reject(new Error(data.error || 'Failed to save page'));
          }
        }
      };
      
      window.addEventListener('message', listener);
      
      // Send the save message
      window.postMessage({
        source: 'SAVR_PWA',
        messageId,
        action: 'saveCurrentPage',
        url
      }, '*');
      
      // Set a timeout to reject if no response is received
      setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new Error('Timeout waiting for extension response'));
      }, 30000);
    });
  }

  /**
   * Fetch resources using the extension
   * @param {string[]} urls - The URLs of the resources to fetch
   * @returns {Promise<Object>} - A promise that resolves with the resources
   */
  function fetchResources(urls) {
    return new Promise((resolve, reject) => {
      const messageId = `resources-${Date.now()}`;
      
      // Set up a listener for the response
      const listener = function(event) {
        const data = event.data;
        if (data && data.source === 'SAVR_EXTENSION' && data.messageId === messageId) {
          window.removeEventListener('message', listener);
          
          if (data.success) {
            resolve(data.resources);
          } else {
            reject(new Error(data.error || 'Failed to fetch resources'));
          }
        }
      };
      
      window.addEventListener('message', listener);
      
      // Send the fetch resources message
      window.postMessage({
        source: 'SAVR_PWA',
        messageId,
        action: 'fetchResources',
        urls
      }, '*');
      
      // Set a timeout to reject if no response is received
      setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new Error('Timeout waiting for extension response'));
      }, 30000);
    });
  }

  // Return the public API
  return {
    isAvailable: checkExtensionPresence,
    savePage,
    fetchResources
  };
}

// Export the extension connector
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initExtension };
} else if (typeof window !== 'undefined') {
  window.savrExtension = initExtension();
}
