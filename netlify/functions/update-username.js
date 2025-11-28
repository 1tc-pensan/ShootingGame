const { initDB, getDB } = require('./db');

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
    const { userId, newUsername } = JSON.parse(event.body);

    if (!userId || !newUsername) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'userId and newUsername required' })
      };
    }

    // Check if new username already exists
    const existing = await sql`
      SELECT id FROM users WHERE username = ${newUsername.toLowerCase()}
    `;

    if (existing.length > 0 && existing[0].id !== userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Username already taken' })
      };
    }

    // Update username
    const result = await sql`
      UPDATE users 
      SET username = ${newUsername.toLowerCase()} 
      WHERE id = ${userId}
      RETURNING id, username
    `;

    if (result.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: result[0]
      })
    };
  } catch (error) {
    console.error('Update username error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
