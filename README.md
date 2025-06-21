# Browser AI Memory - Chrome Extension

A Chrome extension that provides AI-powered memory for your browsing experience. Save, search, and recall any webpage content using intelligent memory management.

## Features

- 🧠 **Smart Memory**: Automatically extract and store meaningful content from web pages
- 🔍 **AI-Powered Search**: Search through your browsing history using natural language
- 💾 **Easy Saving**: Save current pages or selected text with one click
- 🏷️ **Auto-Tagging**: Automatically generate tags for better organization
- 🎯 **Context Menu**: Right-click to save any page or selection
- 🔄 **Auto-Save**: Optional automatic saving of pages you visit
- 🧹 **Smart Cleanup**: Automatic cleanup of old memories

## File Structure

```
browser-memory/
├── src/                    # TypeScript source files
│   ├── popup.ts           # Popup functionality
│   ├── background.ts      # Background service worker
│   ├── content.ts         # Content script for page interaction
│   └── types/             # TypeScript type definitions
│       └── memory.ts      # Memory-related interfaces
├── dist/                  # Built extension files (generated)
├── manifest.json          # Extension configuration
├── popup.html            # Popup interface HTML
├── popup.css             # Popup styling
├── icons/                # Extension icons
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── webpack.config.js     # Build configuration
└── README.md             # This file
```

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm

### Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Build the extension**:

   ```bash
   npm run build
   ```

3. **Load Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `dist/` folder

### Development

- **Watch mode** (rebuilds on file changes):
  ```bash
  npm run dev
  ```
- **Type checking**:
  ```bash
  npm run type-check
  ```

## Development

### Core Components

- **Manifest v3**: Uses the latest Chrome extension manifest format
- **Service Worker**: Background script handles storage and context menus
- **Content Script**: Extracts content from web pages intelligently
- **Popup Interface**: Clean, modern UI for interaction

### Permissions Used

- `activeTab`: Access to current tab content
- `storage`: Local storage for memories
- `tabs`: Tab management and information
- `history`: Access to browsing history
- `bookmarks`: Integration with bookmarks

### Storage Structure

```javascript
{
  memories: [
    {
      id: timestamp,
      url: "page_url",
      title: "page_title",
      content: "extracted_content",
      timestamp: "ISO_date",
      tags: ["auto", "generated", "tags"],
      domain: "example.com"
    }
  ],
  settings: {
    autoSave: false,
    maxMemories: 100,
    aiProvider: "local"
  }
}
```

## TODO / Future Enhancements

- [ ] Integrate with external AI APIs (OpenAI, Claude, etc.)
- [ ] Implement semantic search using embeddings
- [ ] Add export/import functionality
- [ ] Create options page for settings
- [ ] Add keyboard shortcuts
- [ ] Implement memory categories/folders
- [ ] Add sharing capabilities
- [ ] Create analytics dashboard

## Contributing

This is a skeleton/template for a Chrome extension. Feel free to extend and customize it for your specific needs.

## License

See LICENSE file for details.
