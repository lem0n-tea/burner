# Burner Browser Extension (Firefox)

Time tracking browser extension for Firefox.

## Installation (Firefox Development)

1. Open Firefox
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to `browser_extension/manifest.json`
5. Select and open the file
6. Extension icon appears in toolbar

**Note:** This is a temporary add-on. It will be removed when Firefox closes. To reload, repeat the process.

## Structure

```
browser_extension/
├── manifest.json         # Extension configuration (Firefox MV3)
├── background/
│   └── background.js     # Background script (tracking orchestration)
├── content/
│   └── content-script.js # Injected into web pages (activity detection)
├── popup/
│   ├── popup.html        # Popup UI
│   ├── popup.css         # Popup styles
│   └── popup.js          # Popup logic
└── lib/
    └── browser-api.js    # Firefox browser API export
```

## Development

### Debugging

1. **Background script**: Open Browser Toolbox (Ctrl+Alt+Shift+I) → select extension
2. **Content script**: Open Web Console on any webpage (Ctrl+Shift+K)
3. **Popup**: Click extension icon, right-click → Inspect Element

### Logs

- Background: Browser Toolbox console
- Content script: Page Web Console (filtered by content script)
- Popup: Popup dev tools console

## Permissions

- `storage` - Store sessions locally
- `tabs` - Track active tab hostname
- `alarms` - Periodic sync scheduler
- `scripting` - Inject content scripts

## Backend

Connects to Burner API at configurable URL. Default endpoints:
- `POST /time/flush` - Submit sessions
- `GET /time/stats?period=&timezone=` - Get statistics

## Requirements

- Firefox 109.0 or later (Manifest V3 support)

## License

MIT
