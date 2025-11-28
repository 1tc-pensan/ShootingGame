const { initDB, getDB } = require('./db');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

exports.handler = async (event) => {
  await initDB();
  const sql = getDB();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { username, password } = event.queryStringParameters || {};

    if (!username) {
      // List all users (without passwords)
      const users = await sql`
        SELECT id, username, email, created_at 
        FROM users 
        ORDER BY id
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ users })
      };
    }

    // Check specific user
    const users = await sql`
      SELECT id, username, email, password 
      FROM users 
      WHERE username = ${username.toLowerCase()}
    `;

    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found', username: username.toLowerCase() })
      };
    }

    const user = users[0];
    const result = {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHashInDB: user.password
    };

    if (password) {
      const hashedPassword = hashPassword(password);
      result.providedPasswordHash = hashedPassword;
      result.passwordsMatch = hashedPassword === user.password;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Debug error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
