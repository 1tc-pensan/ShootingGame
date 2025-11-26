const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'leaderboard.json');

app.use(cors());
app.use(express.json());

// Initialize leaderboard file
async function initLeaderboard() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([]));
  }
}

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const leaderboard = JSON.parse(data);
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

    const data = await fs.readFile(DATA_FILE, 'utf8');
    let leaderboard = JSON.parse(data);

    const newEntry = {
      name: name.substring(0, 15),
      score: parseInt(score),
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
