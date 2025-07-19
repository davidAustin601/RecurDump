/**
 * RecurTrack Sidebar Script
 * Handles sidebar interface and functionality
 */

(function() {
    'use strict';

    // DOM elements
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const clearBtn = document.getElementById('clear-btn');
    const detectionDetails = document.getElementById('detection-details');
    const detectionUrl = document.getElementById('detection-url');
    const detectionTime = document.getElementById('detection-time');
    const detectionIndicators = document.getElementById('detection-indicators');

    const modeInput = document.getElementById('mode-input');
    const extractLinksBtn = document.getElementById('extract-links-btn');
    const extractAllPagesCheckbox = document.getElementById('extract-all-pages-checkbox');
    const extractionResultsSection = document.getElementById('extraction-results-section');
    const extractionModel = document.getElementById('extraction-model');
    const extractionStatusText = document.getElementById('extraction-status-text');
    const extractionLinkCount = document.getElementById('extraction-link-count');
    const extractionLinksContainer = document.getElementById('extraction-links-container');
    const extractionLinksList = document.getElementById('extraction-links-list');
    const debugLogs = document.getElementById('debug-logs');
    const copyDebugBtn = document.getElementById('copy-debug-btn');
    const clearDebugBtn = document.getElementById('clear-debug-btn');
    const copyLinksBtn = document.getElementById('copy-links-btn');
    const clearLinksBtn = document.getElementById('clear-links-btn');

    // State
    let currentDetection = null;
    let detectionHistory = [];
    let currentExtraction = null;

    // Debug logging function
    function addDebugLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `debug-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        debugLogs.appendChild(logEntry);
        
        // Auto-scroll to bottom
        debugLogs.scrollTop = debugLogs.scrollHeight;
        
        // Keep only last 50 entries
        while (debugLogs.children.length > 50) {
            debugLogs.removeChild(debugLogs.firstChild);
        }
    }

    // Function to update status display
    function updateStatus(detection) {
        if (detection) {
            // Show detection status
            statusDot.className = 'status-dot detected';
            statusText.textContent = '⚠️ CloudFlare check detected!';
            clearBtn.style.display = 'block';
            
            // Show detection details
            detectionDetails.classList.add('show');
            detectionUrl.textContent = detection.url;
            
            // Format timestamp
            const detectedTime = new Date(detection.timestamp);
            detectionTime.textContent = detectedTime.toLocaleString();
            
            // Update indicators
            updateIndicators(detection.indicators);
            
        } else {
            // Show clear status
            statusDot.className = 'status-dot clear';
            statusText.textContent = '✅ No CloudFlare checks detected';
            clearBtn.style.display = 'none';
            detectionDetails.classList.remove('show');
        }
    }

    // Function to update detection indicators
    function updateIndicators(indicators) {
        const indicatorElements = detectionIndicators.querySelectorAll('.indicator-item');
        
        indicatorElements.forEach(element => {
            const indicatorType = element.getAttribute('data-indicator');
            if (indicators[indicatorType]) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        });
    }



    // Function to load current state
    async function loadCurrentState() {
        try {
            // Get current detection
            const detectionResponse = await browser.runtime.sendMessage({
                type: 'GET_CURRENT_DETECTION'
            });
            
            currentDetection = detectionResponse.detection;
            updateStatus(currentDetection);



            // Get current mode
            const modeResponse = await browser.runtime.sendMessage({
                type: 'GET_MODE'
            });
            
            if (modeResponse.mode) {
                modeInput.value = modeResponse.mode;
            }

            // Get current extraction state
            const extractionResponse = await browser.storage.local.get(['extractionState']);
            if (extractionResponse.extractionState) {
                currentExtraction = extractionResponse.extractionState;
                updateExtractionDisplay(currentExtraction);
            }

        } catch (error) {
            console.error('RecurTrack Sidebar: Error loading state:', error);
            statusText.textContent = '❌ Error loading state';
        }
    }

    // Function to clear current detection
    async function clearDetection() {
        try {
            await browser.runtime.sendMessage({
                type: 'CLEAR_DETECTION'
            });
            
            currentDetection = null;
            updateStatus(null);
            
        } catch (error) {
            console.error('RecurTrack Sidebar: Error clearing detection:', error);
        }
    }



    // Function to handle real-time updates
    function handleRealtimeUpdate(message) {
        switch (message.type) {
            case 'DETECTION_UPDATED':
                currentDetection = message.detection;
                updateStatus(currentDetection);
                break;
                

                
            case 'DETECTION_CLEARED':
                currentDetection = null;
                updateStatus(null);
                break;
                
            case 'EXTRACTION_STARTED':
                addDebugLog('Extraction started - opening new tab', 'info');
                currentExtraction = message.data;
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'EXTRACTION_WAITING_FOR_CLOUDFLARE':
                addDebugLog('Waiting for CloudFlare completion...', 'info');
                currentExtraction = message.data;
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'EXTRACTION_STEP_2_STARTED':
                addDebugLog('Starting link extraction from page...', 'info');
                currentExtraction = message.data;
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'EXTRACTION_PAGE_COMPLETED':
                addDebugLog(`Page ${message.data.currentPage} completed! Found ${message.data.links ? message.data.links.length : 0} total links so far`, 'success');
                currentExtraction = message.data;
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'EXTRACTION_COMPLETED':
                addDebugLog(`Extraction completed! Found ${message.data.links ? message.data.links.length : 0} total links from all pages`, 'success');
                currentExtraction = message.data;
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'EXTRACTION_ERROR':
                addDebugLog(`Extraction failed: ${message.error}`, 'error');
                currentExtraction = { status: 'error', error: message.error };
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'EXTRACTION_MESSAGE_RECEIVED':
                addDebugLog(`Background script received extraction request for: ${message.model}`, 'info');
                break;
        }
    }

    // Function to handle mode changes
    async function handleModeChange() {
        const mode = modeInput.value.trim();
        try {
            await browser.runtime.sendMessage({
                type: 'UPDATE_MODE',
                mode: mode
            });
            console.log('RecurTrack Sidebar: Mode updated to:', mode);
        } catch (error) {
            console.error('RecurTrack Sidebar: Error updating mode:', error);
        }
    }



    // Function to handle extract links button click
    async function handleExtractLinks() {
        try {
            // Disable button and show loading state
            extractLinksBtn.disabled = true;
            extractLinksBtn.textContent = '⏳ EXTRACTING...';
            
            // Get current model and checkbox state
            const model = modeInput.value.trim() || 'default';
            const extractAllPages = extractAllPagesCheckbox.checked;
            
            addDebugLog(`Starting extraction for model: ${model}`, 'info');
            addDebugLog(`Extract all pages: ${extractAllPages ? 'Yes' : 'No'}`, 'info');
            
            // Send message to background script to start extraction
            try {
                const response = await browser.runtime.sendMessage({
                    type: 'EXTRACT_LINKS',
                    model: model,
                    extractAllPages: extractAllPages
                });
                
                addDebugLog('Extraction request sent to background script', 'success');
                addDebugLog(`Background response: ${JSON.stringify(response)}`, 'info');
                
                // Check if we should expect further updates
                if (response.success) {
                    addDebugLog('Waiting for extraction updates...', 'info');
                }
                
            } catch (error) {
                addDebugLog(`Message sending failed: ${error.message}`, 'error');
                throw error;
            }
            console.log('RecurTrack Sidebar: Extract links initiated for model:', model, 'extractAllPages:', extractAllPages);
            
        } catch (error) {
            addDebugLog(`Error: ${error.message}`, 'error');
            console.error('RecurTrack Sidebar: Error extracting links:', error);
        } finally {
            // Re-enable button after a short delay
            setTimeout(() => {
                extractLinksBtn.disabled = false;
                extractLinksBtn.textContent = '🔗 EXTRACT LINKS';
            }, 2000);
        }
    }

    // Function to update extraction display
    function updateExtractionDisplay(extractionData) {
        if (!extractionData) {
            extractionResultsSection.style.display = 'none';
            return;
        }

        // Show the extraction results section
        extractionResultsSection.style.display = 'block';
        
        // Update extraction info
        extractionModel.textContent = extractionData.model || 'Unknown';
        
        // Update status with appropriate styling
        const statusText = getStatusText(extractionData.status);
        extractionStatusText.textContent = statusText.text;
        extractionStatusText.className = `detail-value ${statusText.class}`;
        
        // Update link count
        const linkCount = extractionData.links ? extractionData.links.length : 0;
        extractionLinkCount.textContent = linkCount;
        
        // Show/hide links container based on completion
        if (extractionData.status === 'completed' && extractionData.links && extractionData.links.length > 0) {
            extractionLinksContainer.style.display = 'block';
            updateExtractionLinks(extractionData.links);
        } else {
            extractionLinksContainer.style.display = 'none';
        }
    }

    // Function to get status text and class
    function getStatusText(status) {
        switch (status) {
            case 'waiting_for_page_load':
                return { text: '⏳ Waiting for page to load...', class: 'extraction-status-waiting' };
            case 'waiting_for_cloudflare_completion':
                return { text: '🛡️ Waiting for CloudFlare completion...', class: 'extraction-status-waiting' };
            case 'extracting_links':
                return { text: '🔍 Extracting links...', class: 'extraction-status-extracting' };
            case 'completed':
                return { text: '✅ Extraction completed', class: 'extraction-status-completed' };
            case 'error':
                return { text: '❌ Extraction failed', class: 'extraction-status-error' };
            default:
                // Handle page extraction status (e.g., "extracting_page_2")
                if (status && status.startsWith('extracting_page_')) {
                    const pageNum = status.split('_')[2];
                    return { text: `📄 Extracting page ${pageNum}...`, class: 'extraction-status-extracting' };
                }
                return { text: 'Unknown status', class: '' };
        }
    }

    // Function to update extraction links list
    function updateExtractionLinks(links) {
        if (!links || links.length === 0) {
            extractionLinksList.innerHTML = '<div class="extraction-link-item">No links found</div>';
            return;
        }

        const linksHtml = links.map(link => `
            <div class="extraction-link-item" title="${link}">
                ${link}
            </div>
        `).join('');

        extractionLinksList.innerHTML = linksHtml;
    }

    // Function to copy all extracted links
    async function copyAllLinks() {
        try {
            if (!currentExtraction || !currentExtraction.links || currentExtraction.links.length === 0) {
                addDebugLog('No links to copy', 'error');
                return;
            }

            const linksText = currentExtraction.links.join('\n');
            
            await navigator.clipboard.writeText(linksText);
            addDebugLog(`Copied ${currentExtraction.links.length} links to clipboard!`, 'success');
            
        } catch (error) {
            addDebugLog(`Failed to copy links: ${error.message}`, 'error');
        }
    }

    // Function to clear extracted links
    async function clearExtractedLinks() {
        try {
            // Clear the extraction state from storage
            await browser.storage.local.remove(['extractionState']);
            
            // Clear the current extraction state
            currentExtraction = null;
            
            // Hide the extraction results section
            extractionResultsSection.style.display = 'none';
            
            addDebugLog('Extracted links cleared!', 'success');
            
        } catch (error) {
            addDebugLog(`Failed to clear links: ${error.message}`, 'error');
        }
    }

    // Event listeners
    clearBtn.addEventListener('click', clearDetection);
    modeInput.addEventListener('input', handleModeChange);
    extractLinksBtn.addEventListener('click', handleExtractLinks);
    copyDebugBtn.addEventListener('click', () => {
        const logText = Array.from(debugLogs.children)
            .map(entry => entry.textContent)
            .join('\n');
        
        navigator.clipboard.writeText(logText).then(() => {
            addDebugLog('Debug logs copied to clipboard!', 'success');
        }).catch(() => {
            addDebugLog('Failed to copy logs', 'error');
        });
    });
    
    clearDebugBtn.addEventListener('click', () => {
        debugLogs.innerHTML = '<div class="debug-entry">Debug logs cleared...</div>';
    });
    
    copyLinksBtn.addEventListener('click', copyAllLinks);
    clearLinksBtn.addEventListener('click', clearExtractedLinks);

    // Listen for messages from background script
    browser.runtime.onMessage.addListener(handleRealtimeUpdate);

    // Listen for storage changes for real-time updates
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            // Update detection history if it changed
            if (changes.detectionHistory) {
                detectionHistory = changes.detectionHistory.newValue || [];
                updateHistory(detectionHistory);
                updateStatistics(detectionHistory);
            }
            
            // Update extraction state if it changed
            if (changes.extractionState) {
                currentExtraction = changes.extractionState.newValue;
                updateExtractionDisplay(currentExtraction);
            }
            
            // Update current detection if it changed
            if (changes.currentDetection) {
                currentDetection = changes.currentDetection.newValue;
                updateStatus(currentDetection);
            }
        }
    });

    // Initialize sidebar
    document.addEventListener('DOMContentLoaded', () => {
        console.log('RecurTrack Sidebar: Initializing...');
        loadCurrentState();
    });

    // Handle sidebar visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Sidebar became visible, refresh data
            loadCurrentState();
        }
    });

    console.log('RecurTrack Sidebar: Script loaded');

})(); 