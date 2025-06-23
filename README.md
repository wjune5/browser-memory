# QuickSeek - AI-Powered Browsing Memory

A Chrome extension that transforms your browsing history into conversational AI memory. Chat naturally with an AI that remembers everything you've browsed and provides contextual, intelligent responses.

## 🚀 Features

- 🧠 **AI Conversational Memory**: Chat naturally with an AI that remembers your browsing history
- 🔍 **Semantic Search**: Find content using natural language, not just keywords
- 💬 **Context-Aware Responses**: AI provides relevant insights based on your browsing patterns
- ⚡ **Real-time Processing**: Powered by Google Gemini 2.5 Flash for fast, intelligent responses
- 🎯 **Smart Memory**: Automatically extracts and indexes meaningful content from web pages
- 🔄 **Multi-Agent AI**: Uses CrewAI framework with specialized agents for enhanced analysis
- 🌐 **Production Ready**: Deployed backend on Google Cloud Run with enterprise-grade reliability

## 🎥 How It Works

1. **Browse Naturally**: Visit any webpage - content is automatically extracted and indexed
2. **Ask Questions**: Open the extension and ask anything about your browsing history
3. **Get Intelligent Responses**: AI provides conversational answers with relevant context
4. **Natural Conversation**: Chat like you're talking to a friend who remembers everything

### Example Conversations

- **"What have I been working on lately?"** → _"Looks like you've been deep into that QuickSeek browser extension project, working with CrewAI and deploying to Google Cloud..."_
- **"Hey, what's up?"** → _"Not much! I see you've been checking out some AI frameworks. How's that going?"_
- **"Find that article about React hooks"** → _"I found that React hooks tutorial you were reading yesterday on dev.to..."_

## 🏗️ Architecture

### Frontend (Chrome Extension)

- **TypeScript**: Modern, type-safe development
- **Manifest V3**: Latest Chrome extension standards
- **Real-time Chat**: Responsive conversational interface
- **Semantic Search**: Vector-based content retrieval

### Backend (Google Cloud)

- **Google Cloud Run**: Serverless, scalable deployment
- **CrewAI Framework**: Multi-agent AI system for intelligent responses
- **Google Gemini 2.5 Flash**: Free, fast, and powerful AI model
- **LangGraph**: Orchestrates AI workflows for optimal responses

## 📦 Installation

### For Users

1. **Download the Extension**:

   - Clone this repository or download the latest release
   - Run `npm install && npm run build`

2. **Load in Chrome**:

   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/` folder

3. **Start Using**:
   - Pin the extension to your toolbar
   - Browse some websites to build memory
   - Click the extension icon and start chatting!

### For Developers

#### Prerequisites

- Node.js (v18+)
- npm or yarn
- Chrome browser
- Google Cloud account (for backend deployment)

#### Setup

```bash
# Clone the repository
git clone <repository-url>
cd browser-memory

# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build
```

#### Backend Setup

```bash
# Navigate to backend
cd cloud-agents/browser-enhancer

# Install dependencies
make install

# Set environment variables
export GEMINI_API_KEY="your-gemini-api-key"

# Deploy to Google Cloud
make backend
```

## 🔧 Configuration

### Extension Settings

Configure the extension by editing the backend endpoint in the popup settings:

- **Backend URL**: `https://quickseek-backend-253227330517.us-central1.run.app`
- **Timeout**: 5 minutes (for complex multi-agent processing)

### Backend Configuration

The backend is configured via environment variables:

- `GEMINI_API_KEY`: Your Google AI Studio API key
- `GOOGLE_API_KEY`: Same as GEMINI_API_KEY for LiteLLM compatibility

## 🏛️ File Structure

```
browser-memory/
├── src/                          # Chrome extension source
│   ├── popup.ts                 # Main popup interface
│   ├── background.ts            # Service worker
│   ├── content.ts               # Content extraction
│   ├── chat.ts                  # AI chat functionality
│   ├── chatUI.ts                # Chat interface
│   ├── embeddings.ts            # Semantic search
│   └── types/                   # TypeScript definitions
├── cloud-agents/                # AI backend
│   └── browser-enhancer/        # CrewAI multi-agent system
│       ├── app/                 # FastAPI application
│       │   ├── agent.py         # LangGraph workflow
│       │   ├── server.py        # API endpoints
│       │   └── crew/            # CrewAI agents
│       ├── frontend/            # Streamlit UI (optional)
│       └── deployment/          # Cloud infrastructure
├── dist/                        # Built extension
├── manifest.json               # Extension manifest
├── popup.html                  # Popup HTML
└── popup.css                   # Styling
```

## 🔒 Privacy & Security

- **Local Storage**: All browsing data stays in your browser's local storage
- **Encrypted Communication**: HTTPS-only communication with backend
- **No Data Persistence**: Backend doesn't store your browsing data
- **Open Source**: Full transparency - inspect the code yourself

## 🚀 Deployment

### Chrome Web Store (Coming Soon)

We're preparing for Chrome Web Store submission with:

- Privacy policy compliance
- Security review
- User testing and feedback

### Self-Hosting Backend

You can deploy your own backend instance:

```bash
cd cloud-agents/browser-enhancer
export GEMINI_API_KEY="your-api-key"
make backend
```

The backend will be deployed to your Google Cloud project.

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and test thoroughly
4. **Submit a pull request** with a clear description

### Development Guidelines

- Use TypeScript for type safety
- Follow existing code style and conventions
- Test your changes with real browsing scenarios
- Update documentation for any API changes

## 🐛 Troubleshooting

### Common Issues

**Extension not loading?**

- Ensure you've run `npm run build` first
- Check Chrome developer tools for errors
- Verify manifest.json is valid

**No AI responses?**

- Check if backend is reachable: `https://quickseek-backend-253227330517.us-central1.run.app/health`
- Verify you have browsing data stored (visit some websites first)
- Check console logs for detailed error messages

**Slow responses?**

- Multi-agent processing can take 30-60 seconds for complex queries
- Simple greetings should respond within 5-10 seconds
- Check your internet connection

## 📊 Performance

- **Response Time**: 3-15 seconds for most queries
- **Storage**: ~1MB per 100 saved pages
- **Memory Usage**: <50MB additional RAM
- **Battery Impact**: Minimal (processes only when actively used)

## 🎯 Roadmap

### Near Term

- [ ] Chrome Web Store submission
- [ ] Enhanced memory categorization
- [ ] Export/import functionality
- [ ] Keyboard shortcuts

### Long Term

- [ ] Mobile app companion
- [ ] Team sharing capabilities
- [ ] Advanced analytics dashboard
- [ ] Integration with other browsers

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **CrewAI**: Multi-agent AI framework
- **Google Gemini**: Powerful and free AI model
- **Google Cloud**: Reliable backend infrastructure
- **Chrome Extensions**: Platform for browser enhancement

---

**Built for the Google ADK Hackathon 2025** 🏆

_Transform your browsing into intelligent conversations._
