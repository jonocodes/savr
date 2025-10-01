// Popup script for HTML Data Collector extension

console.log('HTML Data Collector popup script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded, initializing popup...');
    const collectBtn = document.getElementById('collectBtn');
    const saveToSavrBtn = document.getElementById('saveToSavrBtn');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const clearBtn = document.getElementById('clearBtn');
    const htmlOutput = document.getElementById('htmlOutput');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const htmlSize = document.getElementById('htmlSize');
    const elementsCount = document.getElementById('elementsCount');

    // Initialize UI state
    updateButtonStates(false);

    // Event listeners
    collectBtn.addEventListener('click', collectHTMLData);
    saveToSavrBtn.addEventListener('click', saveToSavr);
    copyBtn.addEventListener('click', copyHTML);
    downloadBtn.addEventListener('click', downloadHTML);
    clearBtn.addEventListener('click', clearData);


    // Load saved data if available
    loadSavedData();

    async function collectHTMLData() {
        try {
            console.log('Starting HTML data collection...');
            setLoadingState(true);
            
            // Check if browser API is available
            if (typeof browser === 'undefined') {
                throw new Error('Browser API not available');
            }
            
            // Get the active tab
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            console.log('Found tabs:', tabs);
            const activeTab = tabs[0];
            
            if (!activeTab) {
                throw new Error('No active tab found');
            }

            console.log('Active tab:', activeTab);

            // Inject content script to collect HTML data
            const results = await browser.tabs.executeScript(activeTab.id, {
                file: 'content.js'
            });

            console.log('Content script results:', results);

            if (results && results[0]) {
                const data = results[0];
                console.log('Collected data:', data);
                displayHTMLData(data);
                saveData(data);
            } else {
                throw new Error('Failed to collect HTML data - no results returned');
            }

        } catch (error) {
            console.error('Error collecting HTML data:', error);
            showError('Failed to collect HTML data: ' + error.message);
        } finally {
            setLoadingState(false);
        }
    }

    function displayHTMLData(data) {
        console.log('Displaying HTML data:', data);
        
        // Update stats
        pageTitle.textContent = data.title || 'Unknown';
        pageUrl.textContent = data.url || 'Unknown';
        htmlSize.textContent = formatBytes(data.htmlSize || 0);
        elementsCount.textContent = data.elementsCount || 0;

        // Display HTML content
        const htmlContent = data.html || data.formattedHtml || 'No HTML content available';
        htmlOutput.textContent = htmlContent;
        
        console.log('HTML content length:', htmlContent.length);
        
        // Update button states
        updateButtonStates(true);
    }

    function updateButtonStates(hasData) {
        saveToSavrBtn.disabled = !hasData;
        copyBtn.disabled = !hasData;
        downloadBtn.disabled = !hasData;
        clearBtn.disabled = !hasData;
    }

    function setLoadingState(loading) {
        collectBtn.disabled = loading;
        if (loading) {
            collectBtn.textContent = 'Collecting...';
            document.body.classList.add('loading');
        } else {
            collectBtn.textContent = 'Collect HTML Data';
            document.body.classList.remove('loading');
        }
    }

    function showError(message) {
        htmlOutput.textContent = `Error: ${message}`;
        htmlOutput.classList.add('error');
        setTimeout(() => {
            htmlOutput.classList.remove('error');
        }, 3000);
    }

    function showSuccess(message) {
        htmlOutput.textContent = message;
        htmlOutput.classList.add('success');
        setTimeout(() => {
            htmlOutput.classList.remove('success');
        }, 2000);
    }

    async function copyHTML() {
        try {
            const htmlContent = htmlOutput.textContent;
            if (!htmlContent || htmlContent === 'Click "Collect HTML Data" to start...') {
                showError('No HTML content to copy');
                return;
            }

            await navigator.clipboard.writeText(htmlContent);
            showSuccess('HTML content copied to clipboard!');
        } catch (error) {
            console.error('Error copying HTML:', error);
            showError('Failed to copy HTML content');
        }
    }

    function downloadHTML() {
        const htmlContent = htmlOutput.textContent;
        if (!htmlContent || htmlContent === 'Click "Collect HTML Data" to start...') {
            showError('No HTML content to download');
            return;
        }

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `page-html-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showSuccess('HTML file downloaded!');
    }

    function clearData() {
        // Clear displayed data
        pageTitle.textContent = '-';
        pageUrl.textContent = '-';
        htmlSize.textContent = '-';
        elementsCount.textContent = '-';
        htmlOutput.textContent = 'Click "Collect HTML Data" to start...';
        
        // Clear saved data
        browser.storage.local.remove(['htmlData']);
        
        // Update button states
        updateButtonStates(false);
    }

    async function saveToSavr() {
        try {
            console.log('Saving to Savr...');
            
            // Get the current HTML data
            const htmlContent = htmlOutput.textContent;
            if (!htmlContent || htmlContent === 'Click "Collect HTML Data" to start...') {
                showError('No HTML content to save to Savr');
                return;
            }

            // Get page metadata
            const pageTitle = document.getElementById('pageTitle').textContent;
            const pageUrl = document.getElementById('pageUrl').textContent;

            // Prepare the data
            const savrData = {
                html: htmlContent,
                title: pageTitle,
                url: pageUrl,
                source: 'browser-extension',
                timestamp: Date.now()
            };

            console.log('Prepared Savr data:', savrData);

            // Store data in extension storage first
            await browser.storage.local.set({ 
                'savr-extension-data': savrData 
            });

            // Open the Savr submit page
            const tab = await browser.tabs.create({
                url: 'https://localhost:3000/submit',
                active: true
            });

            console.log('Opened Savr tab:', tab.id);

            // Wait for the page to load, then send the data
            setTimeout(async () => {
                try {
                    // Send the data to the Savr page via content script
                    const response = await browser.tabs.sendMessage(tab.id, {
                        type: 'SAVR_EXTENSION_DATA',
                        payload: savrData
                    });

                    if (response && response.success) {
                        console.log('Successfully sent data to Savr page');
                    } else {
                        console.error('Failed to send data to Savr page:', response);
                    }
                } catch (messageError) {
                    console.error('Error sending message to Savr page:', messageError);
                    
                    // Fallback: try to inject a script directly
                    try {
                        const fallbackScript = `
                            (function() {
                                console.log('Fallback script running...');
                                
                                // Wait for the textarea to be available
                                const waitForTextarea = () => {
                                    const textarea = document.querySelector('textarea');
                                    if (textarea) {
                                        textarea.value = ${JSON.stringify(savrData.html)};
                                        
                                        // Trigger React's onChange event
                                        const inputEvent = new Event('input', { bubbles: true });
                                        textarea.dispatchEvent(inputEvent);
                                        
                                        const changeEvent = new Event('change', { bubbles: true });
                                        textarea.dispatchEvent(changeEvent);
                                        
                                        console.log('Fallback: Populated textarea with extension data');
                                    } else {
                                        setTimeout(waitForTextarea, 500);
                                    }
                                };
                                
                                waitForTextarea();
                            })();
                        `;

                        await browser.tabs.executeScript(tab.id, {
                            code: fallbackScript
                        });
                        
                        console.log('Used fallback script to populate textarea');
                    } catch (fallbackError) {
                        console.error('Fallback script also failed:', fallbackError);
                    }
                }
            }, 3000); // Wait 3 seconds for page to load

            // Show success message
            showSuccess('Opening Savr submit page...');

            // Close the popup after a short delay
            setTimeout(() => {
                window.close();
            }, 1000);

        } catch (error) {
            console.error('Error saving to Savr:', error);
            showError('Failed to open Savr: ' + error.message);
        }
    }

    function saveData(data) {
        browser.storage.local.set({ htmlData: data });
    }

    function loadSavedData() {
        browser.storage.local.get(['htmlData']).then(result => {
            if (result.htmlData) {
                displayHTMLData(result.htmlData);
            }
        });
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
