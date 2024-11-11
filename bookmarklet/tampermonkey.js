// ==UserScript==
// @name         Loader Script
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Fetch and run the main script from the server
// @author       You
// @match        *://*/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

const hosts = [
    'http://localhost:8080/savr',
    'http://127.0.0.1:8080/savr'
];

//    'use strict';

const path = '/static/savr-remote.js';
let currentHostIndex = 0;

function runWithSimpleProgress() {
    window.location.href = `${hosts[currentHostIndex]}/save?url=${window.location.href}`;
}

// Function to fetch and run the second script
function fetchAndRunScript() {

    const scriptUrl = `${hosts[currentHostIndex]}${path}`;

    const scriptElement = document.createElement('script');

    scriptElement.type = 'text/javascript';
    scriptElement.src = scriptUrl;

    document.head.append(scriptElement);

    scriptElement.onload = () => {

        if (typeof savr !== 'undefined' && typeof savr.startSSE === 'function') {
            const currentUrl = window.location.href;
            savr.startSSE(hosts[currentHostIndex], currentUrl);
        } else {
            showErrorPopup('Error: startSSE function not found in loaded script');
        }
    };

    scriptElement.onerror = () => {
        if (currentHostIndex < hosts.length - 1) {
            currentHostIndex++;
            fetchAndRunScript();
        } else {
            showErrorPopup(`Error: Could not load script from ${scriptUrl}`);
        }
    };

    document.body.appendChild(scriptElement);
}

function showErrorPopup(message) {
    const errorPopup = document.createElement('div');
    errorPopup.innerHTML = `
            <div style="padding: 10px; background: rgba(255, 0, 0, 0.8); color: white; border-radius: 5px; text-align: center;">
                ${message}
            </div>`;
    errorPopup.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
        `;
    document.body.appendChild(errorPopup);

    setTimeout(() => {
        errorPopup.style.transition = 'opacity 1s ease-out';
        errorPopup.style.opacity = '0';
        setTimeout(() => errorPopup.remove(), 1000);
    }, 2000);
}

// switch the comments below when generating a bookmarklet here: https://make-bookmarklets.com/

GM_registerMenuCommand("Run URL Progress Script", fetchAndRunScript);
GM_registerMenuCommand("Scrape redirect", runWithSimpleProgress);

//fetchAndRunScript();

