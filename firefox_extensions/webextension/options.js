/**
 * RecurTrack Options Page Script
 * Handles settings management and user interactions
 */

(function() {
    'use strict';

    // Default settings
    const defaultSettings = {
        defaultModel: '',
        defaultExtractAllPages: false,
        defaultExtractFilenames: false,
        pageLoadDelay: 3,
        cloudflareTimeout: 5,
        maxPages: 10,
        csvSeparator: ',',
        csvIncludeHeaders: true,
        autoSave: false,
        debugMode: false,
        customLinkPattern: ''
    };

    // DOM elements
    const defaultModelInput = document.getElementById('default-model');
    const defaultExtractAllPagesCheckbox = document.getElementById('default-extract-all-pages');
    const defaultExtractFilenamesCheckbox = document.getElementById('default-extract-filenames');
    const pageLoadDelaySelect = document.getElementById('page-load-delay');
    const cloudflareTimeoutSelect = document.getElementById('cloudflare-timeout');
    const maxPagesSelect = document.getElementById('max-pages');
    const csvSeparatorSelect = document.getElementById('csv-separator');
    const csvIncludeHeadersCheckbox = document.getElementById('csv-include-headers');
    const autoSaveCheckbox = document.getElementById('auto-save');
    const debugModeCheckbox = document.getElementById('debug-mode');
    const customLinkPatternTextarea = document.getElementById('custom-link-pattern');
    
    const saveSettingsBtn = document.getElementById('save-settings');
    const cancelBtn = document.getElementById('cancel');
    const exportSettingsBtn = document.getElementById('export-settings');
    const importSettingsBtn = document.getElementById('import-settings');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const clearAllDataBtn = document.getElementById('clear-all-data');
    const exportAllDataBtn = document.getElementById('export-all-data');
    
    const statusMessage = document.getElementById('status-message');

    // Function to show status message
    function showStatus(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }

    // Function to load settings from storage
    async function loadSettings() {
        try {
            const result = await browser.storage.local.get(['settings']);
            const settings = result.settings || defaultSettings;
            
            // Populate form fields
            defaultModelInput.value = settings.defaultModel || '';
            defaultExtractAllPagesCheckbox.checked = settings.defaultExtractAllPages || false;
            defaultExtractFilenamesCheckbox.checked = settings.defaultExtractFilenames || false;
            pageLoadDelaySelect.value = settings.pageLoadDelay || 3;
            cloudflareTimeoutSelect.value = settings.cloudflareTimeout || 5;
            maxPagesSelect.value = settings.maxPages || 10;
            csvSeparatorSelect.value = settings.csvSeparator || ',';
            csvIncludeHeadersCheckbox.checked = settings.csvIncludeHeaders !== false;
            autoSaveCheckbox.checked = settings.autoSave || false;
            debugModeCheckbox.checked = settings.debugMode || false;
            customLinkPatternTextarea.value = settings.customLinkPattern || '';
            
            console.log('RecurTrack Options: Settings loaded successfully');
            
        } catch (error) {
            console.error('RecurTrack Options: Error loading settings:', error);
            showStatus('Error loading settings: ' + error.message, 'error');
        }
    }

    // Function to save settings to storage
    async function saveSettings() {
        try {
            const settings = {
                defaultModel: defaultModelInput.value.trim(),
                defaultExtractAllPages: defaultExtractAllPagesCheckbox.checked,
                defaultExtractFilenames: defaultExtractFilenamesCheckbox.checked,
                pageLoadDelay: parseInt(pageLoadDelaySelect.value),
                cloudflareTimeout: parseInt(cloudflareTimeoutSelect.value),
                maxPages: parseInt(maxPagesSelect.value),
                csvSeparator: csvSeparatorSelect.value,
                csvIncludeHeaders: csvIncludeHeadersCheckbox.checked,
                autoSave: autoSaveCheckbox.checked,
                debugMode: debugModeCheckbox.checked,
                customLinkPattern: customLinkPatternTextarea.value.trim()
            };
            
            await browser.storage.local.set({ settings: settings });
            
            showStatus('Settings saved successfully!');
            console.log('RecurTrack Options: Settings saved:', settings);
            
        } catch (error) {
            console.error('RecurTrack Options: Error saving settings:', error);
            showStatus('Error saving settings: ' + error.message, 'error');
        }
    }

    // Function to reset settings to defaults
    async function resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
            try {
                await browser.storage.local.set({ settings: defaultSettings });
                await loadSettings();
                showStatus('Settings reset to defaults successfully!');
                console.log('RecurTrack Options: Settings reset to defaults');
                
            } catch (error) {
                console.error('RecurTrack Options: Error resetting settings:', error);
                showStatus('Error resetting settings: ' + error.message, 'error');
            }
        }
    }

    // Function to export settings
    async function exportSettings() {
        try {
            const result = await browser.storage.local.get(['settings']);
            const settings = result.settings || defaultSettings;
            
            const settingsBlob = new Blob([JSON.stringify(settings, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(settingsBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recurtrack-settings.json';
            a.click();
            
            URL.revokeObjectURL(url);
            showStatus('Settings exported successfully!');
            
        } catch (error) {
            console.error('RecurTrack Options: Error exporting settings:', error);
            showStatus('Error exporting settings: ' + error.message, 'error');
        }
    }

    // Function to import settings
    async function importSettings() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const settings = JSON.parse(text);
                    
                    // Validate settings structure
                    const validSettings = {};
                    for (const key in defaultSettings) {
                        validSettings[key] = settings[key] !== undefined ? settings[key] : defaultSettings[key];
                    }
                    
                    await browser.storage.local.set({ settings: validSettings });
                    await loadSettings();
                    showStatus('Settings imported successfully!');
                    
                } catch (error) {
                    console.error('RecurTrack Options: Error parsing imported settings:', error);
                    showStatus('Error importing settings: Invalid file format', 'error');
                }
            };
            
            input.click();
            
        } catch (error) {
            console.error('RecurTrack Options: Error importing settings:', error);
            showStatus('Error importing settings: ' + error.message, 'error');
        }
    }

    // Function to clear all data
    async function clearAllData() {
        if (confirm('Are you sure you want to clear all data? This will remove all extraction results, filename database, and debug logs. This cannot be undone.')) {
            try {
                await browser.storage.local.remove([
                    'extractionState',
                    'filenameDatabase',
                    'currentDetection',
                    'detectionHistory'
                ]);
                
                showStatus('All data cleared successfully!');
                console.log('RecurTrack Options: All data cleared');
                
            } catch (error) {
                console.error('RecurTrack Options: Error clearing data:', error);
                showStatus('Error clearing data: ' + error.message, 'error');
            }
        }
    }

    // Function to export all data
    async function exportAllData() {
        try {
            const result = await browser.storage.local.get([
                'extractionState',
                'filenameDatabase',
                'currentDetection',
                'detectionHistory',
                'settings'
            ]);
            
            const dataBlob = new Blob([JSON.stringify(result, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recurtrack-all-data.json';
            a.click();
            
            URL.revokeObjectURL(url);
            showStatus('All data exported successfully!');
            
        } catch (error) {
            console.error('RecurTrack Options: Error exporting all data:', error);
            showStatus('Error exporting data: ' + error.message, 'error');
        }
    }

    // Event listeners
    saveSettingsBtn.addEventListener('click', saveSettings);
    cancelBtn.addEventListener('click', () => window.close());
    exportSettingsBtn.addEventListener('click', exportSettings);
    importSettingsBtn.addEventListener('click', importSettings);
    resetSettingsBtn.addEventListener('click', resetSettings);
    clearAllDataBtn.addEventListener('click', clearAllData);
    exportAllDataBtn.addEventListener('click', exportAllData);

    // Initialize options page
    document.addEventListener('DOMContentLoaded', () => {
        console.log('RecurTrack Options: Initializing...');
        loadSettings();
    });

    console.log('RecurTrack Options: Script loaded');

})(); 