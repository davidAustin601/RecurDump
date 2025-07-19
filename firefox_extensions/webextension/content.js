/**
 * RecurTrack Content Script
 * Detects CloudFlare human checks and other website challenges
 */

(function() {
    'use strict';

    // Function to detect CloudFlare human check
    function detectCloudFlareCheck() {
        // Common CloudFlare challenge indicators
        const cloudflareIndicators = [
            // Page title indicators
            'Just a moment...',
            'Checking your browser',
            'Please wait while we verify',
            'Cloudflare',
            
            // Common CloudFlare challenge page elements
            '#cf-wrapper',
            '.cf-browser-verification',
            '#challenge-form',
            '.cf-error-code',
            
            // CloudFlare specific text content
            'DDoS protection by Cloudflare',
            'Please complete the security check',
            'Please wait while we verify that you are a human'
        ];

        // Check page title
        const pageTitle = document.title.toLowerCase();
        const hasCloudFlareTitle = cloudflareIndicators.some(indicator => 
            pageTitle.includes(indicator.toLowerCase())
        );

        // Check for CloudFlare specific elements
        const hasCloudFlareElements = document.querySelector('#cf-wrapper') !== null ||
                                     document.querySelector('.cf-browser-verification') !== null ||
                                     document.querySelector('#challenge-form') !== null;

        // Check for CloudFlare specific text content
        const pageText = document.body.innerText.toLowerCase();
        const hasCloudFlareText = cloudflareIndicators.some(indicator => 
            pageText.includes(indicator.toLowerCase())
        );

        // Check if current URL is a CloudFlare challenge
        const currentUrl = window.location.href;
        const isCloudFlareDomain = currentUrl.includes('cloudflare.com') || 
                                  currentUrl.includes('cf-cdn.com');

        return {
            isCloudFlareCheck: hasCloudFlareTitle || hasCloudFlareElements || hasCloudFlareText || isCloudFlareDomain,
            indicators: {
                title: hasCloudFlareTitle,
                elements: hasCloudFlareElements,
                text: hasCloudFlareText,
                domain: isCloudFlareDomain
            },
            url: currentUrl,
            title: document.title,
            timestamp: new Date().toISOString()
        };
    }

    // Function to send detection results to background script
    function sendDetectionResult(result) {
        if (result.isCloudFlareCheck) {
            console.log('RecurTrack: CloudFlare human check detected!', result);
            
            // Send message to background script
            browser.runtime.sendMessage({
                type: 'CLOUDFLARE_CHECK_DETECTED',
                data: result
            }).catch(error => {
                console.error('RecurTrack: Error sending message to background script:', error);
            });
        }
    }

    // Function to extract filename from video page
    function extractFilename() {
        const meta = document.querySelector('meta[name="description"]');
        if (!meta) return null;

        const content = meta.content;
        const metaMatch = content.match(/(.*?) show from.* on (\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/);

        if (!metaMatch) return null;

        const [_, username, date, hour, minute] = metaMatch;

        const filename = `${username}_${date}_${hour}-${minute}.mp4`;
        return filename;
    }

    // Initial detection when page loads
    function performInitialDetection() {
        // Wait a bit for the page to fully load
        setTimeout(() => {
            const result = detectCloudFlareCheck();
            sendDetectionResult(result);
        }, 1000);
    }

    // Monitor for dynamic changes (in case CloudFlare check appears after page load)
    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            // Check if any significant changes occurred
            const hasSignificantChanges = mutations.some(mutation => 
                mutation.type === 'childList' && mutation.addedNodes.length > 0
            );

            if (hasSignificantChanges) {
                const result = detectCloudFlareCheck();
                sendDetectionResult(result);
            }
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Initialize the content script
    function init() {
        console.log('RecurTrack: Content script loaded on', window.location.href);
        
        // Perform initial detection
        performInitialDetection();
        
        // Setup monitoring for dynamic changes
        setupMutationObserver();
        
        // Listen for extraction requests
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'EXTRACT_LINKS_REQUEST') {
                console.log('RecurTrack Content: Received extraction request for model:', message.model);
                
                const targetLinks = [];
                const allLinks = document.querySelectorAll('a[href]');
                
                console.log('RecurTrack Content: Found', allLinks.length, 'total links');
                
                allLinks.forEach((link, index) => {
                    const href = link.href;
                    if (href && href.includes('/' + message.model + '/video/')) {
                        console.log('RecurTrack Content: Found matching link:', href);
                        targetLinks.push(href);
                    }
                });
                
                console.log('RecurTrack Content: Returning', targetLinks.length, 'matching links');
                sendResponse({ links: targetLinks });
                return true; // Keep message channel open
            }
            
            if (message.type === 'CHECK_NEXT_PAGE') {
                console.log('RecurTrack Content: Checking for next page...');
                
                const pageLinks = document.querySelectorAll('a.page-link[data-page]');
                console.log('RecurTrack Content: Found', pageLinks.length, 'page links');
                
                let maxPage = 1;
                
                for (let i = 0; i < pageLinks.length; i++) {
                    const pageNum = parseInt(pageLinks[i].getAttribute('data-page'));
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
                
                console.log('RecurTrack Content: Max page found:', maxPage);
                
                // Get current page from URL
                const currentUrl = window.location.href;
                const currentPageMatch = currentUrl.match(/\/page\/(\d+)/);
                const currentPage = currentPageMatch ? parseInt(currentPageMatch[1]) : 1;
                
                console.log('RecurTrack Content: Current page:', currentPage);
                
                // Check if there's a next page
                if (currentPage < maxPage) {
                    const nextPage = currentPage + 1;
                    const nextPageUrl = 'https://www.recu.me/performer/' + message.model + '/page/' + nextPage;
                    console.log('RecurTrack Content: Next page URL:', nextPageUrl);
                    sendResponse({ nextPageUrl: nextPageUrl });
                } else {
                    console.log('RecurTrack Content: No next page available');
                    sendResponse({ nextPageUrl: null });
                }
                
                return true; // Keep message channel open
            }
            
            if (message.type === 'EXTRACT_FILENAME') {
                console.log('RecurTrack Content: Extracting filename from video page...');
                
                const filename = extractFilename();
                console.log('RecurTrack Content: Extracted filename:', filename);
                
                sendResponse({ filename: filename });
                return true; // Keep message channel open
            }
            
            if (message.type === 'CHECK_CLOUDFLARE') {
                const result = detectCloudFlareCheck();
                sendResponse({ hasChallenge: result.isCloudFlareCheck });
                return true; // Keep message channel open
            }
        });
    }

    // Start the content script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(); 