const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'leaderboard.json');

app.use(cors());
app.use(express.json());

// If DATABASE_URL is set, use Postgres instead of file storage
const USE_DB = !!process.env.DATABASE_URL;
let pool = null;

if (USE_DB) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS leaderboard (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          score INTEGER NOT NULL,
          wave INTEGER NOT NULL,
          kills INTEGER NOT NULL,
          date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)`);
      console.log('Database leaderboard initialized');
    } catch (err) {
      console.error('DB init error:', err);
    }
  })();
}

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { type } = req.query; // '24h' or 'alltime'

    if (USE_DB && pool) {
      let query = 'SELECT name, score, wave, kills, date FROM leaderboard';
      const params = [];
      if (type === '24h') {
        query += " WHERE date > NOW() - INTERVAL '24 hours'";
      }
      query += ' ORDER BY score DESC LIMIT 50';
      const result = await pool.query(query, params);
      const leaderboard = result.rows.map(r => ({ name: r.name, score: r.score, wave: r.wave, kills: r.kills, date: r.date }));
      return res.json(leaderboard);
    }

    const data = await fs.readFile(DATA_FILE, 'utf8');
    let leaderboard = JSON.parse(data);

    // Filter by 24h if requested
    if (type === '24h') {
      const now = new Date().getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      leaderboard = leaderboard.filter(entry => {
        if (!entry.date) return false;
        const entryTime = new Date(entry.date).getTime();
        return (now - entryTime) <= twentyFourHours;
      });
    }

    res.json(leaderboard);
  } catch (error) {
    console.error('Error reading leaderboard:', error);
    res.status(500).json({ error: 'Failed to read leaderboard' });
  }
});

// Save score
app.post('/api/leaderboard', async (req, res) => {
  try {
    const { name, score, wave, kills } = req.body;

    if (!name || score === undefined || wave === undefined || kills === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const playerName = name.substring(0, 50);
    const newScore = parseInt(score);

    if (USE_DB && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query('SELECT id, score FROM leaderboard WHERE LOWER(name) = LOWER($1)', [playerName]);
        if (found.rowCount > 0 && found.rows[0].score >= newScore) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Player already has a better score', existingScore: found.rows[0].score });
        }
        // remove old entry
        await client.query('DELETE FROM leaderboard WHERE LOWER(name) = LOWER($1)', [playerName]);
        // insert new
        await client.query('INSERT INTO leaderboard(name, score, wave, kills, date) VALUES($1,$2,$3,$4,NOW())', [playerName, newScore, parseInt(wave), parseInt(kills)]);
        await client.query('COMMIT');
        const top = await pool.query('SELECT name, score, wave, kills, date FROM leaderboard ORDER BY score DESC LIMIT 10');
        return res.json({ success: true, leaderboard: top.rows });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('DB save error:', err);
        return res.status(500).json({ error: 'Failed to save score' });
      } finally {
        client.release();
      }
    }

    // File-based fallback
    const data = await fs.readFile(DATA_FILE, 'utf8');
    let leaderboard = JSON.parse(data);

    const playerLower = playerName.substring(0, 15).toLowerCase();

    // Check if player already has a better score
    const existingEntry = leaderboard.find(e => e.name.toLowerCase() === playerLower);
    if (existingEntry && existingEntry.score >= newScore) {
      return res.status(400).json({ 
        error: 'Player already has a better score',
        existingScore: existingEntry.score 
      });
    }

    // Remove old entry from same player
    leaderboard = leaderboard.filter(e => e.name.toLowerCase() !== playerLower);

    const newEntry = {
      name: playerName.substring(0, 15),
      score: newScore,
      wave: parseInt(wave),
      kills: parseInt(kills),
      date: new Date().toISOString()
    };

    leaderboard.push(newEntry);
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 50); // Keep top 50

    await fs.writeFile(DATA_FILE, JSON.stringify(leaderboard, null, 2));

    res.json({ success: true, leaderboard: leaderboard.slice(0, 10) });
  } catch (error) {
    console.error('Error saving score:', error);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

initLeaderboard().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Leaderboard API running on port ${PORT}`);
  });
});
