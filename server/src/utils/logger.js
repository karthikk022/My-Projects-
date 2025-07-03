const winston = require('winston');
const path = require('path');

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

winston.addColors(logColors);

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += '\n' + JSON.stringify(meta, null, 2);
    }
    return msg;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels: logLevels,
  format: logFormat,
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: logFormat
    }),

    // Agent-specific log file
    new winston.transports.File({
      filename: path.join(logsDir, 'agents.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.label({ label: 'AGENT' }),
        winston.format.json()
      )
    })
  ],

  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 2
    })
  ],

  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 2
    })
  ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Helper methods for structured logging
const structuredLogger = {
  // User activity logging
  userAction: (userId, action, metadata = {}) => {
    logger.info('User action', {
      userId,
      action,
      ...metadata,
      category: 'user_activity'
    });
  },

  // Agent activity logging
  agentActivity: (agentName, action, userId, metadata = {}) => {
    logger.info('Agent activity', {
      agentName,
      action,
      userId,
      ...metadata,
      category: 'agent_activity'
    });
  },

  // API request logging
  apiRequest: (method, endpoint, userId, statusCode, responseTime, metadata = {}) => {
    logger.http('API request', {
      method,
      endpoint,
      userId,
      statusCode,
      responseTime,
      ...metadata,
      category: 'api_request'
    });
  },

  // Error logging with context
  error: (error, context = {}) => {
    logger.error('Application error', {
      error: error.message,
      stack: error.stack,
      ...context,
      category: 'application_error'
    });
  },

  // Security event logging
  security: (event, userId, metadata = {}) => {
    logger.warn('Security event', {
      event,
      userId,
      ...metadata,
      category: 'security'
    });
  },

  // Performance logging
  performance: (operation, duration, metadata = {}) => {
    logger.info('Performance metric', {
      operation,
      duration,
      ...metadata,
      category: 'performance'
    });
  },

  // Business metrics logging
  business: (metric, value, metadata = {}) => {
    logger.info('Business metric', {
      metric,
      value,
      ...metadata,
      category: 'business'
    });
  },

  // Agent handoff logging
  handoff: (fromAgent, toAgent, userId, reason, metadata = {}) => {
    logger.info('Agent handoff', {
      fromAgent,
      toAgent,
      userId,
      reason,
      ...metadata,
      category: 'agent_handoff'
    });
  }
};

// Express middleware for request logging
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.http('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user ? req.user.id : null,
    category: 'http_request'
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    structuredLogger.apiRequest(
      req.method,
      req.url,
      req.user ? req.user.id : null,
      res.statusCode,
      responseTime,
      {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    );
    
    originalEnd.apply(this, args);
  };

  next();
};

// Cleanup old logs function
const cleanupLogs = () => {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = Date.now();

  fs.readdir(logsDir, (err, files) => {
    if (err) {
      logger.error('Error reading logs directory:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, (err) => {
            if (err) {
              logger.error('Error deleting old log file:', { file, error: err.message });
            } else {
              logger.info('Deleted old log file:', { file });
            }
          });
        }
      });
    });
  });
};

// Schedule log cleanup (run daily)
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

module.exports = {
  logger,
  structuredLogger,
  requestLogger,
  cleanupLogs
};