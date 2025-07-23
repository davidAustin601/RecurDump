/**
 * RecurTrack Options Page Script
 * Handles settings management and user interactions
 */

(function() {
    'use strict';

    // Default settings
    const defaultSettings = {
        defaultModel: '',
        defaultExtractAllPages: true, // changed from false
        defaultExtractFilenames: true, // changed from false
        autoClearAfterExtraction: true, // changed from false
        pageLoadDelay: 3,
        cloudflareTimeout: 5,
        maxPages: 10,
        csvSeparator: ',',
        csvIncludeHeaders: true,
        csvIncludeMetadata: true,
        debugMode: false,
        customLinkPattern: '',
        defaultDirectory: '',
        autoSaveDatabase: false,
        askWhereToSave: false,
        filenameFormat: '[Model Name]_Database_[MONTH]-[DAY]-[YEAR].csv'
    };

    // DOM elements
    const defaultModelInput = document.getElementById('default-model');
    const defaultExtractAllPagesCheckbox = document.getElementById('default-extract-all-pages');
    const defaultExtractFilenamesCheckbox = document.getElementById('default-extract-filenames');
    const autoClearAfterExtractionCheckbox = document.getElementById('auto-clear-after-extraction');
    const pageLoadDelaySelect = document.getElementById('page-load-delay');
    const cloudflareTimeoutSelect = document.getElementById('cloudflare-timeout');
    const maxPagesSelect = document.getElementById('max-pages');
    const csvSeparatorSelect = document.getElementById('csv-separator');
    const csvIncludeHeadersCheckbox = document.getElementById('csv-include-headers');
    const csvIncludeMetadataCheckbox = document.getElementById('csv-include-metadata');
    const debugModeCheckbox = document.getElementById('debug-mode');
    const customLinkPatternTextarea = document.getElementById('custom-link-pattern');
    
    // Database settings elements
    const defaultDirectoryInput = document.getElementById('default-directory');
    const selectDirectoryBtn = document.getElementById('select-directory');
    const autoSaveDatabaseCheckbox = document.getElementById('auto-save-database');
    const askWhereToSaveCheckbox = document.getElementById('ask-where-to-save');
    const filenameFormatInput = document.getElementById('filename-format');
    const filenamePreviewText = document.getElementById('filename-preview-text');
    
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

    // Function to update filename preview
    function updateFilenamePreview() {
        const format = filenameFormatInput.value || defaultSettings.filenameFormat;
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const year = now.getFullYear();
        const date = `${month}-${day}-${year}`;
        const time = now.toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '-');
        const timestamp = now.getTime();
        
        let preview = format
            .replace(/\[Model Name\]/g, 'example_model')
            .replace(/\[MONTH\]/g, month)
            .replace(/\[DAY\]/g, day)
            .replace(/\[YEAR\]/g, year)
            .replace(/\[DATE\]/g, date)
            .replace(/\[TIME\]/g, time)
            .replace(/\[TIMESTAMP\]/g, timestamp);
        
        filenamePreviewText.textContent = preview;
    }

    // Function to select directory
    async function selectDirectory() {
        try {
            // Show a helpful dialog explaining the situation and allowing manual entry
            const currentPath = defaultDirectoryInput.value || '';
            const newPath = prompt(
                'Enter the directory path where you want to save database files:\n\n' +
                'Note: Due to browser security, files will be saved to your browser\'s default download location.\n' +
                'To use a custom directory:\n' +
                '1. Enable "Ask where to save each file" below\n' +
                '2. Or change your browser\'s default download location\n\n' +
                'This field is for your reference only.',
                currentPath || '~/Downloads'
            );
            
            if (newPath !== null) {
                defaultDirectoryInput.value = newPath;
                updateFilenamePreview();
                showStatus('Directory path updated!', 'success');
            }
            
        } catch (error) {
            console.error('RecurTrack Options: Error selecting directory:', error);
            showStatus('Error setting directory: ' + error.message, 'error');
        }
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
            autoClearAfterExtractionCheckbox.checked = settings.autoClearAfterExtraction || false;
            pageLoadDelaySelect.value = settings.pageLoadDelay || 3;
            cloudflareTimeoutSelect.value = settings.cloudflareTimeout || 5;
            maxPagesSelect.value = settings.maxPages || 10;
            csvSeparatorSelect.value = settings.csvSeparator || ',';
            csvIncludeHeadersCheckbox.checked = settings.csvIncludeHeaders !== false;
            csvIncludeMetadataCheckbox.checked = settings.csvIncludeMetadata !== false;
            debugModeCheckbox.checked = settings.debugMode || false;
            customLinkPatternTextarea.value = settings.customLinkPattern || '';
            
            // Database settings
            defaultDirectoryInput.value = settings.defaultDirectory || '';
            autoSaveDatabaseCheckbox.checked = settings.autoSaveDatabase || false;
            askWhereToSaveCheckbox.checked = settings.askWhereToSave || false;
            filenameFormatInput.value = settings.filenameFormat || defaultSettings.filenameFormat;
            updateFilenamePreview();
            
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
                autoClearAfterExtraction: autoClearAfterExtractionCheckbox.checked,
                pageLoadDelay: parseInt(pageLoadDelaySelect.value),
                cloudflareTimeout: parseInt(cloudflareTimeoutSelect.value),
                maxPages: parseInt(maxPagesSelect.value),
                csvSeparator: csvSeparatorSelect.value,
                csvIncludeHeaders: csvIncludeHeadersCheckbox.checked,
                csvIncludeMetadata: csvIncludeMetadataCheckbox.checked,
                debugMode: debugModeCheckbox.checked,
                customLinkPattern: customLinkPatternTextarea.value.trim(),
                defaultDirectory: defaultDirectoryInput.value.trim(),
                autoSaveDatabase: autoSaveDatabaseCheckbox.checked,
                askWhereToSave: askWhereToSaveCheckbox.checked,
                filenameFormat: filenameFormatInput.value.trim() || defaultSettings.filenameFormat
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
    
    // Database settings event listeners
    selectDirectoryBtn.addEventListener('click', selectDirectory);
    filenameFormatInput.addEventListener('input', updateFilenamePreview);
    defaultDirectoryInput.addEventListener('input', updateFilenamePreview);

    // Initialize options page
    document.addEventListener('DOMContentLoaded', () => {
        console.log('RecurTrack Options: Initializing...');
        loadSettings();
    });

    console.log('RecurTrack Options: Script loaded');

})(); 