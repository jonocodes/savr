// Import styles
import "./popup.css";

// Interface definitions
interface SaveResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// DOM Elements
let saveButton: HTMLButtonElement;
let statusElement: HTMLParagraphElement;
let progressElement: HTMLDivElement;
let progressFill: HTMLDivElement;
let progressText: HTMLParagraphElement;
let resultElement: HTMLDivElement;
let resultMessage: HTMLParagraphElement;

// Initialize the popup when DOM content is loaded
document.addEventListener("DOMContentLoaded", (): void => {
  // Get DOM elements
  saveButton = document.getElementById("saveButton") as HTMLButtonElement;
  statusElement = document.getElementById("status") as HTMLParagraphElement;
  progressElement = document.getElementById("progress") as HTMLDivElement;
  progressFill = document.getElementById("progress-fill") as HTMLDivElement;
  progressText = document.getElementById("progress-text") as HTMLParagraphElement;
  resultElement = document.getElementById("result") as HTMLDivElement;
  resultMessage = document.getElementById("result-message") as HTMLParagraphElement;

  // Check if we can access the current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs): void => {
    const currentTab = tabs[0];
    if (!currentTab || !currentTab.url || currentTab.url.startsWith("chrome://")) {
      saveButton.disabled = true;
      statusElement.textContent = "Cannot save this page";
      return;
    }

    statusElement.textContent = `Ready to save: ${currentTab.title || "Current page"}`;
  });

  // Set up the save button
  saveButton.addEventListener("click", saveCurrentPage);
});

// Function to handle saving the current page
async function saveCurrentPage(): Promise<void> {
  try {
    // Update UI to saving state
    saveButton.disabled = true;
    statusElement.textContent = "Saving page...";
    progressElement.classList.remove("hidden");
    resultElement.classList.add("hidden");

    // Animate progress to show activity
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress >= 90) {
        clearInterval(progressInterval);
      }
      progressFill.style.width = `${Math.min(progress, 90)}%`;
    }, 300);

    // Send message to background script to save the page
    chrome.runtime.sendMessage({ action: "saveCurrentPage" }, (response: SaveResponse) => {
      clearInterval(progressInterval);

      if (response && response.success) {
        // Complete the progress bar
        progressFill.style.width = "100%";
        progressText.textContent = "Page saved successfully!";

        // Show success message
        setTimeout(() => {
          progressElement.classList.add("hidden");
          resultElement.classList.remove("hidden");
          resultElement.className = resultElement.className.replace("error", "") + " success";
          resultMessage.textContent = "Page saved successfully!";
          saveButton.disabled = false;
        }, 1000);
      } else {
        // Show error message
        progressElement.classList.add("hidden");
        resultElement.classList.remove("hidden");
        resultElement.className = resultElement.className.replace("success", "") + " error";
        resultMessage.textContent = `Error: ${response?.error || "Failed to save page"}`;
        saveButton.disabled = false;
      }
    });
  } catch (error) {
    console.error("Error saving page:", error);

    // Show error in the UI
    progressElement.classList.add("hidden");
    resultElement.classList.remove("hidden");
    resultElement.className = resultElement.className.replace("success", "") + " error";
    resultMessage.textContent = `Error: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    saveButton.disabled = false;
  }
}
