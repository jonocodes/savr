// Content script for HTML Data Collector extension
// This script runs in the context of web pages to collect HTML data

(function() {
    'use strict';

    // Function to collect comprehensive HTML data from the current page
    function collectHTMLData() {
        try {
            const data = {
                title: document.title,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                html: document.documentElement.outerHTML,
                htmlSize: document.documentElement.outerHTML.length,
                elementsCount: document.querySelectorAll('*').length,
                meta: {
                    description: getMetaContent('description'),
                    keywords: getMetaContent('keywords'),
                    author: getMetaContent('author'),
                    viewport: getMetaContent('viewport'),
                    charset: document.characterSet || document.charset,
                    language: document.documentElement.lang || 'unknown'
                },
                links: {
                    stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => ({
                        href: link.href,
                        media: link.media
                    })),
                    scripts: Array.from(document.querySelectorAll('script[src]')).map(script => ({
                        src: script.src,
                        type: script.type || 'text/javascript'
                    }))
                },
                images: Array.from(document.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    alt: img.alt,
                    width: img.width,
                    height: img.height
                })),
                forms: Array.from(document.querySelectorAll('form')).map(form => ({
                    action: form.action,
                    method: form.method,
                    inputs: Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
                        type: input.type,
                        name: input.name,
                        id: input.id,
                        placeholder: input.placeholder,
                        required: input.required
                    }))
                })),
                headings: {
                    h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
                    h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()),
                    h3: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim())
                },
                text: {
                    bodyText: document.body ? document.body.innerText : '',
                    wordCount: document.body ? document.body.innerText.split(/\s+/).length : 0
                },
                performance: {
                    loadTime: performance.timing ? 
                        performance.timing.loadEventEnd - performance.timing.navigationStart : null,
                    domContentLoaded: performance.timing ? 
                        performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart : null
                }
            };

            return data;

        } catch (error) {
            console.error('Error collecting HTML data:', error);
            return {
                error: error.message,
                title: document.title || 'Unknown',
                url: window.location.href || 'Unknown',
                timestamp: new Date().toISOString()
            };
        }
    }

    // Helper function to get meta tag content
    function getMetaContent(name) {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.content : null;
    }

    // Function to get a clean, formatted version of the HTML
    function getFormattedHTML() {
        try {
            // Clone the document to avoid modifying the original
            const clone = document.documentElement.cloneNode(true);
            
            // Remove script tags for security
            const scripts = clone.querySelectorAll('script');
            scripts.forEach(script => script.remove());
            
            // Get the outer HTML
            let html = clone.outerHTML;
            
            // Basic formatting (add line breaks after tags)
            html = html
                .replace(/></g, '>\n<')
                .replace(/^\s+|\s+$/g, '') // trim
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n');
            
            return html;
        } catch (error) {
            console.error('Error formatting HTML:', error);
            return document.documentElement.outerHTML;
        }
    }

    // Function to get page statistics
    function getPageStats() {
        const stats = {
            totalElements: document.querySelectorAll('*').length,
            textNodes: 0,
            images: document.querySelectorAll('img').length,
            links: document.querySelectorAll('a').length,
            forms: document.querySelectorAll('form').length,
            inputs: document.querySelectorAll('input, textarea, select').length,
            scripts: document.querySelectorAll('script').length,
            stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
            iframes: document.querySelectorAll('iframe').length,
            videos: document.querySelectorAll('video').length,
            audios: document.querySelectorAll('audio').length
        };

        // Count text nodes
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim().length > 0) {
                stats.textNodes++;
            }
        }

        return stats;
    }

    // Main execution
    const htmlData = collectHTMLData();
    
    // Add formatted HTML and stats
    htmlData.formattedHtml = getFormattedHTML();
    htmlData.stats = getPageStats();
    
    // Return the data (this will be captured by the popup script)
    return htmlData;

})();
