const express = require('express');
const { validationResult, body } = require('express-validator');
const { catchAsync, createValidationError } = require('../middleware/errorHandler');
const { authenticate, requireVerification } = require('../middleware/auth');
const User = require('../models/User');
const { structuredLogger } = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get user dashboard data
router.get('/dashboard', catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  // Calculate dashboard metrics
  const dashboardData = {
    profile: {
      name: user.name,
      profilePicture: user.profilePicture,
      subscriptionTier: user.subscriptionTier,
      isVerified: user.isVerified
    },
    activity: {
      totalOrders: user.totalOrders,
      totalSpent: user.totalSpent,
      favoriteAgents: user.favoriteAgents,
      lastActive: user.lastActive,
      memberSince: user.createdAt
    },
    quickStats: {
      conversationsCount: user.conversationHistory.length,
      addressesCount: user.addresses.length,
      paymentMethodsCount: user.paymentMethods.length
    }
  };

  res.status(200).json({
    success: true,
    data: dashboardData
  });
}));

// Update favorite agents
router.put('/favorite-agents', [
  body('agents').isArray().withMessage('Agents must be an array'),
  body('agents.*').isString().withMessage('Each agent must be a string')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { agents } = req.body;
  
  // Validate agent names
  const validAgents = ['foodie', 'ridenow', 'travelbuddy', 'shopsmart', 'grocer', 'askme'];
  const invalidAgents = agents.filter(agent => !validAgents.includes(agent));
  
  if (invalidAgents.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid agents: ${invalidAgents.join(', ')}`
    });
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { favoriteAgents: [...new Set(agents)] }, // Remove duplicates
    { new: true }
  );

  structuredLogger.userAction(req.user.id, 'update_favorite_agents', { agents });

  res.status(200).json({
    success: true,
    message: 'Favorite agents updated successfully',
    data: {
      favoriteAgents: user.favoriteAgents
    }
  });
}));

// Delete address
router.delete('/addresses/:addressId', catchAsync(async (req, res) => {
  const { addressId } = req.params;
  
  const user = await User.findById(req.user.id);
  const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
  
  if (addressIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Address not found'
    });
  }

  const deletedAddress = user.addresses[addressIndex];
  user.addresses.splice(addressIndex, 1);
  
  // If deleted address was default and there are other addresses, make the first one default
  if (deletedAddress.isDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true;
  }

  await user.save();

  structuredLogger.userAction(req.user.id, 'delete_address', {
    addressId,
    label: deletedAddress.label
  });

  res.status(200).json({
    success: true,
    message: 'Address deleted successfully',
    data: {
      addresses: user.addresses
    }
  });
}));

// Update address
router.put('/addresses/:addressId', [
  body('label').optional().trim().notEmpty(),
  body('street').optional().trim().notEmpty(),
  body('city').optional().trim().notEmpty(),
  body('state').optional().trim().notEmpty(),
  body('pincode').optional().trim().notEmpty()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { addressId } = req.params;
  const updateData = req.body;
  
  const user = await User.findById(req.user.id);
  const address = user.addresses.id(addressId);
  
  if (!address) {
    return res.status(404).json({
      success: false,
      message: 'Address not found'
    });
  }

  // Update address fields
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined) {
      address[key] = updateData[key];
    }
  });

  // Handle default address logic
  if (updateData.isDefault) {
    user.addresses.forEach(addr => {
      if (addr._id.toString() !== addressId) {
        addr.isDefault = false;
      }
    });
    address.isDefault = true;
  }

  await user.save();

  structuredLogger.userAction(req.user.id, 'update_address', {
    addressId,
    updates: Object.keys(updateData)
  });

  res.status(200).json({
    success: true,
    message: 'Address updated successfully',
    data: {
      address,
      addresses: user.addresses
    }
  });
}));

// Add payment method
router.post('/payment-methods', [
  body('type').isIn(['UPI', 'CARD', 'WALLET', 'BNPL']).withMessage('Invalid payment type'),
  body('provider').optional().trim().notEmpty(),
  body('identifier').trim().notEmpty().withMessage('Payment identifier is required')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { type, provider, identifier, isDefault, metadata } = req.body;
  
  const user = await User.findById(req.user.id);

  // If this is set as default, unset other defaults
  if (isDefault) {
    user.paymentMethods.forEach(pm => pm.isDefault = false);
  }

  // Add new payment method
  user.paymentMethods.push({
    type,
    provider,
    identifier,
    isDefault: isDefault || user.paymentMethods.length === 0, // First payment method is default
    metadata
  });

  await user.save();

  structuredLogger.userAction(req.user.id, 'add_payment_method', {
    type,
    provider,
    isDefault
  });

  res.status(201).json({
    success: true,
    message: 'Payment method added successfully',
    data: {
      paymentMethods: user.paymentMethods
    }
  });
}));

// Delete payment method
router.delete('/payment-methods/:paymentId', catchAsync(async (req, res) => {
  const { paymentId } = req.params;
  
  const user = await User.findById(req.user.id);
  const paymentIndex = user.paymentMethods.findIndex(pm => pm._id.toString() === paymentId);
  
  if (paymentIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Payment method not found'
    });
  }

  const deletedPayment = user.paymentMethods[paymentIndex];
  user.paymentMethods.splice(paymentIndex, 1);
  
  // If deleted payment was default and there are other payments, make the first one default
  if (deletedPayment.isDefault && user.paymentMethods.length > 0) {
    user.paymentMethods[0].isDefault = true;
  }

  await user.save();

  structuredLogger.userAction(req.user.id, 'delete_payment_method', {
    paymentId,
    type: deletedPayment.type
  });

  res.status(200).json({
    success: true,
    message: 'Payment method deleted successfully',
    data: {
      paymentMethods: user.paymentMethods
    }
  });
}));

// Get user activity/analytics
router.get('/analytics', catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  // Analyze conversation history
  const agentUsage = {};
  const monthlyActivity = {};
  
  user.conversationHistory.forEach(conv => {
    // Agent usage
    agentUsage[conv.agentType] = (agentUsage[conv.agentType] || 0) + 1;
    
    // Monthly activity
    const month = new Date(conv.timestamp).toISOString().substring(0, 7); // YYYY-MM
    monthlyActivity[month] = (monthlyActivity[month] || 0) + 1;
  });

  const analytics = {
    overview: {
      totalConversations: user.conversationHistory.length,
      totalOrders: user.totalOrders,
      totalSpent: user.totalSpent,
      memberSince: user.createdAt,
      lastActive: user.lastActive
    },
    agentUsage,
    monthlyActivity,
    mostUsedAgent: Object.keys(agentUsage).reduce((a, b) => 
      agentUsage[a] > agentUsage[b] ? a : b, null
    ),
    preferences: user.preferences
  };

  res.status(200).json({
    success: true,
    data: analytics
  });
}));

// Update notification preferences
router.put('/notifications', [
  body('push').optional().isBoolean(),
  body('sms').optional().isBoolean(),
  body('email').optional().isBoolean()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { push, sms, email } = req.body;
  
  const user = await User.findById(req.user.id);
  
  // Update notification preferences
  if (push !== undefined) user.preferences.notifications.push = push;
  if (sms !== undefined) user.preferences.notifications.sms = sms;
  if (email !== undefined) user.preferences.notifications.email = email;

  await user.save();

  structuredLogger.userAction(req.user.id, 'update_notifications', {
    push, sms, email
  });

  res.status(200).json({
    success: true,
    message: 'Notification preferences updated successfully',
    data: {
      notifications: user.preferences.notifications
    }
  });
}));

// Export user data (GDPR compliance)
router.get('/export', catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  const exportData = {
    personal: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      profilePicture: user.profilePicture
    },
    addresses: user.addresses,
    preferences: user.preferences,
    activity: {
      totalOrders: user.totalOrders,
      totalSpent: user.totalSpent,
      favoriteAgents: user.favoriteAgents,
      conversationHistory: user.conversationHistory,
      lastActive: user.lastActive,
      createdAt: user.createdAt
    },
    exportedAt: new Date().toISOString()
  };

  structuredLogger.userAction(req.user.id, 'export_data');

  res.status(200).json({
    success: true,
    message: 'User data exported successfully',
    data: exportData
  });
}));

// Delete user account
router.delete('/account', [
  body('confirmPassword').notEmpty().withMessage('Password confirmation is required'),
  body('reason').optional().trim()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { confirmPassword, reason } = req.body;
  
  const user = await User.findById(req.user.id).select('+password');
  
  // Verify password
  const isValidPassword = await user.comparePassword(confirmPassword);
  if (!isValidPassword) {
    return res.status(400).json({
      success: false,
      message: 'Invalid password'
    });
  }

  // Log account deletion
  structuredLogger.userAction(req.user.id, 'delete_account', {
    reason: reason || 'No reason provided',
    totalOrders: user.totalOrders,
    totalSpent: user.totalSpent
  });

  // Soft delete - deactivate account instead of actual deletion
  user.isActive = false;
  user.deletedAt = new Date();
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully. We\'re sorry to see you go!'
  });
}));

module.exports = router;