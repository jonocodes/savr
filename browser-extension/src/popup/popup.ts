/// <reference types="chrome" />

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
  console.log("SAVR Extension Popup: DOMContentLoaded");
  // Get DOM elements
  saveButton = document.getElementById("saveButton") as HTMLButtonElement;
  statusElement = document.getElementById("status") as HTMLParagraphElement;
  progressElement = document.getElementById("progress") as HTMLDivElement;
  progressFill = document.getElementById("progress-fill") as HTMLDivElement;
  progressText = document.getElementById("progress-text") as HTMLParagraphElement;
  resultElement = document.getElementById("result") as HTMLDivElement;
  resultMessage = document.getElementById("result-message") as HTMLParagraphElement;

  console.log("SAVR Extension Popup: DOM elements obtained");

  statusElement.textContent = "Ready to save page";
  saveButton.addEventListener("click", saveCurrentPage);
  console.log("SAVR Extension Popup: Save button event listener added");
});

// Function to handle saving the current page
async function saveCurrentPage(): Promise<void> {
  console.log("SAVR Extension Popup: saveCurrentPage function called");
  try {
    // Update UI to saving state
    saveButton.disabled = true;
    statusElement.textContent = "Saving page...";
    progressElement.classList.remove("hidden");
    resultElement.classList.add("hidden");
    console.log("SAVR Extension Popup: UI updated to saving state");

    // Animate progress to show activity
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress >= 90) {
        clearInterval(progressInterval);
      }
      progressFill.style.width = `${Math.min(progress, 90)}%`;
    }, 300);
    console.log("SAVR Extension Popup: Progress animation started");

    // Send message to background script to get page data
    chrome.runtime.sendMessage({ action: "getPageData" }, async (response) => {
      try {
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }

        if (!response?.success || !response?.pageData) {
          throw new Error("Failed to get page data2");
        }

        // Send page data to background script for saving
        chrome.runtime.sendMessage(
          {
            action: "saveCurrentPage",
            pageData: response.pageData,
          },
          (saveResponse) => {
            console.log("SAVR Extension Popup: Received response from background:", saveResponse);
            clearInterval(progressInterval);

            if (saveResponse && saveResponse.success) {
              console.log("SAVR Extension Popup: Page saved successfully");
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
                console.log("SAVR Extension Popup: UI updated to success state");
              }, 1000);
            } else {
              handleError(saveResponse?.error || "Failed to save page");
            }
          }
        );
      } catch (error) {
        handleError(error instanceof Error ? error.message : "Unknown error");
      }
    });
  } catch (error) {
    handleError(error instanceof Error ? error.message : "Unknown error");
  }
}

// Helper function to handle errors
function handleError(errorMessage: string) {
  console.error("SAVR Extension Popup: Error:", errorMessage);
  progressElement.classList.add("hidden");
  resultElement.classList.remove("hidden");
  resultElement.className = resultElement.className.replace("success", "") + " error";
  resultMessage.textContent = `Error: ${errorMessage}`;
  saveButton.disabled = false;
  console.log("SAVR Extension Popup: UI updated to error state");
}
