/**
 * RecurTrack Popup Script
 * Handles popup interface and communication with background script
 */

(function() {
    'use strict';

    // DOM elements
    const statusElement = document.getElementById('status');
    const statusTextElement = document.getElementById('status-text');
    const detectionInfoElement = document.getElementById('detection-info');
    const detectionUrlElement = document.getElementById('detection-url');
    const detectionTimeElement = document.getElementById('detection-time');
    const detectionIndicatorsElement = document.getElementById('detection-indicators');
    const clearButton = document.getElementById('clear-btn');
    const openSidebarButton = document.getElementById('open-sidebar-btn');
    const historyListElement = document.getElementById('history-list');

    // Function to update the status display
    function updateStatus(detection) {
        if (detection) {
            // Show detection status
            statusElement.className = 'status detected';
            statusTextElement.textContent = '⚠️ CloudFlare check detected!';
            
            // Show detection info
            detectionInfoElement.style.display = 'block';
            detectionUrlElement.textContent = detection.url;
            
            // Format timestamp
            const detectedTime = new Date(detection.timestamp);
            detectionTimeElement.textContent = detectedTime.toLocaleString();
            
            // Show indicators
            const indicators = [];
            if (detection.indicators.title) indicators.push('Title');
            if (detection.indicators.elements) indicators.push('Elements');
            if (detection.indicators.text) indicators.push('Text');
            if (detection.indicators.domain) indicators.push('Domain');
            
            detectionIndicatorsElement.textContent = indicators.join(', ');
            
            // Show clear button
            clearButton.style.display = 'block';
        } else {
            // Show clear status
            statusElement.className = 'status clear';
            statusTextElement.textContent = '✅ No CloudFlare checks detected';
            
            // Hide detection info
            detectionInfoElement.style.display = 'none';
            
            // Hide clear button
            clearButton.style.display = 'none';
        }
    }

    // Function to update history display
    function updateHistory(history) {
        if (!history || history.length === 0) {
            historyListElement.innerHTML = '<div class="loading">No recent detections</div>';
            return;
        }

        const historyHtml = history.map(item => {
            const time = new Date(item.detectedAt || item.timestamp);
            const url = new URL(item.url);
            
            return `
                <div class="history-item">
                    <div><strong>${url.hostname}</strong></div>
                    <div class="time">${time.toLocaleString()}</div>
                </div>
            `;
        }).join('');

        historyListElement.innerHTML = historyHtml;
    }

    // Function to load current state
    async function loadCurrentState() {
        try {
            // Get current detection
            const detectionResponse = await browser.runtime.sendMessage({
                type: 'GET_CURRENT_DETECTION'
            });
            
            if (detectionResponse.detection) {
                updateStatus(detectionResponse.detection);
            } else {
                updateStatus(null);
            }

            // Get detection history
            const historyResponse = await browser.runtime.sendMessage({
                type: 'GET_DETECTION_HISTORY'
            });
            
            updateHistory(historyResponse.history);

        } catch (error) {
            console.error('RecurTrack Popup: Error loading state:', error);
            statusTextElement.textContent = '❌ Error loading state';
        }
    }

    // Function to clear current detection
    async function clearDetection() {
        try {
            await browser.runtime.sendMessage({
                type: 'CLEAR_DETECTION'
            });
            
            updateStatus(null);
            
        } catch (error) {
            console.error('RecurTrack Popup: Error clearing detection:', error);
        }
    }

    // Function to open sidebar
    async function openSidebar() {
        try {
            await browser.sidebarAction.open();
        } catch (error) {
            console.error('RecurTrack Popup: Error opening sidebar:', error);
        }
    }

    // Event listeners
    clearButton.addEventListener('click', clearDetection);
    openSidebarButton.addEventListener('click', openSidebar);

    // Initialize popup
    document.addEventListener('DOMContentLoaded', () => {
        console.log('RecurTrack Popup: Initializing...');
        loadCurrentState();
    });

    // Listen for messages from background script (for real-time updates)
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'DETECTION_UPDATED') {
            updateStatus(message.detection);
        } else if (message.type === 'HISTORY_UPDATED') {
            updateHistory(message.history);
        }
    });

    console.log('RecurTrack Popup: Script loaded');

})(); 