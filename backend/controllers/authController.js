// backend/controllers/authController.js - Authentication Controller
const { OAuth2Client } = require('google-auth-library');
const { generateToken } = require('../middleware/auth.js');
const pool = require('../db/config.js');

// Google OAuth2 Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify Google Token and Generate JWT
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        error: 'Google token is required' 
      });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists in database or create new user
    const dbClient = await pool.connect();
    
    try {
      // Check if user exists
      let userResult = await dbClient.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      let user;
      if (userResult.rows.length === 0) {
        // Create new user
        const insertResult = await dbClient.query(`
          INSERT INTO users (name, email, google_id, picture_url, role, status, last_login, created_at) 
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
          RETURNING *
        `, [name, email, googleId, picture, 'user', 'active']);
        
        user = insertResult.rows[0];
        console.log('New user created:', user.email);
      } else {
        // Update existing user's last login and Google ID if needed
        const updateResult = await dbClient.query(`
          UPDATE users 
          SET last_login = NOW(), google_id = $1, picture_url = $2, name = $3
          WHERE email = $4 
          RETURNING *
        `, [googleId, picture, name, email]);
        
        user = updateResult.rows[0];
        console.log('User logged in:', user.email);
      }

      // Generate JWT token
      const jwtToken = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture_url,
        role: user.role
      });

      res.json({
        success: true,
        message: 'Login successful',
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture_url,
          role: user.role,
          status: user.status
        }
      });

    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('Google login error:', error);
    
    if (error.message.includes('Token used too late') || error.message.includes('Invalid token')) {
      return res.status(401).json({ 
        error: 'Invalid or expired Google token',
        message: 'Please try logging in again'
      });
    }

    res.status(500).json({ 
      error: 'Authentication failed',
      message: 'Internal server error during login'
    });
  }
};

// Verify JWT Token Endpoint
const verifyJWT = async (req, res) => {
  try {
    // Token is already verified by middleware, just return user info
    const dbClient = await pool.connect();
    
    try {
      const userResult = await dbClient.query(
        'SELECT id, email, name, picture_url, role, status, last_login FROM users WHERE email = $1',
        [req.user.email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'User not found in database' 
        });
      }

      const user = userResult.rows[0];
      
      res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture_url,
          role: user.role,
          status: user.status,
          lastLogin: user.last_login
        }
      });

    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(500).json({ 
      error: 'Token verification failed',
      message: error.message
    });
  }
};

// Logout (optional - mainly for client-side token cleanup)
const logout = async (req, res) => {
  // In a stateless JWT system, logout is mainly client-side
  // But we can log the logout event
  console.log('User logged out:', req.user?.email);
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const dbClient = await pool.connect();
    
    try {
      const userResult = await dbClient.query(
        'SELECT id, email, name, picture_url, role, status, last_login, created_at FROM users WHERE email = $1',
        [req.user.email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'User profile not found' 
        });
      }

      const user = userResult.rows[0];
      
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture_url,
          role: user.role,
          status: user.status,
          lastLogin: user.last_login,
          memberSince: user.created_at
        }
      });

    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profile',
      message: error.message
    });
  }
};

module.exports = {
  googleLogin,
  verifyJWT,
  logout,
  getProfile
};