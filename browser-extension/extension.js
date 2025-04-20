// This file serves as a bridge between the browser extension and the SAVR app
// It provides functions to communicate with the extension from the app

/**
 * Initialize the extension connector
 * @returns {Object} The extension connector object
 */
function initExtension() {
  console.log('SAVR Extension: Initializing extension connector');
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.error('SAVR Extension: Extension connector can only be used in a browser environment');
    return null;
  }

  // Check if the extension is installed by sending a ping message
  function checkExtensionPresence() {
    console.log('SAVR Extension: Checking extension presence');
    return new Promise((resolve) => {
      // Create a unique message ID
      const messageId = `ping-${Date.now()}`;
      
      // Set up a listener for the response
      const listener = function(event) {
        const data = event.data;
        if (data && data.source === 'SAVR_EXTENSION' && data.messageId === messageId) {
          console.log('SAVR Extension: Ping response received', data);
          window.removeEventListener('message', listener);
          resolve(true);
        }
      };
      
      window.addEventListener('message', listener);
      
      console.log('SAVR Extension: Sending ping message to PWA');
      // Send the ping message
      window.postMessage({
        source: 'SAVR_PWA',
        messageId,
        action: 'ping'
      }, '*');
      
      // Set a timeout to resolve with false if no response is received
      setTimeout(() => {
        console.log('SAVR Extension: Ping timeout, extension not detected');
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
    console.log('SAVR Extension: savePage called for URL:', url);
    return new Promise((resolve, reject) => {
      const messageId = `save-${Date.now()}`;
      
      // Set up a listener for the response
      const listener = function(event) {
        const data = event.data;
        if (data && data.source === 'SAVR_EXTENSION' && data.messageId === messageId) {
          console.log('SAVR Extension: savePage response received:', data);
          window.removeEventListener('message', listener);
          
          if (data.success) {
            resolve(data.data);
          } else {
            reject(new Error(data.error || 'Failed to save page'));
          }
        }
      };
      
      window.addEventListener('message', listener);
      
      console.log('SAVR Extension: Sending saveCurrentPage message to PWA');
      // Send the save message
      window.postMessage({
        source: 'SAVR_PWA',
        messageId,
        action: 'saveCurrentPage',
        url
      }, '*');
      
      // Set a timeout to reject if no response is received
      setTimeout(() => {
        console.error('SAVR Extension: Timeout waiting for savePage response');
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
    console.log('SAVR Extension: fetchResources called for URLs:', urls);
    return new Promise((resolve, reject) => {
      const messageId = `resources-${Date.now()}`;
      
      // Set up a listener for the response
      const listener = function(event) {
        const data = event.data;
        if (data && data.source === 'SAVR_EXTENSION' && data.messageId === messageId) {
          console.log('SAVR Extension: fetchResources response received:', data);
          window.removeEventListener('message', listener);
          
          if (data.success) {
            resolve(data.resources);
          } else {
            reject(new Error(data.error || 'Failed to fetch resources'));
          }
        }
      };
      
      window.addEventListener('message', listener);
      
      console.log('SAVR Extension: Sending fetchResources message to PWA');
      // Send the fetch resources message
      window.postMessage({
        source: 'SAVR_PWA',
        messageId,
        action: 'fetchResources',
        urls
      }, '*');
      
      // Set a timeout to reject if no response is received
      setTimeout(() => {
        console.error('SAVR Extension: Timeout waiting for fetchResources response');
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
