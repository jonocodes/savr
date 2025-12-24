console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    const testBtn = document.getElementById('testBtn');
    
    testBtn.addEventListener('click', async () => {
        console.log('Test button clicked');
        
        try {
            // Create new tab with submit page
            const tab = await browser.tabs.create({
                url: 'http://localhost:3000/submit'
            });
            
            console.log('Created tab:', tab.id);
            
            // Function to try sending a ping message
            const tryPing = async () => {
                try {
                    const response = await browser.tabs.sendMessage(tab.id, { type: 'PING' });
                    return response && response.ready;
                } catch (e) {
                    return false;
                }
            };
            
            // Wait for content script to be ready
            console.log('Waiting for content script...');
            let attempts = 0;
            while (attempts < 10) {
                if (await tryPing()) {
                    // Content script is ready, send the actual message
                    console.log('Content script ready, sending message...');
                    await browser.tabs.sendMessage(tab.id, {
                        type: 'TEST_MESSAGE',
                        text: 'test message'
                    });
                    console.log('Message sent');
                    break;
                }
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            if (attempts >= 10) {
                throw new Error('Timed out waiting for content script');
            }
            
        } catch (error) {
            console.error('Error:', error);
        }
    });
});