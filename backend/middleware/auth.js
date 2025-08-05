// backend/middleware/auth.js - JWT Authentication Middleware
const jwt = require('jsonwebtoken');

// JWT Secret - In production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Generate JWT Token
const generateToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  return jwt.sign(payload, JWT_SECRET);
};

// Verify JWT Token Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied', 
      message: 'No token provided' 
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired', 
        message: 'Please login again' 
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token', 
        message: 'Please login again' 
      });
    } else {
      return res.status(401).json({ 
        error: 'Token verification failed', 
        message: 'Please login again' 
      });
    }
  }
};

// Optional middleware for role-based access
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    // For now, we'll determine role based on email domain or set it manually
    // In a real app, you'd store roles in database
    const userRole = getUserRole(req.user.email);
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: userRole
      });
    }

    req.user.role = userRole;
    next();
  };
};

// Helper function to determine user role (customize as needed)
const getUserRole = (email) => {
  // Simple role assignment based on email
  // In production, store roles in database
  if (email.includes('admin') || email.endsWith('yourdomain.com')) {
    return 'admin';
  } else if (email.includes('moderator')) {
    return 'moderator';
  }
  return 'user';
};

// Middleware to refresh token if needed
const refreshTokenIfNeeded = (req, res, next) => {
  if (req.user) {
    const tokenAge = Date.now() / 1000 - req.user.iat;
    const tokenLife = req.user.exp - req.user.iat;
    
    // If token is more than 75% through its life, include refresh token in response
    if (tokenAge > tokenLife * 0.75) {
      const newToken = generateToken(req.user);
      res.set('X-New-Token', newToken);
    }
  }
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  requireRole,
  refreshTokenIfNeeded,
  JWT_SECRET
};