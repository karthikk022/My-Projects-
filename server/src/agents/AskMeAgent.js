const BaseAgent = require('./BaseAgent');
const { logger } = require('../utils/logger');

class AskMeAgent extends BaseAgent {
  constructor(openai) {
    super(openai, 'AskMe AI', [
      'general questions',
      'casual conversation',
      'help and support',
      'information lookup',
      'recommendations'
    ]);
  }

  async processMessage(message, context, userProfile) {
    this.updateActivity();
    
    try {
      // Analyze the user's intent
      const analysis = await this.analyzeIntent(message, context);
      
      // Process based on intent
      switch (analysis.intent) {
        case 'greeting':
          return await this.handleGreeting(message, userProfile);
        
        case 'help_request':
          return await this.handleHelpRequest(message, analysis, userProfile);
        
        case 'app_features':
          return await this.handleAppFeatures(message, analysis);
        
        case 'agent_information':
          return await this.handleAgentInformation(message, analysis);
        
        case 'recommendation_request':
          return await this.handleRecommendations(message, analysis, userProfile);
        
        case 'casual_chat':
          return await this.handleCasualChat(message, analysis, userProfile);
        
        case 'complaint_feedback':
          return await this.handleComplaintFeedback(message, analysis, userProfile);
        
        case 'technical_support':
          return await this.handleTechnicalSupport(message, analysis);
        
        default:
          return await this.handleGeneralQuery(message, analysis, userProfile);
      }
    } catch (error) {
      logger.error('Error in AskMeAgent:', error);
      return this.handleError(message, error);
    }
  }

  async handleGreeting(message, userProfile) {
    const userName = userProfile?.name || 'there';
    const timeOfDay = this.getTimeGreeting();
    
    const personalizedGreeting = `${timeOfDay}, ${userName}! 👋 I'm AskMe AI, your helpful assistant. I'm here to help with any questions you have or assist you in navigating our super app.`;
    
    return this.formatResponse(
      personalizedGreeting,
      [{ type: 'quick_actions', actions: ['Show app features', 'Get help', 'Talk to agents'] }],
      [
        "What can you help me with?",
        "Show me app features",
        "Order food",
        "Book a ride",
        "How does this app work?"
      ]
    );
  }

  async handleHelpRequest(message, analysis, userProfile) {
    const helpCategories = {
      'account': {
        title: 'Account Help',
        description: 'Manage your profile, settings, and preferences',
        actions: ['Update profile', 'Change password', 'Manage addresses']
      },
      'agents': {
        title: 'AI Agents Guide',
        description: 'Learn about our specialized AI assistants',
        actions: ['Foodie AI help', 'RideNow AI help', 'Travel Buddy help']
      },
      'orders': {
        title: 'Orders & Bookings',
        description: 'Track your orders, rides, and bookings',
        actions: ['Track order', 'View history', 'Cancel booking']
      },
      'payments': {
        title: 'Payment Support',
        description: 'Payment methods, refunds, and billing',
        actions: ['Add payment method', 'Request refund', 'View transactions']
      },
      'technical': {
        title: 'Technical Support',
        description: 'App issues, bugs, and troubleshooting',
        actions: ['Report bug', 'App not working', 'Contact support']
      }
    };

    const helpMenu = Object.values(helpCategories).map(cat => 
      `🔹 **${cat.title}**\n${cat.description}`
    ).join('\n\n');

    return this.formatResponse(
      `I'm here to help! Here are the main areas I can assist you with:\n\n${helpMenu}\n\nWhat specific help do you need?`,
      [
        { type: 'help_categories', categories: helpCategories }
      ],
      [
        "Account help",
        "How to use agents",
        "Track my orders",
        "Payment issues",
        "App problems"
      ]
    );
  }

  async handleAppFeatures(message, analysis) {
    const features = [
      {
        name: 'Foodie AI 🍽️',
        description: 'Order food from restaurants, get recommendations, track deliveries',
        capabilities: ['Restaurant search', 'Menu browsing', 'Order tracking', 'Dietary preferences']
      },
      {
        name: 'RideNow AI 🚗',
        description: 'Book cabs, get fare estimates, track rides, schedule trips',
        capabilities: ['Instant booking', 'Fare comparison', 'Live tracking', 'Scheduled rides']
      },
      {
        name: 'Travel Buddy AI ✈️',
        description: 'Book flights, hotels, plan itineraries (Coming Soon)',
        capabilities: ['Flight booking', 'Hotel search', 'Trip planning', 'Travel recommendations']
      },
      {
        name: 'ShopSmart AI 🛍️',
        description: 'Online shopping, product recommendations (Coming Soon)',
        capabilities: ['Product search', 'Price comparison', 'Style recommendations', 'Deal alerts']
      },
      {
        name: 'Grocer AI 🛒',
        description: 'Grocery shopping, household items (Coming Soon)',
        capabilities: ['Grocery lists', 'Store comparison', 'Fresh produce', 'Quick delivery']
      }
    ];

    const featuresText = features.map(feature => 
      `**${feature.name}**\n${feature.description}\n• ${feature.capabilities.join(' • ')}`
    ).join('\n\n');

    return this.formatResponse(
      `🌟 **Our AI Super App Features:**\n\n${featuresText}\n\nEach agent is specialized to help you with specific tasks. Just talk naturally and I'll connect you to the right agent!`,
      [
        { type: 'feature_showcase', features }
      ],
      [
        "Try Foodie AI",
        "Book a ride",
        "How to switch agents",
        "What's coming soon?"
      ]
    );
  }

  async handleAgentInformation(message, analysis) {
    const agentInfo = {
      'foodie': {
        name: 'Foodie AI',
        expertise: 'Food ordering and restaurant recommendations',
        commands: ['order food', 'find restaurants', 'track my order'],
        tips: 'Tell me your location and food preferences for better recommendations'
      },
      'ridenow': {
        name: 'RideNow AI',
        expertise: 'Cab booking and transportation',
        commands: ['book a ride', 'get fare estimate', 'track my ride'],
        tips: 'Specify pickup and destination for quick booking'
      },
      'askme': {
        name: 'AskMe AI (that\'s me!)',
        expertise: 'General help and app navigation',
        commands: ['help', 'app features', 'how to use'],
        tips: 'Ask me anything about the app or get help with any feature'
      }
    };

    const infoText = Object.values(agentInfo).map(agent => 
      `🤖 **${agent.name}**\n${agent.expertise}\n\n**Try saying:** "${agent.commands.join('", "')}\"\n\n💡 **Tip:** ${agent.tips}`
    ).join('\n\n---\n\n');

    return this.formatResponse(
      `Here's information about our AI agents:\n\n${infoText}\n\n**Agent Switching:** You can switch between agents anytime by mentioning what you need. I'll automatically connect you to the right specialist!`,
      [
        { type: 'agent_info', agents: agentInfo }
      ],
      [
        "Switch to Foodie AI",
        "Switch to RideNow AI",
        "How to switch agents",
        "What else can you do?"
      ]
    );
  }

  async handleRecommendations(message, analysis, userProfile) {
    const hour = new Date().getHours();
    const recommendations = [];

    // Time-based recommendations
    if (hour >= 6 && hour < 12) {
      recommendations.push({
        type: 'morning',
        title: 'Good Morning Suggestions',
        items: [
          'Order breakfast from nearby cafes',
          'Book a cab to work',
          'Check weather for travel plans'
        ]
      });
    } else if (hour >= 12 && hour < 17) {
      recommendations.push({
        type: 'afternoon',
        title: 'Afternoon Activities',
        items: [
          'Order lunch from popular restaurants',
          'Book grocery delivery for evening',
          'Plan your commute home'
        ]
      });
    } else if (hour >= 17 && hour < 22) {
      recommendations.push({
        type: 'evening',
        title: 'Evening Suggestions',
        items: [
          'Order dinner or cooking ingredients',
          'Book entertainment or dining reservations',
          'Plan tomorrow\'s schedule'
        ]
      });
    }

    // User history-based recommendations
    if (userProfile?.favoriteAgents?.length > 0) {
      recommendations.push({
        type: 'favorites',
        title: 'Based on Your Usage',
        items: userProfile.favoriteAgents.map(agent => 
          `Continue with ${agent.charAt(0).toUpperCase() + agent.slice(1)} AI`)
      });
    }

    // New user recommendations
    if (userProfile?.totalOrders === 0) {
      recommendations.push({
        type: 'new_user',
        title: 'Getting Started',
        items: [
          'Try ordering your first meal',
          'Set up your addresses and preferences',
          'Explore different AI agents'
        ]
      });
    }

    const recText = recommendations.map(rec => 
      `**${rec.title}**\n• ${rec.items.join('\n• ')}`
    ).join('\n\n');

    return this.formatResponse(
      `Here are some personalized recommendations for you:\n\n${recText}\n\nWhat would you like to try?`,
      [
        { type: 'recommendations', data: recommendations }
      ],
      [
        "Order food now",
        "Book a ride",
        "Explore features",
        "Set up preferences"
      ]
    );
  }

  async handleCasualChat(message, analysis, userProfile) {
    const chatPrompt = `You are AskMe AI, a friendly and helpful assistant in a super app. 
    The user said: "${message}"
    
    Respond in a conversational, helpful manner. Keep it engaging and try to guide them to useful features of the app when appropriate. 
    Be warm, personable, and show genuine interest in helping them.
    
    User context: ${userProfile ? `Name: ${userProfile.name}, Total orders: ${userProfile.totalOrders}` : 'New user'}`;

    const response = await this.generateResponse(chatPrompt, { message }, 200);

    return this.formatResponse(
      response,
      [],
      [
        "What can you help me with?",
        "Show app features",
        "Get recommendations",
        "How does this work?"
      ]
    );
  }

  async handleComplaintFeedback(message, analysis, userProfile) {
    const response = `I understand your concern and I want to help resolve this for you. Your feedback is important to us for improving our service.

Here's what I can do to help:

🔸 **Immediate Support:** I can try to address your issue right now
🔸 **Escalate to Specialists:** Connect you with the relevant team
🔸 **Track Issues:** Help you track resolution progress
🔸 **Feedback Recording:** Ensure your feedback reaches the right people

Could you please provide more details about the specific issue you're experiencing?`;

    return this.formatResponse(
      response,
      [
        { type: 'support_options', categories: ['Order issue', 'Payment problem', 'App bug', 'Service quality', 'Other'] }
      ],
      [
        "Order not delivered",
        "Payment failed",
        "App is slow",
        "Poor service quality",
        "Speak to human agent"
      ]
    );
  }

  async handleTechnicalSupport(message, analysis) {
    const troubleshooting = {
      'app_slow': [
        'Close and restart the app',
        'Check your internet connection',
        'Clear app cache',
        'Update to latest version'
      ],
      'login_issues': [
        'Check email/password spelling',
        'Reset password if needed',
        'Clear browser cache',
        'Try different network'
      ],
      'payment_failed': [
        'Check card details',
        'Verify sufficient balance',
        'Try different payment method',
        'Contact bank if needed'
      ],
      'notifications': [
        'Check notification settings',
        'Allow app permissions',
        'Check device settings',
        'Restart device'
      ]
    };

    const troubleshootingText = Object.entries(troubleshooting).map(([issue, steps]) => 
      `**${issue.replace('_', ' ').toUpperCase()}:**\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
    ).join('\n\n');

    return this.formatResponse(
      `Here are some common technical issues and solutions:\n\n${troubleshootingText}\n\nIf these don't help, I can connect you with our technical support team.`,
      [
        { type: 'troubleshooting', steps: troubleshooting }
      ],
      [
        "App is slow",
        "Can't login",
        "Payment not working",
        "No notifications",
        "Contact tech support"
      ]
    );
  }

  async handleGeneralQuery(message, analysis, userProfile) {
    const generalPrompt = `You are AskMe AI, a helpful assistant for a super app with multiple AI agents for food ordering, ride booking, travel, shopping, etc.
    
    The user asked: "${message}"
    
    Provide a helpful response. If their question relates to specific services (food, rides, travel, shopping), mention the relevant AI agent that can help them better. 
    Be informative, friendly, and guide them to the right resources.`;

    const response = await this.generateResponse(generalPrompt, { message }, 250);

    return this.formatResponse(
      response,
      [],
      [
        "Connect me to right agent",
        "How does this app work?",
        "Show me features",
        "Get help"
      ]
    );
  }

  getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 22) return 'Good evening';
    return 'Hello';
  }

  async generateSuggestions(context, conversationContext) {
    return [
      "How can I help you?",
      "Show app features",
      "Get recommendations",
      "Connect to specialist agent",
      "Technical support"
    ];
  }

  async canHandle(message, context) {
    // AskMeAgent can handle anything, it's the fallback agent
    return true;
  }

  async handleHandoff(handoffContext, conversationContext) {
    const fromAgent = handoffContext.fromAgent;
    const welcomeMessage = `Hi! I'm AskMe AI. I've taken over from ${fromAgent} to help you with general questions or guide you to other services. What can I help you with?`;
    
    return {
      message: welcomeMessage,
      actions: [
        { type: 'agent_handoff_complete', fromAgent, toAgent: 'AskMe AI' }
      ],
      suggestions: [
        "What can you help me with?",
        "Show app features",
        "Get recommendations",
        "How to use other agents"
      ]
    };
  }

  // Error handling with helpful suggestions
  async handleError(message, error) {
    logger.error(`Error in AskMeAgent:`, error);
    
    return this.formatResponse(
      `I apologize, but I encountered an issue while processing your request. Let me try to help you in a different way. 

Here are some things I can definitely help you with:
• General questions about the app
• Connecting you to specialized agents
• App features and guidance
• Troubleshooting common issues

What would you like to try?`,
      [],
      [
        "Try again",
        "Show app features", 
        "Connect to food agent",
        "Connect to ride agent",
        "Get help"
      ]
    );
  }
}

module.exports = AskMeAgent;