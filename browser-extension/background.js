// Background script for HTML Data Collector extension

// Handle extension installation
browser.runtime.onInstalled.addListener((details) => {
    console.log('HTML Data Collector extension installed/updated');
    
    if (details.reason === 'install') {
        // Set default settings
        browser.storage.local.set({
            settings: {
                autoCollect: false,
                maxHtmlSize: 1024 * 1024, // 1MB
                includeScripts: false,
                includeStyles: true
            }
        });
    }
});

// Handle messages from content scripts or popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    switch (request.action) {
        case 'collectHtmlData':
            handleCollectHtmlData(request, sender, sendResponse);
            return true; // Keep the message channel open for async response
            
        case 'getSettings':
            handleGetSettings(sendResponse);
            return true;
            
        case 'updateSettings':
            handleUpdateSettings(request.settings, sendResponse);
            return true;
            
        default:
            console.warn('Unknown action:', request.action);
            sendResponse({ error: 'Unknown action' });
    }
});

// Handle HTML data collection
async function handleCollectHtmlData(request, sender, sendResponse) {
    try {
        if (!sender.tab) {
            throw new Error('No tab context available');
        }

        // Execute content script to collect data
        const results = await browser.tabs.executeScript(sender.tab.id, {
            file: 'content.js'
        });

        if (results && results[0]) {
            const data = results[0];
            
            // Store the data
            await browser.storage.local.set({ 
                lastCollectedData: data,
                lastCollectedTime: Date.now()
            });
            
            sendResponse({ success: true, data: data });
        } else {
            throw new Error('Failed to collect HTML data');
        }

    } catch (error) {
        console.error('Error in handleCollectHtmlData:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle getting settings
async function handleGetSettings(sendResponse) {
    try {
        const result = await browser.storage.local.get(['settings']);
        sendResponse({ success: true, settings: result.settings || {} });
    } catch (error) {
        console.error('Error getting settings:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle updating settings
async function handleUpdateSettings(settings, sendResponse) {
    try {
        await browser.storage.local.set({ settings: settings });
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error updating settings:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle tab updates (optional - for auto-collection features)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab updated:', tab.url);
        // Could implement auto-collection here if needed
    }
});

// Handle extension icon click (if needed)
browser.browserAction.onClicked.addListener((tab) => {
    console.log('Extension icon clicked for tab:', tab.id);
    // The popup will handle this, but we could add additional logic here
});

// Clean up old data periodically
setInterval(() => {
    cleanupOldData();
}, 24 * 60 * 60 * 1000); // Run once per day

async function cleanupOldData() {
    try {
        const result = await browser.storage.local.get(['lastCollectedTime']);
        const lastCollectedTime = result.lastCollectedTime;
        
        if (lastCollectedTime) {
            const daysSinceLastCollection = (Date.now() - lastCollectedTime) / (1000 * 60 * 60 * 24);
            
            // If data is older than 7 days, clean it up
            if (daysSinceLastCollection > 7) {
                await browser.storage.local.remove(['lastCollectedData', 'lastCollectedTime']);
                console.log('Cleaned up old HTML data');
            }
        }
    } catch (error) {
        console.error('Error cleaning up old data:', error);
    }
}
