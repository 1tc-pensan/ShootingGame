const { initDB, getDB, cleanExpiredSessions } = require('./db');

async function initProfile() {
  await initDB();
}

exports.handler = async (event) => {
  await initProfile();
  const sql = getDB();
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      // Get profile data (coins + upgrades)
      const { token } = event.queryStringParameters || {};
      
      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Token required' })
        };
      }

      await cleanExpiredSessions();

      const sessions = await sql`
        SELECT s.user_id, u.coins, u.permanent_upgrades
        FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.token = ${token} AND s.expires_at > NOW()
      `;

      if (sessions.length === 0) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired token' })
        };
      }

      const profile = sessions[0];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          coins: profile.coins || 0,
          permanentUpgrades: JSON.parse(profile.permanent_upgrades || '[]')
        })
      };
    }

    if (event.httpMethod === 'POST') {
      // Save profile data (coins + upgrades)
      const { token, coins, permanentUpgrades } = JSON.parse(event.body);
      
      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Token required' })
        };
      }

      await cleanExpiredSessions();

      const sessions = await sql`
        SELECT s.user_id
        FROM sessions s 
        WHERE s.token = ${token} AND s.expires_at > NOW()
      `;

      if (sessions.length === 0) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired token' })
        };
      }

      const userId = sessions[0].user_id;
      const coinsValue = parseInt(coins) || 0;
      const upgradesJson = JSON.stringify(permanentUpgrades || []);

      await sql`
        UPDATE users 
        SET coins = ${coinsValue}, permanent_upgrades = ${upgradesJson}
        WHERE id = ${userId}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    console.error('Profile error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
