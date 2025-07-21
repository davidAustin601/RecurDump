/**
 * RecurTrack Content Script
 * Detects CloudFlare human checks and other website challenges
 */

(function() {
    'use strict';

    // Function to detect CloudFlare human check
    function detectCloudFlareCheck() {
        // Comprehensive CloudFlare challenge indicators
        const cloudflareIndicators = [
            // Page title indicators
            'Just a moment...',
            'Checking your browser',
            'Please wait while we verify',
            'Cloudflare',
            'Security check',
            'Verifying you are human',
            'Please wait',
            'Checking your browser before accessing',
            'DDoS protection by Cloudflare',
            
            // Common CloudFlare challenge page elements
            '#cf-wrapper',
            '.cf-browser-verification',
            '#challenge-form',
            '.cf-error-code',
            '#cf-please-wait',
            '.cf-please-wait',
            '#cf-challenge-running',
            '.cf-challenge-running',
            '#cf-challenge-form',
            '.cf-challenge-form',
            '#cf-please-wait',
            '.cf-please-wait',
            '#cf-error-details',
            '.cf-error-details',
            
            // CloudFlare specific text content
            'DDoS protection by Cloudflare',
            'Please complete the security check',
            'Please wait while we verify that you are a human',
            'Checking your browser before accessing',
            'This process is automatic',
            'Your browser will redirect to your requested content shortly',
            'Please allow up to 5 seconds',
            'DDoS protection by Cloudflare',
            'Ray ID:',
            'Cloudflare',
            'security check',
            'verification',
            'challenge',
            'please wait',
            'checking browser',
            'human verification',
            'bot protection',
            'access denied',
            'blocked by security'
        ];

        // Check page title
        const pageTitle = document.title.toLowerCase();
        const hasCloudFlareTitle = cloudflareIndicators.some(indicator => 
            pageTitle.includes(indicator.toLowerCase())
        );

        // Check for CloudFlare specific elements (more comprehensive)
        const cloudflareSelectors = [
            '#cf-wrapper',
            '.cf-browser-verification',
            '#challenge-form',
            '.cf-error-code',
            '#cf-please-wait',
            '.cf-please-wait',
            '#cf-challenge-running',
            '.cf-challenge-running',
            '#cf-challenge-form',
            '.cf-challenge-form',
            '#cf-error-details',
            '.cf-error-details',
            '[class*="cf-"]',
            '[id*="cf-"]',
            '[class*="cloudflare"]',
            '[id*="cloudflare"]'
        ];
        
        const hasCloudFlareElements = cloudflareSelectors.some(selector => {
            try {
                return document.querySelector(selector) !== null;
            } catch (e) {
                return false;
            }
        });

        // Check for CloudFlare specific text content (more thorough)
        const pageText = document.body.innerText.toLowerCase();
        const hasCloudFlareText = cloudflareIndicators.some(indicator => 
            pageText.includes(indicator.toLowerCase())
        );

        // Check if current URL is a CloudFlare challenge
        const currentUrl = window.location.href;
        const isCloudFlareDomain = currentUrl.includes('cloudflare.com') || 
                                  currentUrl.includes('cf-cdn.com') ||
                                  currentUrl.includes('cloudflare.net');

        // Additional checks for common CloudFlare patterns
        const hasCloudFlareScripts = Array.from(document.scripts).some(script => 
            script.src && (script.src.includes('cloudflare') || script.src.includes('cf-'))
        );

        const hasCloudFlareMeta = document.querySelector('meta[name*="cloudflare"]') !== null ||
                                 document.querySelector('meta[content*="cloudflare"]') !== null;

        return {
            isCloudFlareCheck: hasCloudFlareTitle || hasCloudFlareElements || hasCloudFlareText || 
                              isCloudFlareDomain || hasCloudFlareScripts || hasCloudFlareMeta,
            indicators: {
                title: hasCloudFlareTitle,
                elements: hasCloudFlareElements,
                text: hasCloudFlareText,
                domain: isCloudFlareDomain,
                scripts: hasCloudFlareScripts,
                meta: hasCloudFlareMeta
            },
            url: currentUrl,
            title: document.title,
            timestamp: new Date().toISOString()
        };
    }

    // Function to send detection results to background script with retry logic
    function sendDetectionResult(result, retryCount = 0) {
        if (result.isCloudFlareCheck) {
            console.log('RecurTrack: CloudFlare human check detected!', result);
            
            // Send message to background script
            browser.runtime.sendMessage({
                type: 'CLOUDFLARE_CHECK_DETECTED',
                data: result
            }).then(() => {
                console.log('RecurTrack: CloudFlare detection message sent successfully');
            }).catch(error => {
                console.error('RecurTrack: Error sending message to background script:', error);
                
                // Retry logic - retry up to 3 times with exponential backoff
                if (retryCount < 3) {
                    const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                    console.log(`RecurTrack: Retrying message send in ${delay}ms (attempt ${retryCount + 1})`);
                    setTimeout(() => {
                        sendDetectionResult(result, retryCount + 1);
                    }, delay);
                } else {
                    console.error('RecurTrack: Failed to send CloudFlare detection after 3 retries');
                }
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

    // Initial detection when page loads with better timing
    function performInitialDetection() {
        // Wait longer for the page to fully load and for CloudFlare challenges to appear
        setTimeout(() => {
            const result = detectCloudFlareCheck();
            sendDetectionResult(result);
        }, 3000); // Increased from 1 second to 3 seconds
        
        // Additional check after 5 seconds for delayed challenges
        setTimeout(() => {
            const result = detectCloudFlareCheck();
            sendDetectionResult(result);
        }, 5000);
    }

    // Monitor for dynamic changes with improved mutation observer
    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            // Check if any significant changes occurred
            const hasSignificantChanges = mutations.some(mutation => {
                // Check for added nodes
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    return true;
                }
                
                // Check for attribute changes (important for CloudFlare challenges)
                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    // Check if the changed element or its parents contain CloudFlare indicators
                    return target.matches && (
                        target.matches('[class*="cf-"]') ||
                        target.matches('[id*="cf-"]') ||
                        target.matches('[class*="cloudflare"]') ||
                        target.matches('[id*="cloudflare"]')
                    );
                }
                
                // Check for text changes
                if (mutation.type === 'characterData') {
                    const text = mutation.target.textContent.toLowerCase();
                    return text.includes('cloudflare') || 
                           text.includes('security check') ||
                           text.includes('verification') ||
                           text.includes('please wait');
                }
                
                return false;
            });

            if (hasSignificantChanges) {
                // Debounce the detection to avoid excessive checks
                clearTimeout(window.cloudflareDetectionTimeout);
                window.cloudflareDetectionTimeout = setTimeout(() => {
                    const result = detectCloudFlareCheck();
                    sendDetectionResult(result);
                }, 500);
            }
        });

        // Start observing with comprehensive options
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'style'],
            characterData: true
        });
        
        // Also observe the document head for meta tag changes
        if (document.head) {
            observer.observe(document.head, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['name', 'content']
            });
        }
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