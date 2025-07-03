const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult, body } = require('express-validator');
const { catchAsync, createValidationError, createAuthError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const { structuredLogger } = require('../utils/logger');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Validation middleware
const validateRegistration = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').isMobilePhone().withMessage('Valid phone number is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number')
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

// Register new user
router.post('/register', validateRegistration, catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, email, phone, password } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { phone }]
  });

  if (existingUser) {
    const field = existingUser.email === email ? 'email' : 'phone';
    throw createValidationError(field, `User with this ${field} already exists`);
  }

  // Create new user
  const user = await User.create({
    name: name.trim(),
    email,
    phone,
    password,
    verificationToken: crypto.randomBytes(32).toString('hex')
  });

  // Generate token
  const token = generateToken(user._id);

  // Log registration
  structuredLogger.userAction(user._id, 'register', {
    email: user.email,
    phone: user.phone
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
        subscriptionTier: user.subscriptionTier
      },
      token
    }
  });
}));

// Login user
router.post('/login', validateLogin, catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    structuredLogger.security('login_attempt_invalid_email', null, { email });
    throw createAuthError('Invalid email or password');
  }

  // Check if account is locked
  if (user.isLocked) {
    structuredLogger.security('login_attempt_locked_account', user._id, { email });
    throw createAuthError('Account is temporarily locked due to too many failed login attempts');
  }

  // Check password
  const isValidPassword = await user.comparePassword(password);

  if (!isValidPassword) {
    await user.incLoginAttempts();
    structuredLogger.security('login_attempt_invalid_password', user._id, { email });
    throw createAuthError('Invalid email or password');
  }

  // Reset login attempts on successful login
  if (user.loginAttempts > 0) {
    await user.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 }
    });
  }

  // Update last active
  await user.updateLastActive();

  // Generate token
  const token = generateToken(user._id);

  // Log successful login
  structuredLogger.userAction(user._id, 'login', {
    email: user.email,
    lastActive: user.lastActive
  });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
        subscriptionTier: user.subscriptionTier,
        profilePicture: user.profilePicture,
        preferences: user.preferences
      },
      token
    }
  });
}));

// Get current user profile
router.get('/profile', authenticate, catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).populate('addresses paymentMethods');

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profilePicture: user.profilePicture,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        addresses: user.addresses,
        paymentMethods: user.paymentMethods,
        preferences: user.preferences,
        totalOrders: user.totalOrders,
        totalSpent: user.totalSpent,
        favoriteAgents: user.favoriteAgents,
        isVerified: user.isVerified,
        subscriptionTier: user.subscriptionTier,
        lastActive: user.lastActive,
        createdAt: user.createdAt
      }
    }
  });
}));

// Update user profile
router.put('/profile', authenticate, [
  body('name').optional().trim().isLength({ min: 2, max: 50 }),
  body('dateOfBirth').optional().isISO8601(),
  body('gender').optional().isIn(['male', 'female', 'other'])
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, dateOfBirth, gender, profilePicture } = req.body;
  
  const updateData = {};
  if (name) updateData.name = name.trim();
  if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
  if (gender) updateData.gender = gender;
  if (profilePicture) updateData.profilePicture = profilePicture;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    { new: true, runValidators: true }
  );

  structuredLogger.userAction(req.user.id, 'update_profile', updateData);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
}));

// Update user preferences
router.put('/preferences', authenticate, catchAsync(async (req, res) => {
  const { preferences } = req.body;

  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Valid preferences object is required'
    });
  }

  const user = await User.findById(req.user.id);
  
  // Merge new preferences with existing ones
  user.preferences = {
    ...user.preferences,
    ...preferences
  };

  await user.save();

  structuredLogger.userAction(req.user.id, 'update_preferences', { preferences });

  res.status(200).json({
    success: true,
    message: 'Preferences updated successfully',
    data: {
      preferences: user.preferences
    }
  });
}));

// Add address
router.post('/addresses', authenticate, [
  body('label').trim().notEmpty().withMessage('Address label is required'),
  body('street').trim().notEmpty().withMessage('Street address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('pincode').trim().notEmpty().withMessage('Pincode is required')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { label, street, city, state, pincode, landmark, coordinates, isDefault } = req.body;
  
  const user = await User.findById(req.user.id);

  // If this is set as default, unset other defaults
  if (isDefault) {
    user.addresses.forEach(addr => addr.isDefault = false);
  }

  // Add new address
  user.addresses.push({
    label: label.trim(),
    street: street.trim(),
    city: city.trim(),
    state: state.trim(),
    pincode: pincode.trim(),
    landmark: landmark?.trim(),
    coordinates,
    isDefault: isDefault || user.addresses.length === 0 // First address is default
  });

  await user.save();

  structuredLogger.userAction(req.user.id, 'add_address', {
    label,
    city,
    isDefault
  });

  res.status(201).json({
    success: true,
    message: 'Address added successfully',
    data: {
      addresses: user.addresses
    }
  });
}));

// Change password
router.put('/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;
  
  const user = await User.findById(req.user.id).select('+password');

  // Verify current password
  const isValidPassword = await user.comparePassword(currentPassword);
  if (!isValidPassword) {
    structuredLogger.security('password_change_invalid_current', req.user.id);
    throw createAuthError('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  structuredLogger.userAction(req.user.id, 'change_password');

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// Logout (client-side token invalidation)
router.post('/logout', authenticate, catchAsync(async (req, res) => {
  structuredLogger.userAction(req.user.id, 'logout');

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}));

// Forgot password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if email exists or not
    return res.status(200).json({
      success: true,
      message: 'If the email exists, you will receive password reset instructions'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save();

  structuredLogger.userAction(user._id, 'request_password_reset', { email });

  // TODO: Send email with reset link
  // For now, just return success message

  res.status(200).json({
    success: true,
    message: 'Password reset instructions sent to your email',
    // In development, return the token for testing
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  });
}));

// Verify account
router.post('/verify/:token', catchAsync(async (req, res) => {
  const { token } = req.params;

  const user = await User.findOne({ verificationToken: token });

  if (!user) {
    throw createAuthError('Invalid verification token');
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save();

  structuredLogger.userAction(user._id, 'verify_account');

  res.status(200).json({
    success: true,
    message: 'Account verified successfully'
  });
}));

module.exports = router;