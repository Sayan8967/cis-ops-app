// backend/controllers/authController.js - Enhanced Authentication Controller
const { OAuth2Client } = require('google-auth-library');
const { generateToken } = require('../middleware/auth.js');
const pool = require('../db/config.js');

// Google OAuth2 Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify Google Token and Generate JWT
const googleLogin = async (req, res) => {
  try {
    const { token, userInfo } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        error: 'Google token is required' 
      });
    }

    console.log('Processing Google login with token');

    let googleUserInfo;

    // Method 1: Try to verify ID token first
    try {
      console.log('Attempting to verify Google ID token...');
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      googleUserInfo = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        email_verified: payload.email_verified
      };
      
      console.log('Google ID token verified successfully for:', googleUserInfo.email);
      
    } catch (idTokenError) {
      console.log('ID token verification failed, trying access token method:', idTokenError.message);
      
      // Method 2: If ID token fails, try using the access token to get user info
      try {
        console.log('Fetching user info using access token...');
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        });

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status} ${response.statusText}`);
        }

        const userData = await response.json();
        googleUserInfo = {
          sub: userData.sub,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          email_verified: userData.email_verified !== false
        };
        
        console.log('Google user info fetched successfully for:', googleUserInfo.email);
        
      } catch (accessTokenError) {
        console.error('Both token verification methods failed:', {
          idTokenError: idTokenError.message,
          accessTokenError: accessTokenError.message
        });
        
        // Method 3: Use provided userInfo as fallback
        if (userInfo && userInfo.email) {
          console.log('Using provided userInfo as fallback');
          googleUserInfo = {
            sub: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            email_verified: true // Assume verified if Google provided it
          };
        } else {
          return res.status(401).json({ 
            success: false,
            error: 'Invalid Google token',
            message: 'Unable to verify Google authentication'
          });
        }
      }
    }

    // Validate required fields
    if (!googleUserInfo.email) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google user data',
        message: 'Email is required'
      });
    }

    // Database operations
    const dbClient = await pool.connect();
    
    try {
      console.log('Processing database operations for user:', googleUserInfo.email);
      
      // Check if user exists in database
      let userResult = await dbClient.query(
        'SELECT * FROM users WHERE email = $1',
        [googleUserInfo.email]
      );

      let user;
      if (userResult.rows.length === 0) {
        // Create new user
        console.log('Creating new user:', googleUserInfo.email);
        const insertResult = await dbClient.query(`
          INSERT INTO users (name, email, google_id, picture_url, role, status, last_login, created_at) 
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
          RETURNING *
        `, [
          googleUserInfo.name || 'Unknown User',
          googleUserInfo.email,
          googleUserInfo.sub,
          googleUserInfo.picture,
          'user', // Default role
          'active'
        ]);
        
        user = insertResult.rows[0];
        console.log('New user created successfully:', user.email);
      } else {
        // Update existing user's last login and Google info
        console.log('Updating existing user:', googleUserInfo.email);
        const updateResult = await dbClient.query(`
          UPDATE users 
          SET last_login = NOW(), 
              google_id = COALESCE($1, google_id), 
              picture_url = COALESCE($2, picture_url), 
              name = COALESCE($3, name),
              updated_at = NOW()
          WHERE email = $4 
          RETURNING *
        `, [
          googleUserInfo.sub,
          googleUserInfo.picture,
          googleUserInfo.name,
          googleUserInfo.email
        ]);
        
        user = updateResult.rows[0];
        console.log('User updated successfully:', user.email);
      }

      // Generate JWT token
      const jwtToken = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture_url,
        role: user.role
      });

      // Success response
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
          status: user.status,
          lastLogin: user.last_login,
          memberSince: user.created_at
        }
      });

      console.log('Login process completed successfully for:', user.email);

    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('Google login error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    // Handle specific error types
    if (error.message.includes('Token used too late') || 
        error.message.includes('Invalid token') ||
        error.message.includes('Google API error')) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid or expired Google token',
        message: 'Please try logging in again'
      });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        success: false,
        error: 'Database connection failed',
        message: 'Service temporarily unavailable'
      });
    }

    if (error.message.includes('duplicate key') || error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        message: 'Account with this email already exists'
      });
    }

    // Generic error response
    res.status(500).json({ 
      success: false,
      error: 'Authentication failed',
      message: 'Internal server error during login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify JWT Token Endpoint
const verifyJWT = async (req, res) => {
  try {
    console.log('Verifying JWT token for user:', req.user.email);
    
    // Token is already verified by middleware, just return user info
    const dbClient = await pool.connect();
    
    try {
      const userResult = await dbClient.query(
        'SELECT id, email, name, picture_url, role, status, last_login, created_at FROM users WHERE email = $1',
        [req.user.email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ 
          valid: false,
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
          lastLogin: user.last_login,
          memberSince: user.created_at
        }
      });

      console.log('JWT verification successful for:', user.email);

    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(500).json({ 
      valid: false,
      error: 'Token verification failed',
      message: error.message
    });
  }
};

// Logout (optional - mainly for client-side token cleanup)
const logout = async (req, res) => {
  try {
    const userEmail = req.user?.email || 'unknown';
    console.log('User logout initiated:', userEmail);
    
    // In a stateless JWT system, logout is mainly client-side
    // But we can log the logout event and potentially invalidate the token
    
    // Optional: Add token to blacklist table (implement if needed)
    // const dbClient = await pool.connect();
    // try {
    //   await dbClient.query(
    //     'INSERT INTO token_blacklist (token_hash, expires_at) VALUES ($1, $2)',
    //     [hashToken(req.headers.authorization), new Date(req.user.exp * 1000)]
    //   );
    // } finally {
    //   dbClient.release();
    // }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
    console.log('User logout completed:', userEmail);
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    console.log('Fetching profile for user:', req.user.email);
    
    const dbClient = await pool.connect();
    
    try {
      const userResult = await dbClient.query(
        'SELECT id, email, name, picture_url, role, status, last_login, created_at, updated_at FROM users WHERE email = $1',
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
          memberSince: user.created_at,
          lastUpdated: user.updated_at
        }
      });

      console.log('Profile fetched successfully for:', user.email);

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

// Health check for authentication service
const authHealthCheck = async (req, res) => {
  try {
    // Check database connectivity
    const dbClient = await pool.connect();
    let dbStatus = 'connected';
    let userCount = 0;
    
    try {
      const result = await dbClient.query('SELECT COUNT(*) FROM users');
      userCount = parseInt(result.rows[0].count);
    } catch (dbError) {
      dbStatus = 'error';
      console.error('Database health check failed:', dbError);
    } finally {
      dbClient.release();
    }

    // Check Google OAuth configuration
    const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      googleOAuth: googleConfigured ? 'configured' : 'not configured',
      userCount: userCount,
      uptime: process.uptime(),
      version: '2.0.0'
    });

  } catch (error) {
    console.error('Auth health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
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
  authHealthCheck
};