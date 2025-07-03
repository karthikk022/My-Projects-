const { logger } = require('../utils/logger');

class BaseAgent {
  constructor(openai, agentName, capabilities = []) {
    this.openai = openai;
    this.agentName = agentName;
    this.capabilities = capabilities;
    this.isActive = true;
    this.lastActivity = Date.now();
  }

  async processMessage(message, context, userProfile) {
    throw new Error('processMessage method must be implemented by subclass');
  }

  async canHandle(message, context) {
    // Default implementation - can be overridden by subclasses
    return true;
  }

  async handleHandoff(handoffContext, conversationContext) {
    // Default handoff handler
    const welcomeMessage = await this.generateWelcomeMessage(handoffContext);
    return {
      message: welcomeMessage,
      actions: [],
      suggestions: await this.generateSuggestions(handoffContext, conversationContext)
    };
  }

  async generateWelcomeMessage(handoffContext) {
    return `Hi! I'm ${this.agentName}. I can help you with ${this.capabilities.join(', ')}. How can I assist you today?`;
  }

  async generateSuggestions(context, conversationContext) {
    // Override in subclasses to provide relevant suggestions
    return [];
  }

  async handleError(message, error) {
    logger.error(`Error in ${this.agentName}:`, error);
    return {
      message: `I apologize, but I'm having trouble processing your request. Let me try to help you in a different way.`,
      error: true
    };
  }

  async analyzeIntent(message, context) {
    try {
      const systemPrompt = `You are ${this.agentName}, an AI assistant specialized in ${this.capabilities.join(', ')}.
      Analyze the user's message and extract key information relevant to your domain.
      
      Return a JSON object with:
      - intent: the main intent/action the user wants
      - entities: key pieces of information extracted
      - confidence: confidence level (0-1)
      - requiresAction: boolean indicating if this requires external API calls
      `;

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 200,
        temperature: 0.1
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      logger.error('Error analyzing intent:', error);
      return {
        intent: 'unknown',
        entities: {},
        confidence: 0,
        requiresAction: false
      };
    }
  }

  async generateResponse(prompt, context = {}, maxTokens = 150) {
    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: context.message || '' }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      });

      return response.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating response:', error);
      throw error;
    }
  }

  formatResponse(message, actions = [], suggestions = [], metadata = {}) {
    return {
      message,
      actions,
      suggestions,
      metadata: {
        agent: this.agentName,
        timestamp: Date.now(),
        ...metadata
      }
    };
  }

  createHandoff(targetAgent, reason, context = {}, autoHandoff = false) {
    return {
      handoff: {
        targetAgent,
        reason,
        context: {
          fromAgent: this.agentName,
          ...context
        },
        autoHandoff
      }
    };
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  getStatus() {
    return {
      name: this.agentName,
      capabilities: this.capabilities,
      isActive: this.isActive,
      lastActivity: this.lastActivity
    };
  }

  // Utility methods for common tasks
  extractLocation(message) {
    // Simple location extraction - can be enhanced with NLP
    const locationPatterns = [
      /(?:to|at|in|near|from)\s+([A-Za-z\s]+?)(?:\s|$|,|\.|!|\?)/gi,
      /([A-Za-z\s]+?)\s+(?:airport|station|mall|hotel|restaurant)/gi
    ];

    for (const pattern of locationPatterns) {
      const matches = message.match(pattern);
      if (matches) {
        return matches[0].replace(/^(to|at|in|near|from)\s+/i, '').trim();
      }
    }
    return null;
  }

  extractTime(message) {
    // Simple time extraction patterns
    const timePatterns = [
      /(?:at|by|around)\s+(\d{1,2}:\d{2}(?:\s*[ap]m)?)/gi,
      /(?:at|by|around)\s+(\d{1,2}\s*[ap]m)/gi,
      /(tomorrow|today|tonight|morning|afternoon|evening)/gi,
      /(\d{1,2}:\d{2})/gi
    ];

    for (const pattern of timePatterns) {
      const matches = message.match(pattern);
      if (matches) {
        return matches[0];
      }
    }
    return null;
  }

  extractPrice(message) {
    // Extract price/budget information
    const pricePatterns = [
      /₹\s*(\d+(?:,\d+)*(?:\.\d{2})?)/gi,
      /(?:under|below|less than|within)\s*₹?\s*(\d+(?:,\d+)*)/gi,
      /budget\s*of\s*₹?\s*(\d+(?:,\d+)*)/gi
    ];

    for (const pattern of pricePatterns) {
      const matches = message.match(pattern);
      if (matches) {
        return matches[1] || matches[0];
      }
    }
    return null;
  }

  validateRequired(data, requiredFields) {
    const missing = [];
    for (const field of requiredFields) {
      if (!data[field]) {
        missing.push(field);
      }
    }
    return missing;
  }
}

module.exports = BaseAgent;