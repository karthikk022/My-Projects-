const OpenAI = require('openai');
const { logger } = require('../utils/logger');
const FoodieAgent = require('./FoodieAgent');
const RideNowAgent = require('./RideNowAgent');
const TravelBuddyAgent = require('./TravelBuddyAgent');
const ShopSmartAgent = require('./ShopSmartAgent');
const GrocerAgent = require('./GrocerAgent');
const AskMeAgent = require('./AskMeAgent');

class AgentManager {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.agents = new Map();
    this.conversationContext = new Map(); // userId -> context
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize all agents
      this.agents.set('foodie', new FoodieAgent(this.openai));
      this.agents.set('ridenow', new RideNowAgent(this.openai));
      this.agents.set('travelbuddy', new TravelBuddyAgent(this.openai));
      this.agents.set('shopsmart', new ShopSmartAgent(this.openai));
      this.agents.set('grocer', new GrocerAgent(this.openai));
      this.agents.set('askme', new AskMeAgent(this.openai));
      
      logger.info('All AI agents initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize agents:', error);
      throw error;
    }
  }

  async processMessage(userId, message, userProfile = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Get or create conversation context
      let context = this.conversationContext.get(userId) || {
        currentAgent: null,
        history: [],
        handoffRequested: false,
        lastActivity: Date.now()
      };

      // Update context
      context.lastActivity = Date.now();
      context.history.push({
        type: 'user',
        content: message,
        timestamp: Date.now()
      });

      // Determine which agent should handle this message
      const agentType = await this.determineAgent(message, context, userProfile);
      
      // Switch agent if needed
      if (context.currentAgent !== agentType) {
        if (context.currentAgent) {
          logger.info(`Switching from ${context.currentAgent} to ${agentType} for user ${userId}`);
        }
        context.currentAgent = agentType;
      }

      // Get the appropriate agent
      const agent = this.agents.get(agentType);
      if (!agent) {
        throw new Error(`Agent ${agentType} not found`);
      }

      // Process the message with the selected agent
      const response = await agent.processMessage(message, context, userProfile);
      
      // Update context with response
      context.history.push({
        type: 'agent',
        agent: agentType,
        content: response.message,
        timestamp: Date.now(),
        metadata: response.metadata || {}
      });

      // Handle agent handoffs
      if (response.handoff) {
        context.handoffRequested = true;
        context.handoffTarget = response.handoff.targetAgent;
        context.handoffReason = response.handoff.reason;
        
        // Process handoff immediately if auto-handoff is enabled
        if (response.handoff.autoHandoff) {
          return await this.processHandoff(userId, response.handoff.targetAgent, response.handoff.context);
        }
      }

      // Save updated context
      this.conversationContext.set(userId, context);

      // Clean up old contexts (older than 24 hours)
      this.cleanupOldContexts();

      return {
        agent: agentType,
        message: response.message,
        actions: response.actions || [],
        suggestions: response.suggestions || [],
        handoff: response.handoff || null,
        metadata: response.metadata || {}
      };

    } catch (error) {
      logger.error('Error processing message:', error);
      
      // Fallback to AskMe agent for error handling
      const askMeAgent = this.agents.get('askme');
      if (askMeAgent) {
        const fallbackResponse = await askMeAgent.handleError(message, error);
        return {
          agent: 'askme',
          message: fallbackResponse.message,
          error: true,
          originalError: error.message
        };
      }
      
      throw error;
    }
  }

  async determineAgent(message, context, userProfile) {
    try {
      // If there's a current agent and no handoff requested, continue with it
      if (context.currentAgent && !context.handoffRequested) {
        const currentAgent = this.agents.get(context.currentAgent);
        if (currentAgent && await currentAgent.canHandle(message, context)) {
          return context.currentAgent;
        }
      }

      // Use OpenAI to classify the intent
      const systemPrompt = `You are an intent classifier for a super app with multiple AI agents. 
      Analyze the user's message and determine which agent should handle it.

      Available agents:
      - foodie: Food ordering, restaurant recommendations, dining
      - ridenow: Cab/taxi booking, ride sharing, transportation
      - travelbuddy: Flight/hotel booking, travel planning, itineraries
      - shopsmart: Online shopping, product recommendations, fashion
      - grocer: Grocery shopping, household items
      - askme: General questions, chat, anything not fitting other categories

      Consider the conversation context and user profile for better accuracy.
      
      Respond with only the agent name (lowercase).`;

      const contextInfo = context.history.length > 0 
        ? `Recent conversation: ${context.history.slice(-3).map(h => `${h.type}: ${h.content}`).join('\n')}`
        : 'No previous context';

      const userInfo = userProfile 
        ? `User preferences: ${JSON.stringify(userProfile.preferences || {})}`
        : 'No user profile available';

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Message: "${message}"\n\n${contextInfo}\n\n${userInfo}` }
        ],
        max_tokens: 50,
        temperature: 0.1
      });

      const agentType = response.choices[0].message.content.trim().toLowerCase();
      
      // Validate agent exists
      if (!this.agents.has(agentType)) {
        logger.warn(`Unknown agent type: ${agentType}, defaulting to askme`);
        return 'askme';
      }

      return agentType;
    } catch (error) {
      logger.error('Error determining agent:', error);
      return 'askme'; // Default fallback
    }
  }

  async processHandoff(userId, targetAgent, handoffContext = {}) {
    try {
      const context = this.conversationContext.get(userId);
      if (!context) {
        throw new Error('No conversation context found for handoff');
      }

      // Clear handoff flags
      context.handoffRequested = false;
      context.handoffTarget = null;
      context.handoffReason = null;

      // Switch to target agent
      context.currentAgent = targetAgent;

      // Add handoff context to conversation
      context.handoffContext = handoffContext;

      const agent = this.agents.get(targetAgent);
      if (!agent) {
        throw new Error(`Target agent ${targetAgent} not found`);
      }

      // Process handoff with target agent
      const response = await agent.handleHandoff(handoffContext, context);

      // Update context
      context.history.push({
        type: 'handoff',
        fromAgent: handoffContext.fromAgent || 'unknown',
        toAgent: targetAgent,
        content: response.message,
        timestamp: Date.now(),
        metadata: response.metadata || {}
      });

      this.conversationContext.set(userId, context);

      return {
        agent: targetAgent,
        message: response.message,
        actions: response.actions || [],
        suggestions: response.suggestions || [],
        handoff: true,
        metadata: response.metadata || {}
      };
    } catch (error) {
      logger.error('Error processing handoff:', error);
      throw error;
    }
  }

  getUserContext(userId) {
    return this.conversationContext.get(userId) || null;
  }

  clearUserContext(userId) {
    this.conversationContext.delete(userId);
  }

  cleanupOldContexts() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (const [userId, context] of this.conversationContext.entries()) {
      if (context.lastActivity < cutoffTime) {
        this.conversationContext.delete(userId);
        logger.info(`Cleaned up old context for user ${userId}`);
      }
    }
  }

  getAvailableAgents() {
    return Array.from(this.agents.keys());
  }

  getAgentStatus() {
    const status = {};
    for (const [name, agent] of this.agents.entries()) {
      status[name] = {
        initialized: !!agent,
        active: agent.isActive ? agent.isActive() : true
      };
    }
    return status;
  }
}

// Singleton instance
const agentManager = new AgentManager();

module.exports = {
  agentManager,
  initializeAgents: () => agentManager.initialize(),
  processMessage: (userId, message, userProfile) => agentManager.processMessage(userId, message, userProfile),
  getUserContext: (userId) => agentManager.getUserContext(userId),
  clearUserContext: (userId) => agentManager.clearUserContext(userId),
  getAvailableAgents: () => agentManager.getAvailableAgents(),
  getAgentStatus: () => agentManager.getAgentStatus()
};