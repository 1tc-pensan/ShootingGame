const { initDB, getDB } = require('./db');

// Check if user is admin (user_id = 1)
async function isAdmin(token) {
  const sql = getDB();
  
  const sessions = await sql`
    SELECT user_id 
    FROM sessions 
    WHERE token = ${token} AND expires_at > NOW()
  `;
  
  return sessions.length > 0 && sessions[0].user_id === 1;
}

exports.handler = async (event) => {
  await initDB();
  const sql = getDB();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, token } = body;

    // Verify admin
    if (!token || !(await isAdmin(token))) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Unauthorized - Admin access required' })
      };
    }

    // GET STATISTICS
    if (action === 'getStats') {
      const totalUsers = await sql`SELECT COUNT(*) as count FROM users`;
      const totalScores = await sql`SELECT COUNT(*) as count FROM scores`;
      const topScore = await sql`SELECT MAX(score) as max FROM scores`;
      const totalKills = await sql`SELECT SUM(kills) as total FROM scores`;
      const maxWave = await sql`SELECT MAX(wave) as max FROM scores`;
      
      const recentUsers = await sql`
        SELECT username, created_at 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT 5
      `;
      
      const suspiciousScores = await sql`
        SELECT s.id, u.username, s.score, s.wave, s.kills, s.submitted_at
        FROM scores s
        JOIN users u ON s.user_id = u.id
        WHERE s.score > 50000 OR s.wave > 100 OR s.kills > 5000
        ORDER BY s.score DESC
        LIMIT 10
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          totalUsers: totalUsers[0].count,
          totalScores: totalScores[0].count,
          topScore: topScore[0].max || 0,
          totalKills: totalKills[0].total || 0,
          maxWave: maxWave[0].max || 0,
          recentUsers,
          suspiciousScores
        })
      };
    }

    // GET ALL USERS
    if (action === 'getUsers') {
      const users = await sql`
        SELECT u.id, u.username, u.email, u.created_at,
               COUNT(s.id) as score_count,
               MAX(s.score) as best_score
        FROM users u
        LEFT JOIN scores s ON u.id = s.user_id
        GROUP BY u.id, u.username, u.email, u.created_at
        ORDER BY u.created_at DESC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ users })
      };
    }

    // DELETE USER
    if (action === 'deleteUser') {
      const { userId } = body;
      
      if (userId === 1) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Cannot delete admin user' })
        };
      }

      await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
      await sql`DELETE FROM scores WHERE user_id = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // DELETE SCORE
    if (action === 'deleteScore') {
      const { scoreId } = body;
      await sql`DELETE FROM scores WHERE id = ${scoreId}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // EDIT SCORE
    if (action === 'editScore') {
      const { scoreId, newScore, newWave, newKills } = body;
      
      if (!scoreId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'scoreId required' })
        };
      }

      const updates = [];
      const values = [];

      if (newScore !== undefined) {
        await sql`UPDATE scores SET score = ${newScore} WHERE id = ${scoreId}`;
      }
      if (newWave !== undefined) {
        await sql`UPDATE scores SET wave = ${newWave} WHERE id = ${scoreId}`;
      }
      if (newKills !== undefined) {
        await sql`UPDATE scores SET kills = ${newKills} WHERE id = ${scoreId}`;
      }

      const result = await sql`
        SELECT s.id, u.username, s.score, s.wave, s.kills, s.created_at
        FROM scores s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ${scoreId}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, score: result[0] })
      };
    }

    // GET ALL SCORES (with pagination)
    if (action === 'getAllScores') {
      const { page = 1, limit = 50 } = body;
      const offset = (page - 1) * limit;

      const scores = await sql`
        SELECT s.id, u.username, s.score, s.wave, s.kills, s.submitted_at
        FROM scores s
        JOIN users u ON s.user_id = u.id
        ORDER BY s.score DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const totalCount = await sql`SELECT COUNT(*) as count FROM scores`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          scores,
          totalPages: Math.ceil(totalCount[0].count / limit),
          currentPage: page
        })
      };
    }

    // SET ANNOUNCEMENT
    if (action === 'setAnnouncement') {
      const { message } = body;
      
      // Store in a simple key-value table or use environment variable
      // For now, we'll create/update a settings table
      await sql`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await sql`
        INSERT INTO settings (key, value) 
        VALUES ('announcement', ${message})
        ON CONFLICT (key) 
        DO UPDATE SET value = ${message}, updated_at = CURRENT_TIMESTAMP
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // CLEAR ANNOUNCEMENT
    if (action === 'clearAnnouncement') {
      await sql`DELETE FROM settings WHERE key = 'announcement'`;

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
    console.error('Admin error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
