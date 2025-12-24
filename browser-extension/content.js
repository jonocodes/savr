// Simple message relay between extension and page
console.log('[content.js] Content script loaded');

// Listen for messages from the popup/extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[content.js] Received message from extension:', message);
    
    if (message.type === 'PING') {
        console.log('[content.js] Received PING, responding ready');
        sendResponse({ ready: true });
        return true; // Required for asynchronous sendResponse
    }
    
    if (message.type === 'TEST_MESSAGE') {
        // Forward the message to the page
        window.postMessage({
            type: 'FROM_EXTENSION',
            message: message.text
        }, '*');
        console.log('[content.js] Forwarded test message to page');
        sendResponse({ success: true });
        return true; // Required for asynchronous sendResponse
    }
});

    
