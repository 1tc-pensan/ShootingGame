const { initDB, getDB, cleanExpiredSessions } = require('./db');
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
    .trim();
}

// Validate score data
function validateScoreData(score, wave, kills) {
  const scoreNum = parseInt(score);
  const waveNum = parseInt(wave);
  const killsNum = parseInt(kills);
  
  // Check if valid numbers
  if (isNaN(scoreNum) || isNaN(waveNum) || isNaN(killsNum)) return false;
  
  // Check if positive
  if (scoreNum < 0 || waveNum < 0 || killsNum < 0) return false;
  
  // Check reasonable limits (anti-cheat)
  if (scoreNum > 10000000) return false; // Max 10M score
  if (waveNum > 1000) return false; // Max wave 1000
  if (killsNum > 100000) return false; // Max 100k kills
  
  // Basic consistency check
  if (scoreNum > 0 && killsNum === 0) return false; // Can't have score without kills
  if (waveNum > 1 && killsNum === 0) return false; // Can't have waves without kills
  
  return true;
}

async function initLeaderboard() {
  await initDB();
}

exports.handler = async (event) => {
  await initLeaderboard();
  const sql = getDB();
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://neon.tech;",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Rate limiting for POST requests (score submission)
  if (event.httpMethod === 'POST') {
    const clientIP = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    const rateLimit = checkRateLimit(`score_${clientIP}`);
    
    headers['X-RateLimit-Limit'] = '50';
    headers['X-RateLimit-Remaining'] = rateLimit.remaining.toString();
    
    if (!rateLimit.allowed) {
      headers['Retry-After'] = rateLimit.retryAfter.toString();
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'Too many score submissions. Please try again later.',
          retryAfter: rateLimit.retryAfter 
        })
      };
    }
  }

  try {
    if (event.httpMethod === 'GET') {
      const type = event.queryStringParameters?.type; // '24h' or 'alltime'
      const gameMode = event.queryStringParameters?.gameMode || 'classic'; // 'classic' or 'boss_rush'
      
      let scores;
      
      if (gameMode === 'boss_rush') {
        if (type === '24h') {
          scores = await sql`
            SELECT s.id, u.username as name, s.score, s.wave, s.kills, s.created_at as date
            FROM boss_rush_scores s
            JOIN users u ON s.user_id = u.id
            WHERE s.created_at >= NOW() - INTERVAL '1 day'
            ORDER BY s.score DESC
            LIMIT 10
          `;
        } else {
          scores = await sql`
            SELECT s.id, u.username as name, s.score, s.wave, s.kills, s.created_at as date
            FROM boss_rush_scores s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.score DESC
            LIMIT 10
          `;
        }
      } else {
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
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(scores || [])
      };
    }

    if (event.httpMethod === 'POST') {
      const { token, score, wave, kills, gameMode } = JSON.parse(event.body);
      
      if (!token || score === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      // Validate score data
      if (!validateScoreData(score, wave, kills)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid score data' })
        };
      }

      // Validate token format
      if (typeof token !== 'string' || token.length !== 64) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid token format' })
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
      const newWave = parseInt(wave);
      const newKills = parseInt(kills);
      const mode = gameMode || 'classic';

      // Check if player already has a better score in this game mode
      if (mode === 'boss_rush') {
        const maxScores = await sql`
          SELECT MAX(score) as maxScore 
          FROM boss_rush_scores 
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

        // Insert new score into boss rush table
        await sql`
          INSERT INTO boss_rush_scores (user_id, score, wave, kills) 
          VALUES (${userId}, ${newScore}, ${newWave}, ${newKills})
        `;

        // Get updated leaderboard for boss rush
        const leaderboard = await sql`
          SELECT s.id, u.username as name, s.score, s.wave, s.kills, s.created_at as date
          FROM boss_rush_scores s
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
      } else {
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

        // Insert new score into classic table
        await sql`
          INSERT INTO scores (user_id, score, wave, kills) 
          VALUES (${userId}, ${newScore}, ${newWave}, ${newKills})
        `;

        // Get updated leaderboard for classic
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
