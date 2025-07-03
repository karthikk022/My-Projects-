const { logger, structuredLogger } = require('../utils/logger');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error types
const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  AGENT_ERROR: 'AGENT_ERROR',
  PAYMENT_ERROR: 'PAYMENT_ERROR'
};

// Handle different types of errors
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

// Send error response in development
const sendErrorDev = (err, req, res) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: 'error',
      error: err,
      message: err.message,
      stack: err.stack,
      timestamp: err.timestamp || new Date().toISOString()
    });
  }
};

// Send error response in production
const sendErrorProd = (err, req, res) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: 'error',
        message: err.message,
        timestamp: err.timestamp || new Date().toISOString()
      });
    }
    
    // Programming or other unknown error: don't leak error details
    logger.error('ERROR:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString()
    });
  }
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error with context
  structuredLogger.error(err, {
    url: req.originalUrl,
    method: req.method,
    userId: req.user ? req.user.id : null,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(err);
};

// Validation error helper
const createValidationError = (field, message) => {
  return new AppError(`Validation Error: ${field} - ${message}`, 400);
};

// Agent error helper
const createAgentError = (agentName, message, statusCode = 500) => {
  const error = new AppError(`Agent Error (${agentName}): ${message}`, statusCode);
  error.type = ErrorTypes.AGENT_ERROR;
  error.agent = agentName;
  return error;
};

// External API error helper
const createExternalAPIError = (service, message, statusCode = 502) => {
  const error = new AppError(`External API Error (${service}): ${message}`, statusCode);
  error.type = ErrorTypes.EXTERNAL_API_ERROR;
  error.service = service;
  return error;
};

// Payment error helper
const createPaymentError = (message, statusCode = 402) => {
  const error = new AppError(`Payment Error: ${message}`, statusCode);
  error.type = ErrorTypes.PAYMENT_ERROR;
  return error;
};

// Rate limiting error helper
const createRateLimitError = (message = 'Too many requests') => {
  const error = new AppError(message, 429);
  error.type = ErrorTypes.RATE_LIMIT_ERROR;
  return error;
};

// Authentication error helper
const createAuthError = (message = 'Authentication failed') => {
  const error = new AppError(message, 401);
  error.type = ErrorTypes.AUTHENTICATION_ERROR;
  return error;
};

// Authorization error helper
const createAuthzError = (message = 'Access denied') => {
  const error = new AppError(message, 403);
  error.type = ErrorTypes.AUTHORIZATION_ERROR;
  return error;
};

// Global unhandled rejection handler
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Rejection:', {
    error: err.message,
    stack: err.stack,
    promise: promise,
    category: 'unhandled_rejection'
  });
  
  // Close server gracefully
  process.exit(1);
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', {
    error: err.message,
    stack: err.stack,
    category: 'uncaught_exception'
  });
  
  // Close server gracefully
  process.exit(1);
});

module.exports = {
  AppError,
  ErrorTypes,
  errorHandler,
  catchAsync,
  notFoundHandler,
  createValidationError,
  createAgentError,
  createExternalAPIError,
  createPaymentError,
  createRateLimitError,
  createAuthError,
  createAuthzError
};