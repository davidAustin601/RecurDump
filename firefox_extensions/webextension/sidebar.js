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
    const filenameDatabaseSection = document.getElementById('filename-database-section');
    const databaseEntryCount = document.getElementById('database-entry-count');
    const databaseStatusText = document.getElementById('database-status-text');
    const databaseContainer = document.getElementById('database-container');
    const databaseList = document.getElementById('database-list');
    const copyDatabaseBtn = document.getElementById('copy-database-btn');
    const clearDatabaseBtn = document.getElementById('clear-database-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');

    // Progress tracking elements
    const progressSection = document.getElementById('progress-section');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const currentStepName = document.getElementById('current-step-name');
    const stepProgress = document.getElementById('step-progress');
    const currentPageInfo = document.getElementById('current-page-info');
    const filenamesProcessedInfo = document.getElementById('filenames-processed-info');
    const timeRemainingInfo = document.getElementById('time-remaining-info');

    // Error message elements
    const errorMessageSection = document.getElementById('error-message-section');
    const errorMessageTitle = document.getElementById('error-message-title');
    const errorMessageBody = document.getElementById('error-message-body');
    const errorMessageActions = document.getElementById('error-message-actions');

    // Error log elements
    const errorLogSection = document.getElementById('error-log-section');
    const errorLogList = document.getElementById('error-log-list');

    // State
    let currentDetection = null;
    let detectionHistory = [];
    let currentExtraction = null;
    let filenameDatabase = [];

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

    // Function to show a user-friendly error message
    function showErrorMessage(title, body, actions = []) {
        errorMessageTitle.textContent = title;
        errorMessageBody.innerHTML = body;
        errorMessageActions.innerHTML = '';
        errorMessageSection.style.display = 'block';
        // Hide other main sections for clarity
        extractionResultsSection.style.display = 'none';
        progressSection.style.display = 'none';
        filenameDatabaseSection.style.display = 'none';
        // Add action buttons if provided
        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.textContent = action.label;
            btn.onclick = action.onClick;
            errorMessageActions.appendChild(btn);
        });
    }

    // Function to hide the error message
    function hideErrorMessage() {
        errorMessageSection.style.display = 'none';
        errorMessageActions.innerHTML = '';
    }

    // Function to add error to persistent log
    async function addErrorToLog(errorMsg) {
        let errorLog = [];
        try {
            const result = await browser.storage.local.get(['errorLog']);
            errorLog = result.errorLog || [];
        } catch {}
        errorLog.push({
            message: errorMsg,
            timestamp: new Date().toISOString()
        });
        // Keep only last 20 errors
        if (errorLog.length > 20) errorLog = errorLog.slice(-20);
        await browser.storage.local.set({ errorLog });
        updateErrorLogDisplay(errorLog);
    }

    // Function to update error log display
    async function updateErrorLogDisplay(log) {
        if (!log) {
            const result = await browser.storage.local.get(['errorLog']);
            log = result.errorLog || [];
        }
        errorLogList.innerHTML = '';
        if (log.length === 0) {
            errorLogList.innerHTML = '<div class="error-log-empty">No recent errors.</div>';
        } else {
            log.slice().reverse().forEach(entry => {
                const div = document.createElement('div');
                div.className = 'error-log-entry';
                div.innerHTML = `<span class='error-log-time'>${new Date(entry.timestamp).toLocaleString()}</span> <span class='error-log-msg'>${entry.message}</span>`;
                errorLogList.appendChild(div);
            });
        }
        errorLogSection.style.display = log.length > 0 ? 'block' : 'none';
    }

    // Show error log on load
    updateErrorLogDisplay();


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

            // Get current filename database
            const databaseResponse = await browser.storage.local.get(['filenameDatabase']);
            if (databaseResponse.filenameDatabase) {
                filenameDatabase = databaseResponse.filenameDatabase;
                updateFilenameDatabaseDisplay(filenameDatabase);
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
                addErrorToLog(message.error || 'Unknown extraction error');
                currentExtraction = { status: 'error', error: message.error };
                updateExtractionDisplay(currentExtraction);
                // Show user-friendly error message with retry/reset actions
                showErrorMessage(
                    'Extraction Failed',
                    `<div>${message.error ? message.error : 'An unknown error occurred during extraction.'}</div>
                    <div style='margin-top:8px; color:#6b7280; font-size:12px;'>You can try again, or reset the extension state if the problem persists.</div>`,
                    [
                        {
                            label: 'Retry',
                            onClick: () => {
                                hideErrorMessage();
                                // Trigger retry (send message to background)
                                if (currentExtraction && currentExtraction.model) {
                                    browser.runtime.sendMessage({
                                        type: 'EXTRACT_LINKS',
                                        model: currentExtraction.model,
                                        extractAllPages: currentExtraction.extractAllPages || false,
                                        extractFilenames: currentExtraction.extractFilenames || false
                                    });
                                }
                            }
                        },
                        {
                            label: 'Reset',
                            onClick: () => {
                                hideErrorMessage();
                                // Clear all data and reset state
                                browser.runtime.sendMessage({ type: 'CLEAR_DETECTION' });
                                browser.storage.local.remove(['extractionState', 'filenameDatabase', 'debugLogs']);
                                updateExtractionDisplay(null);
                                updateFilenameDatabaseDisplay([]);
                                debugLogs.innerHTML = '';
                            }
                        }
                    ]
                );
                break;
                
            case 'EXTRACTION_MESSAGE_RECEIVED':
                addDebugLog(`Background script received extraction request for: ${message.model}`, 'info');
                if (message.extractFilenames) {
                    addDebugLog('Filename extraction requested', 'info');
                }
                break;
                
            case 'FILENAME_EXTRACTION_STARTED':
                addDebugLog('Starting filename extraction from video pages...', 'info');
                databaseStatusText.textContent = 'Extracting filenames...';
                break;
                
            case 'FILENAME_EXTRACTION_PROGRESS':
                addDebugLog(`Filename extraction progress: ${message.current}/${message.total}`, 'info');
                databaseStatusText.textContent = `Processing ${message.current}/${message.total}`;
                break;
                
            case 'FILENAME_EXTRACTION_COMPLETED':
                addDebugLog(`Filename extraction completed! Found ${message.database.length} entries`, 'success');
                console.log('RecurTrack Sidebar: FILENAME_EXTRACTION_COMPLETED message received:', message);
                filenameDatabase = message.database;
                updateFilenameDatabaseDisplay(filenameDatabase);
                databaseStatusText.textContent = 'Completed';
                break;
                
            case 'DATABASE_AUTO_SAVED':
                addDebugLog(`Database auto-saved: ${message.filename}`, 'success');
                break;
                
            case 'DATABASE_AUTO_SAVE_ERROR':
                addDebugLog(`Auto-save failed: ${message.error}`, 'error');
                break;
                
            case 'EXTRACTION_PROGRESS_UPDATE':
                addDebugLog(`Progress update: ${message.data.progress.percentage}% - ${message.data.progress.stepName}`, 'info');
                currentExtraction = message.data;
                updateExtractionDisplay(currentExtraction);
                break;
                
            case 'CLEAR_SIDEBAR_DATA':
                addDebugLog('Auto-clearing sidebar data after successful extraction', 'info');
                // Clear all data displays
                currentExtraction = null;
                filenameDatabase = [];
                updateExtractionDisplay(null);
                updateFilenameDatabaseDisplay([]);
                // Clear debug logs
                debugLogs.innerHTML = '';
                addDebugLog('Sidebar data cleared automatically', 'info');
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
            
            // Get current model
            const model = modeInput.value.trim() || 'default';
            
            // Get settings from options page
            const settingsResult = await browser.storage.local.get(['settings']);
            const settings = settingsResult.settings || {};
            const extractAllPages = settings.defaultExtractAllPages || false;
            const extractFilenames = settings.defaultExtractFilenames || false;
            
            addDebugLog(`Starting extraction for model: ${model}`, 'info');
            addDebugLog(`Extract all pages: ${extractAllPages ? 'Yes' : 'No'} (from settings)`, 'info');
            addDebugLog(`Extract filenames: ${extractFilenames ? 'Yes' : 'No'} (from settings)`, 'info');
            
            // Send message to background script to start extraction
            try {
                const response = await browser.runtime.sendMessage({
                    type: 'EXTRACT_LINKS',
                    model: model,
                    extractAllPages: extractAllPages,
                    extractFilenames: extractFilenames
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
            console.log('RecurTrack Sidebar: Extract links initiated for model:', model, 'extractAllPages:', extractAllPages, 'extractFilenames:', extractFilenames);
            
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
            progressSection.style.display = 'none';
            return;
        }
        
        // Show the section
        extractionResultsSection.style.display = 'block';
        
        // Update basic info
        extractionModel.textContent = extractionData.model || 'Unknown';
        const statusObj = getStatusText(extractionData.status);
        extractionStatusText.textContent = statusObj.text;
        extractionStatusText.className = statusObj.class || '';
        extractionLinkCount.textContent = extractionData.links ? extractionData.links.length : 0;
        
        // Update progress display
        updateProgressDisplay(extractionData);
        
        // Update links display if available
        if (extractionData.links && extractionData.links.length > 0) {
            updateExtractionLinks(extractionData.links);
        }
    }

    // Function to update progress display
    function updateProgressDisplay(extractionData) {
        if (!extractionData || !extractionData.progress) {
            progressSection.style.display = 'none';
            return;
        }
        
        const progress = extractionData.progress;
        
        // Show progress section
        progressSection.style.display = 'block';
        
        // Update percentage
        progressPercentage.textContent = `${progress.percentage}%`;
        progressBarFill.style.width = `${progress.percentage}%`;
        
        // Update step information
        currentStepName.textContent = progress.stepName || 'Processing...';
        stepProgress.textContent = `Step ${progress.currentStep} of ${progress.totalSteps}`;
        
        // Update detailed information
        if (progress.totalPages > 0) {
            currentPageInfo.textContent = `${progress.currentPage} / ${progress.totalPages}`;
        } else {
            currentPageInfo.textContent = progress.currentPage > 0 ? progress.currentPage.toString() : '-';
        }
        
        if (progress.totalFilenames > 0) {
            filenamesProcessedInfo.textContent = `${progress.filenamesProcessed} / ${progress.totalFilenames}`;
        } else {
            filenamesProcessedInfo.textContent = progress.filenamesProcessed > 0 ? progress.filenamesProcessed.toString() : '-';
        }
        
        // Update time remaining
        if (extractionData.estimatedTimeRemaining && extractionData.estimatedTimeRemaining > 0) {
            const minutes = Math.floor(extractionData.estimatedTimeRemaining / 60);
            const seconds = extractionData.estimatedTimeRemaining % 60;
            
            if (minutes > 0) {
                timeRemainingInfo.textContent = `${minutes}m ${seconds}s`;
            } else {
                timeRemainingInfo.textContent = `${seconds}s`;
            }
        } else {
            timeRemainingInfo.textContent = '-';
        }
        
        // Update progress bar color based on completion
        if (progress.percentage >= 100) {
            progressBarFill.style.background = '#28a745'; // Green for completed
        } else if (progress.percentage >= 50) {
            progressBarFill.style.background = '#ffc107'; // Yellow for in progress
        } else {
            progressBarFill.style.background = '#007bff'; // Blue for starting
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

    // Update extraction links display to mark failed/skipped items
    function updateExtractionLinks(links) {
        extractionLinksList.innerHTML = '';
        links.forEach(link => {
            const li = document.createElement('div');
            li.className = 'extraction-link-item';
            li.textContent = link;
            // Mark as warning if link is "Error" or contains error marker
            if (typeof link === 'object' && link.filename === 'Error') {
                li.style.color = '#dc3545';
                li.style.fontWeight = 'bold';
                li.title = 'Extraction failed for this item';
            }
            extractionLinksList.appendChild(li);
        });
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

    // Function to update filename database display
    function updateFilenameDatabaseDisplay(database) {
        console.log('RecurTrack Sidebar: updateFilenameDatabaseDisplay called with:', database);
        
        if (!database || database.length === 0) {
            filenameDatabaseSection.style.display = 'none';
            return;
        }

        // Show the filename database section
        filenameDatabaseSection.style.display = 'block';
        
        // Update database info
        databaseEntryCount.textContent = database.length;
        databaseStatusText.textContent = 'Ready';
        
        // Show database container
        databaseContainer.style.display = 'block';
        updateDatabaseList(database);
        
        console.log('RecurTrack Sidebar: Filename database section should now be visible');
    }

    // Update filename database display to mark failed/skipped items
    function updateFilenameDatabaseDisplay(database) {
        databaseList.innerHTML = '';
        database.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'database-row';
            row.innerHTML = `<span class="database-url">${entry.url}</span> <span class="database-filename">${entry.filename}</span>`;
            if (entry.filename === 'Error') {
                row.querySelector('.database-filename').style.color = '#dc3545';
                row.querySelector('.database-filename').style.fontWeight = 'bold';
                row.title = 'Filename extraction failed for this item';
            }
            databaseList.appendChild(row);
        });
        databaseEntryCount.textContent = database.length;
    }

    // Function to copy database as CSV
    async function copyDatabaseAsCSV() {
        try {
            if (!filenameDatabase || filenameDatabase.length === 0) {
                addDebugLog('No database to copy', 'error');
                return;
            }

            // Get current model name from extraction state or use default
            let modelName = 'Unknown Model';
            try {
                const result = await browser.storage.local.get(['extractionState']);
                if (result.extractionState && result.extractionState.model) {
                    modelName = result.extractionState.model;
                }
            } catch (error) {
                console.error('Error getting model name:', error);
            }

            // Create CSV content with metadata
            const now = new Date().toISOString();
            let csvContent = `Model,${modelName}\n`;
            csvContent += `Extracted,${now}\n`;
            csvContent += `Generated by,RecurTrack Extension\n`;
            csvContent += `,\n`; // Empty row for spacing
            csvContent += 'URL,Filename\n';
            
            const csvRows = filenameDatabase.map(entry => 
                `"${entry.url}","${entry.filename}"`
            ).join('\n');
            csvContent += csvRows;
            
            await navigator.clipboard.writeText(csvContent);
            addDebugLog(`Copied ${filenameDatabase.length} database entries as CSV!`, 'success');
            
        } catch (error) {
            addDebugLog(`Failed to copy database: ${error.message}`, 'error');
        }
    }

    // Function to clear filename database
    async function clearFilenameDatabase() {
        try {
            // Clear the database state from storage
            await browser.storage.local.remove(['filenameDatabase']);
            
            // Clear the current database state
            filenameDatabase = [];
            
            // Hide the database section
            filenameDatabaseSection.style.display = 'none';
            
            addDebugLog('Filename database cleared!', 'success');
            
        } catch (error) {
            addDebugLog(`Failed to clear database: ${error.message}`, 'error');
        }
    }

    // Function to clear all data (extraction results, database, and debug logs)
    async function clearAllData() {
        try {
            addDebugLog('Clearing all data...', 'info');
            
            // Clear extraction state
            await browser.storage.local.remove(['extractionState']);
            currentExtraction = null;
            extractionResultsSection.style.display = 'none';
            
            // Clear filename database
            await browser.storage.local.remove(['filenameDatabase']);
            filenameDatabase = [];
            filenameDatabaseSection.style.display = 'none';
            
            // Clear debug logs (keep one entry)
            debugLogs.innerHTML = '<div class="debug-entry">All data cleared...</div>';
            
            // Clear current detection
            await browser.runtime.sendMessage({
                type: 'CLEAR_DETECTION'
            });
            currentDetection = null;
            updateStatus(null);
            
            addDebugLog('All data cleared successfully!', 'success');
            
        } catch (error) {
            addDebugLog(`Failed to clear all data: ${error.message}`, 'error');
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
    copyDatabaseBtn.addEventListener('click', copyDatabaseAsCSV);
    clearDatabaseBtn.addEventListener('click', clearFilenameDatabase);
    clearAllBtn.addEventListener('click', clearAllData);

    // Listen for messages from background script
    browser.runtime.onMessage.addListener(handleRealtimeUpdate);

    // Listen for storage changes for real-time updates
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            // Update detection history if it changed
            if (changes.detectionHistory) {
                detectionHistory = changes.detectionHistory.newValue || [];
                // Note: History and statistics sections were removed from UI
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
            
            // Update filename database if it changed
            if (changes.filenameDatabase) {
                filenameDatabase = changes.filenameDatabase.newValue || [];
                updateFilenameDatabaseDisplay(filenameDatabase);
                addDebugLog(`Filename database updated: ${filenameDatabase.length} entries`, 'info');
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