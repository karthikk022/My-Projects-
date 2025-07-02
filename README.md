# 🤖 AI Super App

A powerful AI-powered super app that integrates multiple intelligent agents to help users complete daily tasks effortlessly — such as food ordering, travel booking, cab rides, shopping, and more — through a single unified interface.

## 🌟 Features

### 🧩 Multi-Agent AI System
- **Foodie AI** 🍽️ - Order food from restaurants, get recommendations, track deliveries
- **RideNow AI** 🚗 - Book cabs, get fare estimates, track rides, schedule trips  
- **TravelBuddy AI** ✈️ - Book flights, hotels, plan itineraries (Coming Soon)
- **ShopSmart AI** 🛍️ - Online shopping, product recommendations (Coming Soon)
- **Grocer AI** 🛒 - Grocery shopping, household items (Coming Soon)
- **AskMe AI** 💬 - General Q&A chatbot for daily help

### 🎯 Key Capabilities
- **Smart Unified Chat Interface** - Single conversational UI powered by context-aware LLM
- **Voice & Text Input** - Speech-to-text for voice-based conversations (Coming Soon)
- **User Profile & Preferences** - Save delivery addresses, payment methods, dietary preferences
- **Secure Payments Integration** - UPI, Credit/Debit, Wallets, BNPL support
- **Real-Time Status Updates** - Live tracking for orders, rides, and bookings
- **Multi-Language Support** - English, Hindi, and more (Coming Soon)
- **Agent Handoffs** - Seamless switching between specialized agents

## 🏗️ Architecture

### Backend (Node.js + Express)
- **AI Agent Manager** - Central routing system for multiple AI agents
- **Authentication System** - JWT-based secure authentication
- **Database** - MongoDB with comprehensive user profiles
- **Real-time Communication** - Socket.IO for live updates
- **Logging & Monitoring** - Winston logger with structured logging
- **Error Handling** - Comprehensive error management

### Frontend (React Native)
- **Cross-platform Mobile App** - iOS and Android support
- **Modern UI/UX** - Beautiful and intuitive interface
- **Real-time Chat** - Gifted Chat integration
- **Voice Input** - Speech recognition (Coming Soon)
- **Push Notifications** - Real-time alerts and updates

### AI Integration
- **OpenAI GPT-4** - Natural language processing
- **Intent Classification** - Smart agent routing
- **Context Management** - Conversation memory and history
- **Personalization** - User preference-based responses

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB
- OpenAI API Key
- React Native development environment

### Backend Setup

1. **Clone and Install**
```bash
git clone <repository-url>
cd ai-super-app
npm install
```

2. **Environment Setup**
```bash
cd server
cp .env.example .env
# Edit .env with your configuration
```

3. **Required Environment Variables**
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/ai-super-app

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4

# Payment Gateway
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
```

4. **Start Backend Server**
```bash
cd server
npm run dev
```

### Mobile App Setup

1. **Install Dependencies**
```bash
cd mobile
npm install
```

2. **iOS Setup**
```bash
cd ios && pod install && cd ..
```

3. **Start Metro Bundler**
```bash
npm start
```

4. **Run on Device**
```bash
# iOS
npm run ios

# Android  
npm run android
```

## 📱 Usage Examples

### Food Ordering
```
User: "Order me a burger from McDonald's"
Foodie AI: "I found several McDonald's locations near you..."
```

### Ride Booking
```
User: "Book a cab to the airport at 6 AM tomorrow"
RideNow AI: "I'll help you book a ride to the airport..."
```

### General Help
```
User: "How does this app work?"
AskMe AI: "I'm here to help! This app has multiple AI agents..."
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile

### Chat & Agents
- `POST /api/chat/message` - Send message to AI agents
- `GET /api/chat/agents` - Get available agents
- `GET /api/chat/context` - Get conversation context
- `POST /api/chat/handoff` - Request agent handoff

### User Management
- `GET /api/user/dashboard` - User dashboard data
- `POST /api/user/addresses` - Add address
- `PUT /api/user/favorite-agents` - Update favorite agents

## 🎯 Agent Capabilities

### Foodie AI
- Restaurant search and recommendations
- Menu browsing and filtering
- Order placement and tracking
- Dietary preference handling
- Real-time delivery tracking

### RideNow AI
- Instant cab booking
- Fare estimation and comparison
- Live ride tracking
- Scheduled ride booking
- Driver details and contact

### AskMe AI
- General app guidance
- Feature explanations
- Agent switching assistance
- Technical support
- Casual conversation

## 🔒 Security Features

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt encryption
- **Rate Limiting** - Request throttling
- **Input Validation** - Comprehensive validation
- **Error Handling** - Secure error responses
- **Account Lockout** - Brute force protection

## 📊 Monitoring & Analytics

- **Structured Logging** - Winston-based logging
- **User Activity Tracking** - Detailed analytics
- **Agent Performance Metrics** - Usage statistics
- **Error Monitoring** - Comprehensive error tracking
- **Business Metrics** - Order and usage analytics

## 🗓️ Roadmap

### Phase 1 (Current) ✅
- ✅ Chat + Foodie AI + RideNow AI
- ✅ Basic authentication
- ✅ User profiles and preferences

### Phase 2 (In Progress) 🚧
- 🚧 TravelBuddy AI + Payment integration
- 🚧 Real-time notifications
- 🚧 Voice input/output

### Phase 3 (Upcoming) 📋
- 📋 ShopSmart AI + Grocer AI
- 📋 Advanced personalization
- 📋 Multi-language support

### Phase 4 (Future) 🔮
- 🔮 Third-party agent plugins
- 🔮 Open AI marketplace
- 🔮 Advanced analytics dashboard

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- React Native community
- MongoDB team
- All open source contributors

---

**Target Audience:** Urban users aged 18–45 who are tech-savvy and seek convenience through automation.

**Vision:** To create the ultimate AI-powered super app that makes daily tasks effortless through intelligent conversation.