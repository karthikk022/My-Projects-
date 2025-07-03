const express = require('express');
const { catchAsync } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { 
  processMessage, 
  getUserContext, 
  clearUserContext, 
  getAvailableAgents, 
  getAgentStatus 
} = require('../agents/agentManager');
const User = require('../models/User');
const { structuredLogger } = require('../utils/logger');

const router = express.Router();

// Get available agents
router.get('/agents', catchAsync(async (req, res) => {
  const agents = getAvailableAgents();
  const agentStatus = getAgentStatus();
  
  res.status(200).json({
    success: true,
    data: {
      agents,
      status: agentStatus
    }
  });
}));

// Send message to AI agents
router.post('/message', authenticate, catchAsync(async (req, res) => {
  const { message, agentPreference } = req.body;
  const userId = req.user.id;
  
  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required'
    });
  }

  // Get user profile for personalization
  const userProfile = await User.findById(userId);
  
  // Log user activity
  structuredLogger.userAction(userId, 'send_message', {
    messageLength: message.length,
    agentPreference
  });

  // Process message with AI agents
  const response = await processMessage(userId, message, userProfile);
  
  // Get the Socket.IO instance to send real-time updates
  const io = req.app.get('io');
  
  // Send real-time response to user
  io.to(`user-${userId}`).emit('agent-response', {
    ...response,
    timestamp: Date.now()
  });

  // Log agent activity
  structuredLogger.agentActivity(
    response.agent, 
    'send_response', 
    userId, 
    { 
      messageLength: response.message.length,
      hasActions: response.actions && response.actions.length > 0,
      suggestionCount: response.suggestions ? response.suggestions.length : 0
    }
  );

  res.status(200).json({
    success: true,
    data: response
  });
}));

// Get conversation context/history
router.get('/context', authenticate, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const context = getUserContext(userId);
  
  res.status(200).json({
    success: true,
    data: {
      context: context || null,
      hasActiveConversation: !!context
    }
  });
}));

// Clear conversation context
router.delete('/context', authenticate, catchAsync(async (req, res) => {
  const userId = req.user.id;
  clearUserContext(userId);
  
  structuredLogger.userAction(userId, 'clear_context');
  
  res.status(200).json({
    success: true,
    message: 'Conversation context cleared'
  });
}));

// Get chat history (from user profile)
router.get('/history', authenticate, catchAsync(async (req, res) => {
  const { limit = 50, agent } = req.query;
  const userId = req.user.id;
  
  const user = await User.findById(userId);
  let history = user.conversationHistory || [];
  
  // Filter by agent if specified
  if (agent) {
    history = history.filter(h => h.agentType === agent);
  }
  
  // Sort by timestamp (newest first) and limit
  history = history
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, parseInt(limit));
  
  res.status(200).json({
    success: true,
    data: {
      history,
      total: history.length
    }
  });
}));

// Save conversation to history
router.post('/history', authenticate, catchAsync(async (req, res) => {
  const { agentType, context } = req.body;
  const userId = req.user.id;
  
  if (!agentType || !context) {
    return res.status(400).json({
      success: false,
      message: 'Agent type and context are required'
    });
  }
  
  const user = await User.findById(userId);
  
  // Add to conversation history
  user.conversationHistory.push({
    agentType,
    context,
    timestamp: new Date()
  });
  
  // Keep only last 100 conversations per user
  if (user.conversationHistory.length > 100) {
    user.conversationHistory = user.conversationHistory.slice(-100);
  }
  
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Conversation saved to history'
  });
}));

// Agent handoff endpoint
router.post('/handoff', authenticate, catchAsync(async (req, res) => {
  const { targetAgent, reason, context } = req.body;
  const userId = req.user.id;
  
  if (!targetAgent) {
    return res.status(400).json({
      success: false,
      message: 'Target agent is required for handoff'
    });
  }
  
  // Get user profile
  const userProfile = await User.findById(userId);
  
  // Process handoff message
  const handoffMessage = `Hand me over to ${targetAgent}`;
  const response = await processMessage(userId, handoffMessage, userProfile);
  
  // Log handoff
  structuredLogger.handoff(
    response.metadata?.fromAgent || 'unknown',
    targetAgent,
    userId,
    reason || 'User requested handoff'
  );
  
  // Send real-time update
  const io = req.app.get('io');
  io.to(`user-${userId}`).emit('agent-handoff', {
    targetAgent,
    reason,
    response
  });
  
  res.status(200).json({
    success: true,
    data: response
  });
}));

// Voice message processing
router.post('/voice', authenticate, catchAsync(async (req, res) => {
  const { audioData, duration } = req.body;
  const userId = req.user.id;
  
  if (!audioData) {
    return res.status(400).json({
      success: false,
      message: 'Audio data is required'
    });
  }
  
  // TODO: Implement speech-to-text conversion
  // For now, return a placeholder response
  const transcribedText = "Voice message received - speech-to-text processing not implemented yet";
  
  structuredLogger.userAction(userId, 'send_voice_message', {
    duration: duration || 0
  });
  
  res.status(200).json({
    success: true,
    data: {
      transcribedText,
      message: "Voice processing will be implemented in future updates"
    }
  });
}));

// Get agent recommendations based on user activity
router.get('/recommendations', authenticate, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  
  // Simple recommendation logic based on favorite agents and recent activity
  const recommendations = [];
  
  if (user.favoriteAgents && user.favoriteAgents.length > 0) {
    recommendations.push({
      type: 'favorite',
      agents: user.favoriteAgents,
      message: 'Your favorite agents'
    });
  }
  
  // Time-based recommendations
  const hour = new Date().getHours();
  if (hour >= 11 && hour <= 14) {
    recommendations.push({
      type: 'time-based',
      agents: ['foodie'],
      message: 'Lunch time! Order some food?'
    });
  } else if (hour >= 18 && hour <= 21) {
    recommendations.push({
      type: 'time-based',
      agents: ['foodie', 'grocer'],
      message: 'Dinner time! Order food or groceries?'
    });
  }
  
  // Activity-based recommendations
  if (user.totalOrders === 0) {
    recommendations.push({
      type: 'new-user',
      agents: ['foodie', 'ridenow'],
      message: 'Welcome! Try ordering food or booking a ride'
    });
  }
  
  res.status(200).json({
    success: true,
    data: {
      recommendations
    }
  });
}));

// Chat statistics
router.get('/stats', authenticate, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  
  // Calculate statistics from conversation history
  const agentUsage = {};
  const totalConversations = user.conversationHistory.length;
  
  user.conversationHistory.forEach(conv => {
    agentUsage[conv.agentType] = (agentUsage[conv.agentType] || 0) + 1;
  });
  
  const mostUsedAgent = Object.keys(agentUsage).reduce((a, b) => 
    agentUsage[a] > agentUsage[b] ? a : b, null
  );
  
  res.status(200).json({
    success: true,
    data: {
      totalConversations,
      agentUsage,
      mostUsedAgent,
      joinDate: user.createdAt,
      lastActive: user.lastActive
    }
  });
}));

module.exports = router;