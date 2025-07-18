# RecurTrack Firefox Extension

A Firefox extension that detects CloudFlare human checks and other website challenges.

## Features

- **CloudFlare Detection**: Automatically detects when a website is showing a CloudFlare human verification page
- **Visual Indicators**: Shows a red badge on the extension icon when a check is detected
- **User Notifications**: Displays browser notifications to alert users about detected checks
- **Detection History**: Keeps track of recent detections for reference
- **Manual Completion**: Prompts users to manually complete the verification (does not attempt to bypass)

## How It Works

### Detection Methods

The extension uses multiple methods to detect CloudFlare human checks:

1. **Page Title Analysis**: Looks for common CloudFlare challenge titles like "Just a moment..." or "Checking your browser"
2. **DOM Element Detection**: Searches for CloudFlare-specific HTML elements like `#cf-wrapper` or `.cf-browser-verification`
3. **Text Content Analysis**: Scans page content for CloudFlare-related text
4. **Domain Checking**: Identifies CloudFlare domains

### Components

- **Content Script** (`content.js`): Runs on every webpage to detect CloudFlare checks
- **Background Script** (`background.js`): Manages extension state and handles notifications
- **Popup Interface** (`popup.html` + `popup.js`): User interface showing detection status and history
- **Manifest** (`manifest.json`): Extension configuration and permissions

## Installation

### For Development

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the sidebar
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from this directory

### For Production

1. Package the extension (instructions to be added)
2. Install via Firefox Add-ons Manager

## Usage

1. **Automatic Detection**: The extension automatically scans every webpage you visit
2. **Visual Feedback**: When a CloudFlare check is detected:
   - Extension icon shows a red badge with "!"
   - Browser notification appears
   - Popup shows detection details
3. **Manual Action**: Users must manually complete the CloudFlare verification
4. **History**: View recent detections in the extension popup

## Development

### File Structure

```
webextension/
├── manifest.json      # Extension configuration
├── content.js         # Content script for detection
├── background.js      # Background script for state management
├── popup.html         # Popup interface
├── popup.js           # Popup functionality
├── icons/             # Extension icons (to be added)
└── README.md          # This file
```

### Testing

To test the extension:

1. Install it in Firefox (development mode)
2. Visit a website that uses CloudFlare protection
3. Check if the extension detects the challenge page
4. Verify the popup shows correct information

### Adding New Detection Methods

To add detection for other types of challenges:

1. Update the `detectCloudFlareCheck()` function in `content.js`
2. Add new indicators to the `cloudflareIndicators` array
3. Test with actual challenge pages

## Privacy

- The extension only scans webpage content for detection purposes
- No data is sent to external servers
- Detection history is stored locally in browser storage
- No personal information is collected

## Future Enhancements

- Support for other challenge types (reCAPTCHA, hCaptcha, etc.)
- Configurable detection sensitivity
- Export detection history
- Integration with RecurDump main application 