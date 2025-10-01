// Content script for Savr pages - handles communication with browser extension

console.log('Savr content script loaded');

// Listen for messages from the extension
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Savr content script received message:', request);
    
    if (request.type === 'SAVR_EXTENSION_DATA') {
        console.log('Received extension data:', request.payload);
        
        // Find the HTML textarea and populate it
        const textarea = document.querySelector('textarea');
        if (textarea) {
            // Set the value
            textarea.value = request.payload.html;
            
            // Trigger React's onChange event
            const inputEvent = new Event('input', { bubbles: true });
            textarea.dispatchEvent(inputEvent);
            
            // Also trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            textarea.dispatchEvent(changeEvent);
            
            console.log('Successfully populated textarea with extension data');
            
            // Focus the textarea
            textarea.focus();
            
            sendResponse({ success: true });
        } else {
            console.error('Could not find textarea element');
            sendResponse({ success: false, error: 'Textarea not found' });
        }
    }
    
    return true; // Keep the message channel open for async response
});

// Also listen for window messages as a fallback
window.addEventListener('message', function(event) {
    if (event.data.type === 'SAVR_EXTENSION_DATA') {
        console.log('Received extension data via window message:', event.data.payload);
        
        const textarea = document.querySelector('textarea');
        if (textarea) {
            textarea.value = event.data.payload.html;
            
            const inputEvent = new Event('input', { bubbles: true });
            textarea.dispatchEvent(inputEvent);
            
            const changeEvent = new Event('change', { bubbles: true });
            textarea.dispatchEvent(changeEvent);
            
            console.log('Successfully populated textarea via window message');
        }
    }
});

console.log('Savr content script ready');
