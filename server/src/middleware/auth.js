const jwt = require('jsonwebtoken');
const { catchAsync, createAuthError } = require('./errorHandler');
const User = require('../models/User');
const { structuredLogger } = require('../utils/logger');

// Verify JWT token and authenticate user
const authenticate = catchAsync(async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createAuthError('Access token is required');
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      throw createAuthError('User not found');
    }

    if (!user.isActive) {
      throw createAuthError('Account is deactivated');
    }

    // Update last active timestamp
    await user.updateLastActive();

    // Attach user to request object
    req.user = user;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      structuredLogger.security('invalid_token', null, {
        token: token.substring(0, 10) + '...',
        error: error.message
      });
      throw createAuthError('Invalid token');
    }
    
    if (error.name === 'TokenExpiredError') {
      structuredLogger.security('expired_token', null, {
        token: token.substring(0, 10) + '...'
      });
      throw createAuthError('Token has expired');
    }
    
    throw error;
  }
});

// Optional authentication - don't throw error if no token
const optionalAuth = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (user && user.isActive) {
      await user.updateLastActive();
      req.user = user;
    }
  } catch (error) {
    // Silently fail for optional auth
    structuredLogger.security('optional_auth_failed', null, {
      error: error.message
    });
  }
  
  next();
});

// Check if user is verified
const requireVerification = (req, res, next) => {
  if (!req.user.isVerified) {
    throw createAuthError('Please verify your account to access this feature');
  }
  next();
};

// Check subscription tier
const requireSubscription = (requiredTier) => {
  const tierLevels = {
    'free': 0,
    'premium': 1,
    'enterprise': 2
  };

  return (req, res, next) => {
    const userTier = req.user.subscriptionTier || 'free';
    const userLevel = tierLevels[userTier] || 0;
    const requiredLevel = tierLevels[requiredTier] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: `This feature requires ${requiredTier} subscription`,
        currentTier: userTier,
        requiredTier
      });
    }

    next();
  };
};

// Admin only access
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    structuredLogger.security('unauthorized_admin_access', req.user.id, {
      endpoint: req.originalUrl,
      method: req.method
    });
    throw createAuthError('Admin access required');
  }
  next();
};

// Rate limiting per user
const userRateLimit = (maxRequests, windowMs) => {
  const requests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request history
    if (!requests.has(userId)) {
      requests.set(userId, []);
    }

    const userRequests = requests.get(userId);
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
    requests.set(userId, validRequests);

    // Check if user exceeded the limit
    if (validRequests.length >= maxRequests) {
      structuredLogger.security('rate_limit_exceeded', userId, {
        endpoint: req.originalUrl,
        requestCount: validRequests.length,
        maxRequests,
        windowMs
      });

      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    validRequests.push(now);
    requests.set(userId, validRequests);

    next();
  };
};

// Device tracking middleware
const trackDevice = (req, res, next) => {
  if (req.user) {
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date()
    };

    // Log device info for security monitoring
    structuredLogger.userAction(req.user.id, 'device_access', deviceInfo);
  }
  
  next();
};

// Session validation middleware
const validateSession = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next();
  }

  // Check if user account is still active
  const currentUser = await User.findById(req.user.id);
  
  if (!currentUser || !currentUser.isActive) {
    structuredLogger.security('inactive_user_session', req.user.id);
    throw createAuthError('Session is no longer valid');
  }

  // Update user object with latest data
  req.user = currentUser;
  next();
});

module.exports = {
  authenticate,
  optionalAuth,
  requireVerification,
  requireSubscription,
  requireAdmin,
  userRateLimit,
  trackDevice,
  validateSession
};