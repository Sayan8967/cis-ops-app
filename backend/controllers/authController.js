// backend/controllers/authController.js - Fixed SSL Configuration
const jwt = require('jsonwebtoken');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const pool = require('../db/config');

// Using shared PostgreSQL pool from `db/config.js`

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Helper function to generate JWT
const generateJWT = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      picture: user.picture
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Helper function to create or update user in database
const createOrUpdateUser = async (googleUser) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if user exists
    const existingUser = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [googleUser.email]
    );
    
    let user;
    
    if (existingUser.rows.length > 0) {
      // Update existing user
      const updateQuery = `
        UPDATE users 
        SET 
          name = $1, 
          picture = $2, 
          last_login = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE email = $3 
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, [
        googleUser.name,
        googleUser.picture,
        googleUser.email
      ]);
      
      user = result.rows[0];
      console.log('Updated existing user:', user.email);
      
    } else {
      // Create new user with default role
      const insertQuery = `
        INSERT INTO users (name, email, picture, role, status, created_at, updated_at, last_login)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const result = await client.query(insertQuery, [
        googleUser.name,
        googleUser.email,
        googleUser.picture || null,
        'user', // Default role
        'active'
      ]);
      
      user = result.rows[0];
      console.log('Created new user:', user.email);
    }
    
    await client.query('COMMIT');
    
    // Convert snake_case to camelCase for frontend
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error in createOrUpdateUser:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Google OAuth Login Controller
const googleLogin = async (req, res) => {
  try {
    const { token, userInfo } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Google access token is required'
      });
    }
    
    console.log('Processing Google login for token...');
    
    let googleUserData;
    
    // Try to use provided userInfo first, then fetch from Google
    if (userInfo && userInfo.email) {
      googleUserData = userInfo;
      console.log('Using provided user info:', userInfo.email);
    } else {
      // Fetch user info from Google
      try {
        console.log('Fetching user info from Google API...');
        const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 10000
        });
        
        googleUserData = response.data;
        console.log('Fetched user info from Google:', googleUserData.email);
        
      } catch (googleError) {
        console.error('Failed to fetch user info from Google:', googleError.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid Google token or failed to fetch user information'
        });
      }
    }
    
    // Validate required Google user data
    if (!googleUserData.email || !googleUserData.name) {
      return res.status(400).json({
        success: false,
        message: 'Incomplete user information from Google'
      });
    }
    
    // Create or update user in database
    const user = await createOrUpdateUser(googleUserData);
    
    // Generate JWT token
    const jwtToken = generateJWT(user);
    
    // Log successful login
    console.log('Login successful for user:', user.email, 'Role:', user.role);
    
    res.json({
      success: true,
      message: 'Login successful',
      token: jwtToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        status: user.status
      }
    });
    
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

// JWT Verification Controller
const verifyJWT = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        valid: false,
        message: 'No token provided'
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Optional: Check if user still exists and is active
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, name, email, picture, role, status FROM users WHERE id = $1 AND status = $2',
        [decoded.id, 'active']
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          valid: false,
          message: 'User not found or inactive'
        });
      }
      
      const user = result.rows[0];
      
      res.json({
        valid: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          picture: user.picture,
          role: user.role,
          status: user.status
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        valid: false,
        message: 'Invalid token'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        valid: false,
        message: 'Token expired'
      });
    }
    
    console.error('JWT verification error:', error);
    res.status(500).json({
      valid: false,
      message: 'Internal server error'
    });
  }
};

// Logout Controller
const logout = async (req, res) => {
  try {
    // In a more sophisticated system, you might want to blacklist the token
    // For now, we'll just return a success response
    // The client will remove the token from localStorage
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('User logged out:', decoded.email);
      } catch (error) {
        // Token might be invalid/expired, but that's ok for logout
        console.log('Logout with invalid/expired token');
      }
    }
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during logout'
    });
  }
};

// Get Profile Controller
const getProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch fresh user data from database
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, name, email, picture, role, status, created_at, updated_at, last_login 
         FROM users WHERE id = $1`,
        [decoded.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      const user = result.rows[0];
      
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          picture: user.picture,
          role: user.role,
          status: user.status,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          lastLogin: user.last_login
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Optional: Check if user still exists and is active
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, name, email, role, status FROM users WHERE id = $1 AND status = $2',
        [decoded.id, 'active']
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }
      
      req.user = result.rows[0];
      next();
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    console.error('Token authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Middleware to check user roles
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    const roleHierarchy = {
      'user': 1,
      'moderator': 2,
      'admin': 3
    };
    
    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${requiredRole} role required.`
      });
    }
    
    next();
  };
};

// Health check for authentication service
const healthCheck = async (req, res) => {
  try {
    // Test database connection
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      
      res.json({
        status: 'healthy',
        service: 'authentication',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Auth health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'authentication',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  googleLogin,
  verifyJWT,
  logout,
  getProfile,
  authenticateToken,
  requireRole,
  healthCheck
};