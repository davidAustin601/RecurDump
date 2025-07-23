/**
 * RecurTrack Background Script
 * Handles CloudFlare detection and extension state management
 */

(function() {
    'use strict';

    // Extension state
    let currentDetection = null;
    let detectionHistory = [];
    let currentMode = 'default';

    // Function to handle CloudFlare check detection
    function handleCloudFlareDetection(data) {
        console.log('RecurTrack Background: CloudFlare check detected', data);
        
        // Validate the detection data
        if (!data || typeof data !== 'object') {
            console.error('RecurTrack Background: Invalid CloudFlare detection data received');
            return;
        }
        
        // Check if this is a duplicate detection for the same URL
        if (currentDetection && currentDetection.url === data.url) {
            console.log('RecurTrack Background: Duplicate CloudFlare detection for same URL, updating...');
        }
        
        // Update current detection
        currentDetection = {
            ...data,
            detectedAt: new Date().toISOString(),
            indicators: data.indicators || {}
        };
        
        // Add to history (avoid duplicates)
        const isDuplicate = detectionHistory.some(detection => 
            detection.url === data.url && 
            Math.abs(new Date(detection.detectedAt) - new Date()) < 60000 // Within 1 minute
        );
        
        if (!isDuplicate) {
            detectionHistory.push({
                ...currentDetection,
                detectedAt: new Date().toISOString()
            });
            
            // Keep only last 20 detections in memory (increased from 10)
            if (detectionHistory.length > 20) {
                detectionHistory = detectionHistory.slice(-20);
            }
        }
        
        // Store in browser storage with error handling
        Promise.all([
            browser.storage.local.set({
                currentDetection: currentDetection,
                detectionHistory: detectionHistory
            }),
            browser.storage.local.set({
                lastCloudFlareDetection: {
                    ...currentDetection,
                    timestamp: Date.now()
                }
            })
        ]).catch(error => {
            console.error('RecurTrack Background: Error saving to storage:', error);
        });
        
        // Update browser action badge to show detection
        updateBadge(true);
        
        // Show notification to user
        showNotification(data);

        // Notify all components about the update
        notifyComponents({
            type: 'DETECTION_UPDATED',
            detection: currentDetection
        });

        notifyComponents({
            type: 'HISTORY_UPDATED',
            history: detectionHistory
        });

        // Check if this detection is related to a pending extraction
        checkForPendingExtraction();
        
        // Log detailed detection information for debugging
        console.log('RecurTrack Background: CloudFlare detection details:', {
            url: data.url,
            title: data.title,
            indicators: data.indicators,
            timestamp: data.timestamp
        });
    }

    // Function to update the browser action badge
    function updateBadge(hasDetection) {
        if (hasDetection) {
            browser.browserAction.setBadgeText({
                text: '!'
            });
            browser.browserAction.setBadgeBackgroundColor({
                color: '#ff0000'
            });
        } else {
            browser.browserAction.setBadgeText({
                text: ''
            });
        }
    }

    // Function to show notification to user
    function showNotification(data) {
        const notificationOptions = {
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'RecurTrack: Human Check Detected',
            message: `CloudFlare human check detected on ${new URL(data.url).hostname}. Please complete the verification manually.`
        };

        browser.notifications.create('cloudflare-detection', notificationOptions).catch(error => {
            console.error('RecurTrack Background: Error creating notification:', error);
        });
    }

    // Function to clear current detection
    function clearDetection() {
        console.log('RecurTrack Background: Clearing CloudFlare detection');
        
        const wasDetectionActive = currentDetection !== null;
        currentDetection = null;
        
        if (wasDetectionActive) {
            updateBadge(false);
            
            // Store cleared state in browser storage
            Promise.all([
                browser.storage.local.set({
                    currentDetection: null
                }),
                browser.storage.local.set({
                    lastCloudFlareCleared: {
                        timestamp: Date.now(),
                        clearedAt: new Date().toISOString()
                    }
                })
            ]).catch(error => {
                console.error('RecurTrack Background: Error clearing detection from storage:', error);
            });
            
            // Notify components about the cleared detection
            notifyComponents({
                type: 'DETECTION_CLEARED'
            });
            
            console.log('RecurTrack Background: CloudFlare detection cleared successfully');
        }
    }

    // Function to get current tab info
    async function getCurrentTab() {
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            return tabs[0];
        } catch (error) {
            console.error('RecurTrack Background: Error getting current tab:', error);
            return null;
        }
    }

    // Function to notify all components about updates
    function notifyComponents(message) {
        // Send to all tabs (for popup and sidebar)
        browser.tabs.query({}).then(tabs => {
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, message).catch(() => {
                    // Ignore errors for tabs that don't have content scripts
                });
            });
        }).catch(error => {
            console.error('RecurTrack Background: Error notifying tabs:', error);
        });
    }

    // Function to handle link extraction process
    async function handleExtractLinks(model, extractAllPages = false, extractFilenames = false) {
        try {
            console.log('RecurTrack Background: handleExtractLinks called with model:', model, 'extractAllPages:', extractAllPages, 'extractFilenames:', extractFilenames);
            
            if (!model || model.trim() === '') {
                throw new Error('Model name is required');
            }
            
            // Step 1: Construct URL and open new tab
            const modelUrl = `https://www.recu.me/performer/${model}`;
            console.log('RecurTrack Background: Opening URL:', modelUrl);
            
            // Open new tab with the model URL
            const newTab = await browser.tabs.create({
                url: modelUrl,
                active: false // Open in background
            });
            
            console.log('RecurTrack Background: Tab created successfully:', newTab.id, newTab.url);
            
            // Store extraction state
            const extractionState = {
                model: model,
                tabId: newTab.id,
                url: modelUrl,
                step: 1,
                status: 'waiting_for_page_load',
                extractAllPages: extractAllPages,
                extractFilenames: extractFilenames,
                allLinks: [], // Store all links from all pages
                currentPage: 1,
                totalPages: 0,
                // Progress tracking fields
                progress: {
                    currentStep: 1,
                    totalSteps: extractFilenames ? 3 : 2, // 2 for links only, 3 for links + filenames
                    stepName: 'Opening page',
                    currentPage: 1,
                    totalPages: 0,
                    linksFound: 0,
                    filenamesProcessed: 0,
                    totalFilenames: 0,
                    percentage: 0
                },
                startedAt: new Date().toISOString(),
                estimatedTimeRemaining: null
            };
            
            // Store in browser storage
            await browser.storage.local.set({ extractionState: extractionState });
            console.log('RecurTrack Background: Extraction state stored');
            
            // Notify components about extraction start
            notifyComponents({
                type: 'EXTRACTION_STARTED',
                data: extractionState
            });
            console.log('RecurTrack Background: Components notified about extraction start');
            
            // Monitor the tab for page load completion
            console.log('RecurTrack Background: Starting to monitor tab:', newTab.id);
            monitorTabForExtraction(newTab.id);
            
        } catch (error) {
            console.error('RecurTrack Background: Error starting extraction:', error);
            notifyComponents({
                type: 'EXTRACTION_ERROR',
                error: error.message
            });
        }
    }

    // Function to monitor tab for extraction process
    function monitorTabForExtraction(tabId) {
        console.log('RecurTrack Background: Setting up tab monitor for tab:', tabId);
        
        // Listen for tab updates
        const tabUpdateListener = (updatedTabId, changeInfo, tab) => {
            console.log('RecurTrack Background: Tab update detected:', updatedTabId, changeInfo.status, 'for tab:', tabId);
            
            if (updatedTabId === tabId) {
                console.log('RecurTrack Background: This is our target tab, status:', changeInfo.status);
                
                if (changeInfo.status === 'complete') {
                    console.log('RecurTrack Background: Tab loaded completely, checking for CloudFlare...');
                    
                    // Remove the listener since we only need it once
                    browser.tabs.onUpdated.removeListener(tabUpdateListener);
                    
                    // Wait a bit for any dynamic content to load
                    setTimeout(() => {
                        console.log('RecurTrack Background: Timeout finished, proceeding to check CloudFlare...');
                        checkForCloudFlareAndProceed(tabId);
                    }, 3000);
                } else if (changeInfo.status === 'loading') {
                    console.log('RecurTrack Background: Tab is loading...');
                }
            }
        };
        
        browser.tabs.onUpdated.addListener(tabUpdateListener);
        console.log('RecurTrack Background: Tab update listener added for tab:', tabId);
    }

    // Function to check for CloudFlare and proceed with extraction
    async function checkForCloudFlareAndProceed(tabId) {
        try {
            console.log('RecurTrack Background: checkForCloudFlareAndProceed called for tab:', tabId);
            
            // Get current extraction state
            const result = await browser.storage.local.get(['extractionState']);
            const extractionState = result.extractionState;
            
            console.log('RecurTrack Background: Current extraction state:', extractionState);
            
            if (!extractionState || extractionState.tabId !== tabId) {
                console.log('RecurTrack Background: No extraction state found for tab:', tabId);
                return;
            }
            
            console.log('RecurTrack Background: Current CloudFlare detection:', currentDetection);
            
            // Check if there's a current CloudFlare detection
            if (currentDetection && currentDetection.url === extractionState.url) {
                console.log('RecurTrack Background: CloudFlare check detected, waiting for user completion...');
                
                // Update extraction state
                extractionState.step = 1;
                extractionState.status = 'waiting_for_cloudflare_completion';
                await browser.storage.local.set({ extractionState: extractionState });
                
                // Notify components
                notifyComponents({
                    type: 'EXTRACTION_WAITING_FOR_CLOUDFLARE',
                    data: extractionState
                });
                
            } else {
                // No CloudFlare check, proceed directly to Step 2
                console.log('RecurTrack Background: No CloudFlare check detected, proceeding to Step 2...');
                proceedToStep2(tabId);
            }
            
        } catch (error) {
            console.error('RecurTrack Background: Error checking CloudFlare:', error);
        }
    }

    // Function to check for pending extraction when CloudFlare is cleared
    async function checkForPendingExtraction() {
        try {
            const result = await browser.storage.local.get(['extractionState']);
            const extractionState = result.extractionState;
            
            if (extractionState && extractionState.status === 'waiting_for_cloudflare_completion') {
                console.log('RecurTrack Background: CloudFlare cleared, proceeding with pending extraction...');
                proceedToStep2(extractionState.tabId);
            }
        } catch (error) {
            console.error('RecurTrack Background: Error checking pending extraction:', error);
        }
    }

    // Function to proceed to Step 2 (link extraction)
    async function proceedToStep2(tabId) {
        try {
            console.log('RecurTrack Background: Starting Step 2 - Extracting links...');
            
            // Update extraction state
            const result = await browser.storage.local.get(['extractionState']);
            const extractionState = result.extractionState;
            
            if (!extractionState || extractionState.tabId !== tabId) {
                return;
            }
            
            extractionState.step = 2;
            extractionState.status = 'extracting_links';
            
            // Update progress to Step 2
            await updateExtractionProgress(extractionState, {
                progress: {
                    currentStep: 2,
                    stepName: 'Extracting links from pages',
                    currentPage: 1
                }
            });
            
            // Notify components
            notifyComponents({
                type: 'EXTRACTION_STEP_2_STARTED',
                data: extractionState
            });
            
            // Wait a bit more for dynamic content to fully load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Use the new multi-page extraction logic
            await handleMultiPageExtraction(tabId, extractionState);
            
        } catch (error) {
            console.error('RecurTrack Background: Error in Step 2:', error);
            notifyComponents({
                type: 'EXTRACTION_ERROR',
                error: error.message
            });
        }
    }

    // Function to handle multi-page extraction
    async function handleMultiPageExtraction(tabId, extractionState) {
        try {
            console.log('RecurTrack Background: Starting multi-page extraction for model:', extractionState.model);
            
            // First, extract links from current page
            const currentPageLinks = await extractLinksFromCurrentPage(tabId, extractionState.model);
            console.log('RecurTrack Background: Found', currentPageLinks.length, 'links on current page');
            
            // Add current page links to all links
            extractionState.allLinks.push(...currentPageLinks);
            
            // Update extraction state
            extractionState.links = extractionState.allLinks;
            extractionState.status = `extracting_page_${extractionState.currentPage}`;
            
            // Update progress with current page completion
            await updateExtractionProgress(extractionState, {
                progress: {
                    currentPage: extractionState.currentPage,
                    linksFound: extractionState.allLinks.length,
                    totalFilenames: extractionState.allLinks.length
                }
            });
            
            // Notify components about current page completion
            notifyComponents({
                type: 'EXTRACTION_PAGE_COMPLETED',
                data: extractionState
            });
            
            // Check if we should continue to next page
            if (extractionState.extractAllPages) {
                const nextPageUrl = await checkForNextPage(tabId, extractionState.model);
                
                if (nextPageUrl) {
                    console.log('RecurTrack Background: Found next page, navigating to:', nextPageUrl);
                    
                    // Navigate to next page
                    await browser.tabs.update(tabId, { url: nextPageUrl });
                    
                    // Update extraction state
                    extractionState.currentPage++;
                    extractionState.url = nextPageUrl;
                    extractionState.status = 'waiting_for_page_load';
                    
                    // Update progress for next page
                    await updateExtractionProgress(extractionState, {
                        progress: {
                            currentPage: extractionState.currentPage,
                            stepName: `Extracting links from page ${extractionState.currentPage}`
                        }
                    });
                    
                    // Monitor the tab for the new page load
                    monitorTabForExtraction(tabId);
                    
                } else {
                    console.log('RecurTrack Background: No more pages found, completing extraction');
                    
                    // Complete the extraction, check if we need to extract filenames
                    if (extractionState.extractFilenames) {
                        console.log('RecurTrack Background: Starting filename extraction for all pages...');
                        await startFilenameExtraction(extractionState.allLinks, extractionState.tabId);
                    } else {
                        // Complete without filename extraction
                        extractionState.status = 'completed';
                        extractionState.completedAt = new Date().toISOString();
                        
                        // Update progress to completion
                        await updateExtractionProgress(extractionState, {
                            progress: {
                                currentStep: 2,
                                stepName: 'Extraction completed',
                                percentage: 100
                            }
                        });
                        
                        // Notify components about final completion
                        notifyComponents({
                            type: 'EXTRACTION_COMPLETED',
                            data: extractionState
                        });
                        
                        // Check if auto-clear is enabled and clear data if needed
                        await checkAndAutoClear();
                    }
                }
            } else {
                // Single page extraction, check if we need to extract filenames
                if (extractionState.extractFilenames) {
                    console.log('RecurTrack Background: Starting filename extraction for single page...');
                    await startFilenameExtraction(extractionState.allLinks, extractionState.tabId);
                } else {
                    // Complete without filename extraction
                    extractionState.status = 'completed';
                    extractionState.completedAt = new Date().toISOString();
                    
                    // Update progress to completion
                    await updateExtractionProgress(extractionState, {
                        progress: {
                            currentStep: 2,
                            stepName: 'Extraction completed',
                            percentage: 100
                        }
                    });
                    
                    // Notify components about completion
                    notifyComponents({
                        type: 'EXTRACTION_COMPLETED',
                        data: extractionState
                    });
                    
                    // Check if auto-clear is enabled and clear data if needed
                    await checkAndAutoClear();
                }
            }
            
        } catch (error) {
            console.error('RecurTrack Background: Error in multi-page extraction:', error);
            notifyComponents({
                type: 'EXTRACTION_ERROR',
                error: error.message
            });
        }
    }

    // Function to extract links from current page
    async function extractLinksFromCurrentPage(tabId, model) {
        // Retry link extraction up to 3 times
        return await retryAsync(async (attempt) => {
            try {
                const extractedLinks = await browser.tabs.executeScript(tabId, {
                    code: `
                        // Extract links that match the pattern
                        console.log('RecurTrack Content: Starting link extraction for model:', '${model}');
                        const targetLinks = [];
                        const allLinks = document.querySelectorAll('a[href]');
                        allLinks.forEach(link => {
                            const href = link.href;
                            if (href && href.includes('/' + '${model}' + '/video/')) {
                                targetLinks.push(href);
                            }
                        });
                        targetLinks;
                    `
                });
                if (!extractedLinks || !Array.isArray(extractedLinks[0])) throw new Error('Link extraction failed');
                return extractedLinks[0];
            } catch (err) {
                if (attempt >= 3) throw err;
                throw err;
            }
        }, 3, 2000);
    }

    // Function to extract filename from a video page
    async function extractFilenameFromPage(tabId) {
        try {
            const response = await browser.tabs.sendMessage(tabId, {
                type: 'EXTRACT_FILENAME'
            });
            
            return response ? response.filename : null;
            
        } catch (error) {
            console.error('RecurTrack Background: Error extracting filename:', error);
            return null;
        }
    }

    // Helper: retry async function with delay and max attempts
    async function retryAsync(fn, maxAttempts = 3, delayMs = 1500) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn(attempt);
            } catch (err) {
                lastError = err;
                if (attempt < maxAttempts) {
                    await new Promise(res => setTimeout(res, delayMs));
                }
            }
        }
        throw lastError;
    }

    async function processLinksWithFilenames(links, tabId) {
        const processedData = [];
        // Get current extraction state for progress tracking
        const result = await browser.storage.local.get(['extractionState']);
        const extractionState = result.extractionState;
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            console.log(`RecurTrack Background: Processing link ${i + 1}/${links.length}:`, link);
            // Update progress for filename extraction
            if (extractionState) {
                await updateExtractionProgress(extractionState, {
                    progress: {
                        filenamesProcessed: i + 1,
                        stepName: `Extracting filename ${i + 1}/${links.length}`
                    }
                });
            }
            let filename = 'Unknown';
            let errorOccurred = false;
            try {
                // Retry navigation and extraction up to 3 times
                await retryAsync(async (attempt) => {
                    await browser.tabs.update(tabId, { url: link });
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    try {
                        const cloudFlareResult = await checkForCloudFlareChallenge(tabId);
                        if (cloudFlareResult.hasChallenge) {
                            if (extractionState) {
                                await updateExtractionProgress(extractionState, {
                                    progress: {
                                        stepName: `Waiting for CloudFlare completion (${i + 1}/${links.length})`
                                    }
                                });
                            }
                            await waitForCloudFlareCompletion(tabId);
                        }
                    } catch (cfError) {
                        // CloudFlare timeout or error
                        notifyComponents({
                            type: 'EXTRACTION_ERROR',
                            error: cfError.message || 'CloudFlare challenge wait timed out.'
                        });
                        throw cfError;
                    }
                    filename = await extractFilenameFromPage(tabId);
                    if (!filename) throw new Error('Filename extraction failed');
                }, 3, 2000);
                console.log('RecurTrack Background: Extracted filename:', filename);
                processedData.push({ url: link, filename });
            } catch (error) {
                errorOccurred = true;
                console.error('RecurTrack Background: Error processing link:', link, error);
                processedData.push({ url: link, filename: 'Error' });
            }
        }
        return processedData;
    }

    // Function to check for CloudFlare challenge
    async function checkForCloudFlareChallenge(tabId) {
        try {
            console.log('RecurTrack Background: Checking for CloudFlare challenge in tab:', tabId);
            
            // First check if we have a current detection for this tab
            if (currentDetection) {
                const tab = await browser.tabs.get(tabId);
                if (tab.url === currentDetection.url) {
                    console.log('RecurTrack Background: Current CloudFlare detection matches tab URL');
                    return { hasChallenge: true, detection: currentDetection };
                }
            }
            
            // Send message to content script to check for CloudFlare
            const response = await browser.tabs.sendMessage(tabId, {
                type: 'CHECK_CLOUDFLARE'
            });
            
            if (response && response.hasChallenge) {
                console.log('RecurTrack Background: CloudFlare challenge confirmed by content script');
                return { hasChallenge: true, detection: response };
            }
            
            return { hasChallenge: false };
            
        } catch (error) {
            console.error('RecurTrack Background: Error checking CloudFlare:', error);
            
            // If we can't communicate with the content script, check if we have a stored detection
            if (currentDetection) {
                console.log('RecurTrack Background: Using stored CloudFlare detection as fallback');
                return { hasChallenge: true, detection: currentDetection };
            }
            
            return { hasChallenge: false };
        }
    }

    // Function to wait for CloudFlare completion with improved logic
    async function waitForCloudFlareCompletion(tabId) {
        return new Promise((resolve, reject) => {
            let checkCount = 0;
            const maxChecks = 150; // 5 minutes at 2-second intervals
            const checkInterval = 2000; // 2 seconds
            let timedOut = false;
            
            console.log('RecurTrack Background: Starting CloudFlare completion monitoring for tab:', tabId);
            
            const checkIntervalId = setInterval(async () => {
                checkCount++;
                try {
                    const tab = await browser.tabs.get(tabId);
                    if (!tab || !tab.url) {
                        clearInterval(checkIntervalId);
                        resolve();
                        return;
                    }
                    if (currentDetection && tab.url !== currentDetection.url) {
                        clearInterval(checkIntervalId);
                        clearDetection();
                        resolve();
                        return;
                    }
                    const response = await browser.tabs.sendMessage(tabId, {
                        type: 'CHECK_CLOUDFLARE'
                    });
                    if (!response || !response.hasChallenge) {
                        clearInterval(checkIntervalId);
                        clearDetection();
                        resolve();
                        return;
                    }
                } catch (error) {
                    if (!currentDetection) {
                        clearInterval(checkIntervalId);
                        resolve();
                        return;
                    }
                }
                if (checkCount >= maxChecks) {
                    timedOut = true;
                    clearInterval(checkIntervalId);
                    clearDetection();
                    reject(new Error('CloudFlare challenge wait timed out. Please complete the challenge manually and try again.'));
                }
            }, checkInterval);
            setTimeout(() => {
                if (!timedOut) {
                    clearInterval(checkIntervalId);
                    clearDetection();
                    reject(new Error('CloudFlare challenge wait timed out. Please complete the challenge manually and try again.'));
                }
            }, 300000); // 5 minutes
        });
    }

    // Function to start filename extraction process
    async function startFilenameExtraction(links, tabId) {
        try {
            console.log('RecurTrack Background: Starting filename extraction for', links.length, 'links');
            
            // Get current extraction state
            const result = await browser.storage.local.get(['extractionState']);
            const extractionState = result.extractionState;
            
            if (extractionState) {
                // Update progress to Step 3
                await updateExtractionProgress(extractionState, {
                    progress: {
                        currentStep: 3,
                        stepName: 'Extracting filenames from video pages',
                        totalFilenames: links.length,
                        filenamesProcessed: 0
                    }
                });
            }
            
            // Notify sidebar that filename extraction is starting
            notifyComponents({
                type: 'FILENAME_EXTRACTION_STARTED'
            });
            
            // Process links and extract filenames
            const database = await processLinksWithFilenames(links, tabId);
            
            // Store the database
            await browser.storage.local.set({ filenameDatabase: database });
            
            // Update extraction state
            if (extractionState) {
                extractionState.status = 'completed';
                extractionState.completedAt = new Date().toISOString();
                
                // Update progress to completion
                await updateExtractionProgress(extractionState, {
                    progress: {
                        currentStep: 3,
                        stepName: 'Filename extraction completed',
                        filenamesProcessed: database.length,
                        percentage: 100
                    }
                });
                
                // Auto-save database if enabled
                await autoSaveDatabase(extractionState.model, database);
            }
            
            // Notify components about completion
            notifyComponents({
                type: 'FILENAME_EXTRACTION_COMPLETED',
                database: database
            });
            
            console.log('RecurTrack Background: Filename extraction completed with', database.length, 'entries');
            
            // Check if auto-clear is enabled and clear data if needed
            await checkAndAutoClear();
            
        } catch (error) {
            console.error('RecurTrack Background: Error in filename extraction:', error);
            notifyComponents({
                type: 'EXTRACTION_ERROR',
                error: error.message
            });
        }
    }

    // Function to check for next page and return URL
    async function checkForNextPage(tabId, model) {
        try {
            // Use message passing to content script instead of executeScript
            const response = await browser.tabs.sendMessage(tabId, {
                type: 'CHECK_NEXT_PAGE',
                model: model
            });
            
            if (response && response.nextPageUrl) {
                console.log('RecurTrack Background: Next page URL:', response.nextPageUrl);
                return response.nextPageUrl;
            } else {
                console.log('RecurTrack Background: No next page available');
                return null;
            }
            
        } catch (error) {
            console.error('RecurTrack Background: Error checking for next page:', error);
            return null;
        }
    }

    // Function to auto-save database to file
    async function autoSaveDatabase(model, filenameDatabase) {
        try {
            console.log('RecurTrack Background: Auto-saving database for model:', model);
            console.log('RecurTrack Background: Database structure:', typeof filenameDatabase, Array.isArray(filenameDatabase) ? 'Array' : 'Object');
            console.log('RecurTrack Background: Database content:', filenameDatabase);
            
            // Get settings
            const result = await browser.storage.local.get(['settings']);
            const settings = result.settings || {};
            console.log('RecurTrack Background: Settings:', settings);
            
            if (!settings.autoSaveDatabase) {
                console.log('RecurTrack Background: Auto-save database is disabled');
                return;
            }
            
            // Generate filename using the format from settings
            const filename = generateDatabaseFilename(model, settings.filenameFormat);
            console.log('RecurTrack Background: Generated filename:', filename);
            
            // Convert filename database to CSV
            const csvContent = convertFilenameDatabaseToCSV(filenameDatabase, settings, model);
            console.log('RecurTrack Background: CSV content generated, length:', csvContent.length);
            console.log('RecurTrack Background: CSV preview:', csvContent.substring(0, 200) + '...');
            
            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            
            // Use browser.downloads API to save the file
            const downloadId = await browser.downloads.download({
                url: url,
                filename: filename,
                saveAs: settings.askWhereToSave // Ask user where to save if enabled
            });
            
            // Clean up the URL
            URL.revokeObjectURL(url);
            
            console.log('RecurTrack Background: Database auto-saved successfully:', filename, 'Download ID:', downloadId);
            
            // Notify components about auto-save
            notifyComponents({
                type: 'DATABASE_AUTO_SAVED',
                filename: filename,
                model: model
            });
            
        } catch (error) {
            console.error('RecurTrack Background: Error auto-saving database:', error);
            
            // Notify components about auto-save error
            notifyComponents({
                type: 'DATABASE_AUTO_SAVE_ERROR',
                error: error.message
            });
        }
    }

    // Function to generate database filename
    function generateDatabaseFilename(model, format) {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const year = now.getFullYear();
        const date = `${month}-${day}-${year}`;
        const time = now.toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '-');
        const timestamp = now.getTime();
        
        // Always append timestamp to ensure uniqueness
        let filename = format
            .replace(/\[Model Name\]/g, model || 'unknown_model')
            .replace(/\[MONTH\]/g, month)
            .replace(/\[DAY\]/g, day)
            .replace(/\[YEAR\]/g, year)
            .replace(/\[DATE\]/g, date)
            .replace(/\[TIME\]/g, time)
            .replace(/\[TIMESTAMP\]/g, timestamp);
        
        // If the format does not already include the timestamp, append it
        if (!/\[TIMESTAMP\]/.test(format)) {
            filename = filename.replace(/\.csv$/i, '') + `_${timestamp}.csv`;
        }
        
        // Ensure it ends with .csv
        if (!filename.toLowerCase().endsWith('.csv')) {
            filename += '.csv';
        }
        
        return filename;
    }

    // Function to convert filename database to CSV
    function convertFilenameDatabaseToCSV(filenameDatabase, settings, model) {
        const separator = settings.csvSeparator || ',';
        const includeHeaders = settings.csvIncludeHeaders !== false;
        // Ignore includeMetadata, always exclude metadata rows
        let csv = '';
        // Add headers if enabled
        if (includeHeaders) {
            csv += `URL${separator}Filename${separator}Extracted At\n`;
        }
        // Handle both array format (from sidebar) and object format (from background)
        if (Array.isArray(filenameDatabase)) {
            // Array format: [{url: "...", filename: "...", extractedAt: "..."}, ...]
            for (const entry of filenameDatabase) {
                const escapedUrl = `"${entry.url.replace(/"/g, '""')}"`;
                const escapedFilename = entry.filename ? `"${entry.filename.replace(/"/g, '""')}"` : '';
                const extractedAt = entry.extractedAt || new Date().toISOString();
                csv += `${escapedUrl}${separator}${escapedFilename}${separator}${extractedAt}\n`;
            }
        } else {
            // Object format: {url: {filename: "...", extractedAt: "..."}, ...}
            for (const [url, data] of Object.entries(filenameDatabase)) {
                const escapedUrl = `"${url.replace(/"/g, '""')}"`;
                const escapedFilename = data.filename ? `"${data.filename.replace(/"/g, '""')}"` : '';
                const extractedAt = data.extractedAt || new Date().toISOString();
                csv += `${escapedUrl}${separator}${escapedFilename}${separator}${extractedAt}\n`;
            }
        }
        return csv;
    }

    // Function to clear sidebar data (extraction results, database, debug logs)
    async function clearSidebarData() {
        try {
            console.log('RecurTrack Background: Clearing sidebar data');
            
            // Clear extraction state
            await browser.storage.local.remove(['extractionState']);
            
            // Clear filename database
            await browser.storage.local.remove(['filenameDatabase']);
            
            // Clear debug logs
            await browser.storage.local.remove(['debugLogs']);
            
            // Notify components to clear their displays
            notifyComponents({
                type: 'CLEAR_SIDEBAR_DATA'
            });
            
            console.log('RecurTrack Background: Sidebar data cleared successfully');
            
        } catch (error) {
            console.error('RecurTrack Background: Error clearing sidebar data:', error);
        }
    }

    // Function to check if auto-clear is enabled and clear data if needed
    async function checkAndAutoClear() {
        try {
            const result = await browser.storage.local.get(['settings']);
            const settings = result.settings || {};
            
            if (settings.autoClearAfterExtraction) {
                console.log('RecurTrack Background: Auto-clear enabled, clearing sidebar data');
                
                // Wait a bit to let the user see the completion message
                setTimeout(async () => {
                    await clearSidebarData();
                }, 3000); // Wait 3 seconds before clearing
            } else {
                console.log('RecurTrack Background: Auto-clear disabled, keeping sidebar data');
            }
        } catch (error) {
            console.error('RecurTrack Background: Error checking auto-clear setting:', error);
        }
    }

    // Function to update extraction progress and notify components
    async function updateExtractionProgress(extractionState, updates) {
        try {
            // Update the progress object with new values
            if (updates.progress) {
                extractionState.progress = { ...extractionState.progress, ...updates.progress };
            }
            
            // Calculate overall percentage
            let percentage = 0;
            const progress = extractionState.progress;
            
            if (progress.totalSteps === 2) {
                // Links only extraction
                if (progress.currentStep === 1) {
                    percentage = Math.min(50, (progress.currentPage / Math.max(progress.totalPages, 1)) * 50);
                } else if (progress.currentStep === 2) {
                    percentage = 50 + (progress.linksFound / Math.max(progress.totalFilenames, 1)) * 50;
                }
            } else if (progress.totalSteps === 3) {
                // Links + filenames extraction
                if (progress.currentStep === 1) {
                    percentage = Math.min(33, (progress.currentPage / Math.max(progress.totalPages, 1)) * 33);
                } else if (progress.currentStep === 2) {
                    percentage = 33 + (progress.linksFound / Math.max(progress.totalFilenames, 1)) * 33;
                } else if (progress.currentStep === 3) {
                    percentage = 66 + (progress.filenamesProcessed / Math.max(progress.totalFilenames, 1)) * 34;
                }
            }
            
            progress.percentage = Math.round(percentage);
            
            // Calculate estimated time remaining
            if (extractionState.startedAt) {
                const elapsed = Date.now() - new Date(extractionState.startedAt).getTime();
                if (progress.percentage > 0) {
                    const totalEstimated = (elapsed / progress.percentage) * 100;
                    const remaining = totalEstimated - elapsed;
                    extractionState.estimatedTimeRemaining = Math.max(0, Math.round(remaining / 1000)); // in seconds
                }
            }
            
            // Update extraction state in storage
            await browser.storage.local.set({ extractionState: extractionState });
            
            // Send progress update to components
            notifyComponents({
                type: 'EXTRACTION_PROGRESS_UPDATE',
                data: extractionState
            });
            
            console.log('RecurTrack Background: Progress updated:', {
                step: progress.currentStep,
                stepName: progress.stepName,
                percentage: progress.percentage,
                currentPage: progress.currentPage,
                totalPages: progress.totalPages,
                linksFound: progress.linksFound,
                filenamesProcessed: progress.filenamesProcessed,
                totalFilenames: progress.totalFilenames,
                estimatedTimeRemaining: extractionState.estimatedTimeRemaining
            });
            
        } catch (error) {
            console.error('RecurTrack Background: Error updating progress:', error);
        }
    }

    // Message handling
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('RecurTrack Background: Received message', message);
        
        // Add debug logging to sidebar
        if (message.type === 'EXTRACT_LINKS') {
            console.log('RecurTrack Background: EXTRACT_LINKS message received, calling handleExtractLinks...');
        }
        
        switch (message.type) {
            case 'CLOUDFLARE_CHECK_DETECTED':
                handleCloudFlareDetection(message.data);
                sendResponse({ success: true });
                break;
                
            case 'GET_CURRENT_DETECTION':
                sendResponse({ detection: currentDetection });
                break;
                
            case 'GET_DETECTION_HISTORY':
                sendResponse({ history: detectionHistory });
                break;
                
            case 'CLEAR_DETECTION':
                clearDetection();
                sendResponse({ success: true });
                break;
                
            case 'UPDATE_MODE':
                currentMode = message.mode;
                // Store mode in browser storage
                browser.storage.local.set({ currentMode: currentMode }).catch(error => {
                    console.error('RecurTrack Background: Error saving mode:', error);
                });
                sendResponse({ success: true });
                break;
                
            case 'GET_MODE':
                sendResponse({ mode: currentMode });
                break;
                
            case 'TEST_MESSAGE':
                console.log('RecurTrack Background: Test message received');
                sendResponse({ success: true, message: 'Background script is working!' });
                break;
                
            case 'EXTRACT_LINKS':
                console.log('RecurTrack Background: Extract links requested for model:', message.model, 'extractAllPages:', message.extractAllPages, 'extractFilenames:', message.extractFilenames);
                
                try {
                    // Notify sidebar about the received message
                    console.log('RecurTrack Background: About to notify components...');
                    notifyComponents({
                        type: 'EXTRACTION_MESSAGE_RECEIVED',
                        model: message.model,
                        extractAllPages: message.extractAllPages,
                        extractFilenames: message.extractFilenames
                    });
                    console.log('RecurTrack Background: Components notified');
                    
                    // Send a simple test message to sidebar
                    notifyComponents({
                        type: 'EXTRACTION_STARTED',
                        data: { 
                            model: message.model, 
                            step: 1, 
                            status: 'starting',
                            extractAllPages: message.extractAllPages,
                            extractFilenames: message.extractFilenames
                        }
                    });
                    
                    // Call the extraction function
                    handleExtractLinks(message.model, message.extractAllPages, message.extractFilenames);
                    
                    sendResponse({ success: true, message: 'Starting link extraction...' });
                    
                } catch (error) {
                    console.error('RecurTrack Background: Error in EXTRACT_LINKS handler:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            default:
                console.warn('RecurTrack Background: Unknown message type:', message.type);
                sendResponse({ error: 'Unknown message type' });
        }
        
        return true; // Keep message channel open for async response
    });

    // Function to periodically check for CloudFlare challenges
    function startPeriodicCloudFlareCheck() {
        // Check every 30 seconds for CloudFlare challenges on active tabs
        setInterval(async () => {
            try {
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                
                for (const tab of tabs) {
                    if (tab.url && tab.url.startsWith('http')) {
                        try {
                            const response = await browser.tabs.sendMessage(tab.id, {
                                type: 'CHECK_CLOUDFLARE'
                            });
                            
                            if (response && response.hasChallenge && !currentDetection) {
                                console.log('RecurTrack Background: Periodic check found CloudFlare challenge on tab:', tab.id);
                                handleCloudFlareDetection(response);
                            }
                        } catch (error) {
                            // Content script not available, ignore
                        }
                    }
                }
            } catch (error) {
                console.error('RecurTrack Background: Error in periodic CloudFlare check:', error);
            }
        }, 30000); // Check every 30 seconds
    }

    // Tab update handling (to clear detection when user navigates away)
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && currentDetection) {
            // Check if user navigated away from the page with CloudFlare check
            if (tab.url !== currentDetection.url) {
                console.log('RecurTrack Background: User navigated away, clearing detection');
                clearDetection();
            } else {
                // Same URL, but page completed loading - re-check for CloudFlare
                setTimeout(async () => {
                    try {
                        const response = await browser.tabs.sendMessage(tabId, {
                            type: 'CHECK_CLOUDFLARE'
                        });
                        
                        if (response && response.hasChallenge && !currentDetection) {
                            console.log('RecurTrack Background: Re-check found CloudFlare challenge after page load');
                            handleCloudFlareDetection(response);
                        }
                    } catch (error) {
                        // Content script not available, ignore
                    }
                }, 2000);
            }
        }
    });

    // Tab removal handling
    browser.tabs.onRemoved.addListener((tabId) => {
        if (currentDetection) {
            // Check if the removed tab was the one with the CloudFlare challenge
            console.log('RecurTrack Background: Tab removed, checking if CloudFlare detection should be cleared');
            // We'll let the periodic check handle this since we can't get tab info after removal
        }
    });

    // Extension startup
    browser.runtime.onStartup.addListener(() => {
        console.log('RecurTrack Background: Extension started');
        
        // Load saved state from storage
        browser.storage.local.get(['currentDetection', 'detectionHistory', 'currentMode']).then((result) => {
            if (result.currentDetection) {
                currentDetection = result.currentDetection;
                updateBadge(true);
            }
            
            if (result.detectionHistory) {
                detectionHistory = result.detectionHistory;
            }
            
            if (result.currentMode) {
                currentMode = result.currentMode;
            }
        }).catch(error => {
            console.error('RecurTrack Background: Error loading saved state:', error);
        });
        
        // Start periodic CloudFlare checking
        startPeriodicCloudFlareCheck();
    });

    // Extension installation
    browser.runtime.onInstalled.addListener((details) => {
        console.log('RecurTrack Background: Extension installed/updated', details);
        
        // Initialize storage
        browser.storage.local.set({
            currentDetection: null,
            detectionHistory: [],
            currentMode: 'default'
        }).catch(error => {
            console.error('RecurTrack Background: Error initializing storage:', error);
        });
        
        // Create context menu
        browser.contextMenus.create({
            id: 'recurtrack-options',
            title: 'RecurTrack Options',
            contexts: ['browser_action']
        });
        
        browser.contextMenus.create({
            id: 'recurtrack-separator',
            type: 'separator',
            contexts: ['browser_action']
        });
        
        browser.contextMenus.create({
            id: 'recurtrack-open-sidebar',
            title: 'Open Sidebar Panel',
            contexts: ['browser_action']
        });
        
        // Start periodic CloudFlare checking
        startPeriodicCloudFlareCheck();
    });

    // Handle context menu clicks
    browser.contextMenus.onClicked.addListener((info, tab) => {
        switch (info.menuItemId) {
            case 'recurtrack-options':
                browser.runtime.openOptionsPage();
                break;
            case 'recurtrack-open-sidebar':
                browser.sidebarAction.open();
                break;
        }
    });

    console.log('RecurTrack Background: Script loaded');
    
    // Start periodic CloudFlare checking immediately
    startPeriodicCloudFlareCheck();

})(); 