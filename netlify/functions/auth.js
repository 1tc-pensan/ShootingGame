const { initDB, getDB, cleanExpiredSessions } = require('./db');
const crypto = require('crypto');
const { checkRateLimit } = require('./rate-limiter');

// XSS Protection - Sanitize input
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>\"\'&]/g, (char) => {
      const entities = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[char];
    })
    .trim()
    .slice(0, 100); // Max 100 chars
}

// Validate username format
function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  // Only alphanumeric, underscore, hyphen, 3-20 chars
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

// Validate email format
function validateEmail(email) {
  if (!email) return true; // Email is optional
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate password strength
function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  // Min 6 chars, max 100 chars
  return password.length >= 6 && password.length <= 100;
}

// Simple hash function (in production use bcrypt)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate simple session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

exports.handler = async (event) => {
  await initDB();
  const sql = getDB();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://neon.tech; frame-src https://www.google.com;",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Rate limiting - use IP address as identifier
  const clientIP = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const rateLimit = checkRateLimit(clientIP);
  
  // Add rate limit headers
  headers['X-RateLimit-Limit'] = '10';
  headers['X-RateLimit-Remaining'] = rateLimit.remaining.toString();
  
  if (!rateLimit.allowed) {
    headers['Retry-After'] = rateLimit.retryAfter.toString();
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ 
        error: 'Too many requests. Please try again later.',
        retryAfter: rateLimit.retryAfter 
      })
    };
  }

  try {
    const { action, username, password, email, token } = JSON.parse(event.body);

    // REGISTER
    if (action === 'register') {
      if (!username || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Username and password required' })
        };
      }

      // Validate inputs
      if (!validateUsername(username)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid username format. Use 3-20 alphanumeric characters, _ or -' })
        };
      }

      if (!validatePassword(password)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Password must be 6-100 characters' })
        };
      }

      if (email && !validateEmail(email)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid email format' })
        };
      }

      // Sanitize inputs
      const cleanUsername = sanitizeInput(username);
      const cleanEmail = email ? sanitizeInput(email) : null;
      const hashedPassword = hashPassword(password);

      try {
        const result = await sql`
          INSERT INTO users (username, password, email) 
          VALUES (${cleanUsername.toLowerCase()}, ${hashedPassword}, ${cleanEmail})
          RETURNING id, username
        `;

        const user = result[0];
        const sessionToken = generateToken();
        const isAdmin = user.id === 1;

        // Store session in database
        await sql`
          INSERT INTO sessions (user_id, token) 
          VALUES (${user.id}, ${sessionToken})
        `;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            token: sessionToken,
            userId: user.id,
            username: user.username,
            isAdmin: isAdmin
          })
        };
      } catch (err) {
        if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Username already exists' })
          };
        }
        throw err;
      }
    }

    // LOGIN
    if (action === 'login') {
      if (!username || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Username and password required' })
        };
      }

      // Validate inputs
      if (!validateUsername(username) || !validatePassword(password)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid credentials' })
        };
      }

      const cleanUsername = sanitizeInput(username);
      const hashedPassword = hashPassword(password);

      const users = await sql`
        SELECT id, username 
        FROM users 
        WHERE username = ${cleanUsername.toLowerCase()} AND password = ${hashedPassword}
      `;

      if (users.length === 0) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid credentials' })
        };
      }

      const user = users[0];
      const sessionToken = generateToken();
      const isAdmin = user.id === 1;

      // Clean old sessions for this user
      await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;

      // Store new session in database
      await sql`
        INSERT INTO sessions (user_id, token) 
        VALUES (${user.id}, ${sessionToken})
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          token: sessionToken,
          userId: user.id,
          username: user.username,
          isAdmin: isAdmin
        })
      };
    }

    // VERIFY TOKEN
    if (action === 'verify') {
      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Token required' })
        };
      }

      // Clean expired sessions
      await cleanExpiredSessions();

      const sessions = await sql`
        SELECT s.user_id, u.username 
        FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.token = ${token} AND s.expires_at > NOW()
      `;

      if (sessions.length === 0) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ valid: false })
        };
      }

      const session = sessions[0];
      const isAdmin = session.user_id === 1;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          userId: session.user_id,
          username: session.username,
          isAdmin: isAdmin
        })
      };
    }

    // LOGOUT
    if (action === 'logout') {
      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Token required' })
        };
      }

      await sql`DELETE FROM sessions WHERE token = ${token}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };
  } catch (error) {
    console.error('Auth error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
