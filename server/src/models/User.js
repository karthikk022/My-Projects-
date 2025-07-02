const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label: { type: String, required: true }, // Home, Work, etc.
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  landmark: String,
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  isDefault: { type: Boolean, default: false }
});

const paymentMethodSchema = new mongoose.Schema({
  type: { type: String, enum: ['UPI', 'CARD', 'WALLET', 'BNPL'], required: true },
  provider: String, // Razorpay, PayPal, etc.
  identifier: String, // last 4 digits, UPI ID, etc.
  isDefault: { type: Boolean, default: false },
  metadata: mongoose.Schema.Types.Mixed
});

const preferencesSchema = new mongoose.Schema({
  dietary: {
    vegetarian: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    allergies: [String],
    cuisinePreferences: [String]
  },
  travel: {
    preferredClass: { type: String, enum: ['economy', 'business', 'first'], default: 'economy' },
    seatPreference: { type: String, enum: ['window', 'aisle', 'middle'], default: 'window' },
    frequentDestinations: [String]
  },
  shopping: {
    size: {
      clothing: String,
      shoe: String
    },
    preferredBrands: [String],
    priceRange: {
      min: Number,
      max: Number
    }
  },
  ride: {
    preferredRideType: { type: String, enum: ['economy', 'premium', 'shared'], default: 'economy' },
    preferredPaymentMethod: String
  },
  language: { type: String, default: 'en' },
  notifications: {
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: true }
  }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: String,
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // Profile & Preferences
  addresses: [addressSchema],
  paymentMethods: [paymentMethodSchema],
  preferences: preferencesSchema,
  
  // AI Personalization
  conversationHistory: [{
    agentType: String,
    timestamp: { type: Date, default: Date.now },
    context: mongoose.Schema.Types.Mixed
  }],
  
  // Activity & Analytics
  lastActive: { type: Date, default: Date.now },
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  favoriteAgents: [String],
  
  // Authentication & Security
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  
  // Status
  isActive: { type: Boolean, default: true },
  subscriptionTier: { type: String, enum: ['free', 'premium', 'enterprise'], default: 'free' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ 'addresses.coordinates': '2dsphere' });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to get default address
userSchema.methods.getDefaultAddress = function() {
  return this.addresses.find(addr => addr.isDefault) || this.addresses[0];
};

// Method to get default payment method
userSchema.methods.getDefaultPaymentMethod = function() {
  return this.paymentMethods.find(pm => pm.isDefault) || this.paymentMethods[0];
};

// Method to update last active
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);