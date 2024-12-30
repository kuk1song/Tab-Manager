# Smart Tab Manager

A Chrome extension for intelligent tab management, helping users organize and manage browser tabs more efficiently.

## Features

- 🔄 Real-time Tab Activity Tracking

  - Visit count recording
  - Active time statistics
  - Last visit tracking

- 📊 Intelligent Analysis

  - Automatic categorization (Work, Learning, Entertainment, Social, etc.)
  - Importance scoring
  - Activity analysis

- 🎯 Efficient Management

  - Filter by category
  - Multiple sorting options (Recent, Importance, Title)
  - Quick tab switching

- 💾 Data Persistence
  - Usage data saving
  - Data retention after browser restart
  - Continuous accumulation of visit statistics

## Installation

1. Download the project code
2. Open Chrome extensions page (chrome://extensions/)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project folder

## Project Structure

extension/
├── manifest.json // Extension configuration
├── popup.html // Popup window interface
├── popup.js // Popup window interaction logic
├── popup.css // Popup window styles
├── background.js // Background core logic
└── icons/ // Icon folder

## Usage

1. Click the extension icon to open the management interface
2. Manage tabs through:
   - Category filter for specific tab types
   - Different sorting conditions
   - Click on tab items to quickly switch
   - View visit statistics and active time

## Technical Implementation

- **Data Management**

  - Data persistence using chrome.storage.local
  - Real-time tab activity tracking
  - Intelligent analysis algorithms

- **User Interface**

  - Responsive design
  - Smooth animations
  - Intuitive data display

- **Core Functionality**
  - Background activity tracking
  - Real-time data updates
  - Smart categorization system

## Development Details

### Main File Functions

- **manifest.json**: Extension configuration file
- **background.js**: Core background logic
  - Data management and persistence
  - Tab activity tracking
  - Analysis implementation
- **popup.js**: User interface interaction
  - Data display
  - User operation handling
  - Interface updates
- **popup.css**: Interface style definitions
  - Responsive layout
  - Animation effects
  - Visual theme

### Data Structure

```javascript
// Tab data structure
tabData = {
  importance: {}, // Importance scores
  categories: {}, // Tab categories
  analysis: {}, // Analysis results
  lastAnalysis: {}, // Last analysis time
};

// Activity data structure
tabActivityData = {
  lastActive: {}, // Last active time
  totalActiveTime: {}, // Total active time
  visitCount: {}, // Visit count
};
```

## Changelog

### v1.0.0

- Initial release
- Basic functionality implementation
- Data persistence support

## Contributing

1. Fork the project
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[MIT License](LICENSE)

## Author

Haokun Song

## Acknowledgments

Thanks to all users who provided feedback and suggestions for the project.
