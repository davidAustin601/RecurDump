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
        
        // Update current detection
        currentDetection = data;
        
        // Add to history
        detectionHistory.push({
            ...data,
            detectedAt: new Date().toISOString()
        });
        
        // Keep only last 10 detections in memory
        if (detectionHistory.length > 10) {
            detectionHistory = detectionHistory.slice(-10);
        }
        
        // Store in browser storage
        browser.storage.local.set({
            currentDetection: currentDetection,
            detectionHistory: detectionHistory
        }).catch(error => {
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
        currentDetection = null;
        updateBadge(false);
        
        browser.storage.local.set({
            currentDetection: null
        }).catch(error => {
            console.error('RecurTrack Background: Error clearing detection:', error);
        });

        // Notify all components about the cleared detection
        notifyComponents({
            type: 'DETECTION_CLEARED'
        });

        // Check if we need to proceed with any pending extraction
        checkForPendingExtraction();
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
                totalPages: 0
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
            await browser.storage.local.set({ extractionState: extractionState });
            
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
            await browser.storage.local.set({ extractionState: extractionState });
            
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
                    await browser.storage.local.set({ extractionState: extractionState });
                    
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
                        await browser.storage.local.set({ extractionState: extractionState });
                        
                        // Notify components about final completion
                        notifyComponents({
                            type: 'EXTRACTION_COMPLETED',
                            data: extractionState
                        });
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
                    await browser.storage.local.set({ extractionState: extractionState });
                    
                    // Notify components about completion
                    notifyComponents({
                        type: 'EXTRACTION_COMPLETED',
                        data: extractionState
                    });
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
        try {
            const extractedLinks = await browser.tabs.executeScript(tabId, {
                code: `
                    // Extract links that match the pattern
                    console.log('RecurTrack Content: Starting link extraction for model:', '${model}');
                    
                    const targetLinks = [];
                    const allLinks = document.querySelectorAll('a[href]');
                    
                    console.log('RecurTrack Content: Total links found:', allLinks.length);
                    
                    allLinks.forEach((link, index) => {
                        const href = link.href;
                        
                        if (href && href.includes('/' + '${model}' + '/video/')) {
                            console.log('RecurTrack Content: MATCH FOUND:', href);
                            targetLinks.push(href);
                        }
                    });
                    
                    console.log('RecurTrack Content: Total matching links before deduplication:', targetLinks.length);
                    
                    // Remove duplicates using Set
                    const uniqueLinks = [...new Set(targetLinks)];
                    
                    console.log('RecurTrack Content: Total matching links after deduplication:', uniqueLinks.length);
                    
                    // Return the deduplicated links
                    uniqueLinks;
                `
            });
            
            return extractedLinks[0] || [];
            
        } catch (error) {
            console.error('RecurTrack Background: Error extracting links from current page:', error);
            return [];
        }
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

    // Function to process links and extract filenames
    async function processLinksWithFilenames(links, tabId) {
        const processedData = [];
        
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            console.log(`RecurTrack Background: Processing link ${i + 1}/${links.length}:`, link);
            
            // Send progress update
            notifyComponents({
                type: 'FILENAME_EXTRACTION_PROGRESS',
                current: i + 1,
                total: links.length
            });
            
            try {
                // Navigate to the video page
                await browser.tabs.update(tabId, { url: link });
                
                // Wait for page to load
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Check for CloudFlare challenge
                const cloudFlareResult = await checkForCloudFlareChallenge(tabId);
                if (cloudFlareResult.hasChallenge) {
                    console.log('RecurTrack Background: CloudFlare challenge detected, waiting for user completion...');
                    
                    // Wait for user to complete CloudFlare challenge
                    await waitForCloudFlareCompletion(tabId);
                }
                
                // Extract filename
                const filename = await extractFilenameFromPage(tabId);
                console.log('RecurTrack Background: Extracted filename:', filename);
                
                processedData.push({
                    url: link,
                    filename: filename || 'Unknown'
                });
                
            } catch (error) {
                console.error('RecurTrack Background: Error processing link:', link, error);
                processedData.push({
                    url: link,
                    filename: 'Error'
                });
            }
        }
        
        return processedData;
    }

    // Function to check for CloudFlare challenge
    async function checkForCloudFlareChallenge(tabId) {
        try {
            const response = await browser.tabs.sendMessage(tabId, {
                type: 'CHECK_CLOUDFLARE'
            });
            
            return response || { hasChallenge: false };
            
        } catch (error) {
            console.error('RecurTrack Background: Error checking CloudFlare:', error);
            return { hasChallenge: false };
        }
    }

    // Function to wait for CloudFlare completion
    async function waitForCloudFlareCompletion(tabId) {
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                try {
                    const response = await browser.tabs.sendMessage(tabId, {
                        type: 'CHECK_CLOUDFLARE'
                    });
                    
                    if (!response || !response.hasChallenge) {
                        clearInterval(checkInterval);
                        console.log('RecurTrack Background: CloudFlare challenge completed');
                        resolve();
                    }
                } catch (error) {
                    console.error('RecurTrack Background: Error checking CloudFlare status:', error);
                }
            }, 2000); // Check every 2 seconds
            
            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(checkInterval);
                console.log('RecurTrack Background: CloudFlare wait timeout');
                resolve();
            }, 300000);
        });
    }

    // Function to start filename extraction process
    async function startFilenameExtraction(links, tabId) {
        try {
            console.log('RecurTrack Background: Starting filename extraction for', links.length, 'links');
            
            // Notify sidebar that filename extraction is starting
            notifyComponents({
                type: 'FILENAME_EXTRACTION_STARTED'
            });
            
            // Process links and extract filenames
            const database = await processLinksWithFilenames(links, tabId);
            
            // Store the database
            await browser.storage.local.set({ filenameDatabase: database });
            
            // Update extraction state
            const result = await browser.storage.local.get(['extractionState']);
            const extractionState = result.extractionState;
            if (extractionState) {
                extractionState.status = 'completed';
                extractionState.completedAt = new Date().toISOString();
                await browser.storage.local.set({ extractionState: extractionState });
            }
            
            // Notify components about completion
            notifyComponents({
                type: 'FILENAME_EXTRACTION_COMPLETED',
                database: database
            });
            
            console.log('RecurTrack Background: Filename extraction completed with', database.length, 'entries');
            
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

    // Tab update handling (to clear detection when user navigates away)
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && currentDetection) {
            // Check if user navigated away from the page with CloudFlare check
            if (tab.url !== currentDetection.url) {
                console.log('RecurTrack Background: User navigated away, clearing detection');
                clearDetection();
            }
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

})(); 