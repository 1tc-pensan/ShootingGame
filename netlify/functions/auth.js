const { initDB, getDB, cleanExpiredSessions } = require('./db');
const crypto = require('crypto');

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

      const hashedPassword = hashPassword(password);

      try {
        const result = await sql`
          INSERT INTO users (username, password, email) 
          VALUES (${username.toLowerCase()}, ${hashedPassword}, ${email || null})
          RETURNING id, username
        `;

        const user = result[0];
        const sessionToken = generateToken();

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
            username: user.username
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

      const hashedPassword = hashPassword(password);

      const users = await sql`
        SELECT id, username 
        FROM users 
        WHERE username = ${username.toLowerCase()} AND password = ${hashedPassword}
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
          username: user.username
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
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          userId: session.user_id,
          username: session.username
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
