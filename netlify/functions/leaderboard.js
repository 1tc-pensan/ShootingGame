const { initDB, getDB, cleanExpiredSessions } = require('./db');

async function initLeaderboard() {
  await initDB();
}

exports.handler = async (event) => {
  await initLeaderboard();
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
    if (event.httpMethod === 'GET') {
      const type = event.queryStringParameters?.type; // '24h' or 'alltime'
      
      let scores;
      
      if (type === '24h') {
        scores = await sql`
          SELECT s.id, u.username as name, s.score, s.wave, s.kills, s.created_at as date
          FROM scores s
          JOIN users u ON s.user_id = u.id
          WHERE s.created_at >= NOW() - INTERVAL '1 day'
          ORDER BY s.score DESC
          LIMIT 10
        `;
      } else {
        scores = await sql`
          SELECT s.id, u.username as name, s.score, s.wave, s.kills, s.created_at as date
          FROM scores s
          JOIN users u ON s.user_id = u.id
          ORDER BY s.score DESC
          LIMIT 10
        `;
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(scores || [])
      };
    }

    if (event.httpMethod === 'POST') {
      const { token, score, wave, kills } = JSON.parse(event.body);
      
      if (!token || score === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      // Clean expired sessions
      await cleanExpiredSessions();

      // Verify token and get user
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
          body: JSON.stringify({ error: 'Invalid or expired token' })
        };
      }

      const userId = sessions[0].user_id;
      const newScore = parseInt(score);

      // Check if player already has a better score
      const maxScores = await sql`
        SELECT MAX(score) as maxScore 
        FROM scores 
        WHERE user_id = ${userId}
      `;

      if (maxScores[0] && maxScores[0].maxscore >= newScore) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'You already have a better score',
            existingScore: maxScores[0].maxscore 
          })
        };
      }

      // Insert new score
      await sql`
        INSERT INTO scores (user_id, score, wave, kills) 
        VALUES (${userId}, ${newScore}, ${parseInt(wave)}, ${parseInt(kills)})
      `;

      // Get updated leaderboard
      const leaderboard = await sql`
        SELECT s.id, u.username as name, s.score, s.wave, s.kills, s.created_at as date
        FROM scores s
        JOIN users u ON s.user_id = u.id
        ORDER BY s.score DESC 
        LIMIT 10
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          leaderboard: leaderboard 
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    console.error('Leaderboard error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
