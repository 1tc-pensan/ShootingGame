const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = '/tmp/leaderboard.json';

async function initLeaderboard() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([]));
  }
}

exports.handler = async (event) => {
  await initLeaderboard();
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    try {
      const type = event.queryStringParameters?.type; // '24h' or 'alltime'
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
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(leaderboard.slice(0, 10))
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to read leaderboard' })
      };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { name, score, wave, kills } = JSON.parse(event.body);
      
      if (!name || score === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      const data = await fs.readFile(DATA_FILE, 'utf8');
      let leaderboard = JSON.parse(data);

      const playerName = name.substring(0, 15).toLowerCase();
      const newScore = parseInt(score);
      
      // Check if player already has a better score
      const existingEntry = leaderboard.find(e => e.name.toLowerCase() === playerName);
      
      if (existingEntry && existingEntry.score >= newScore) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Player already has a better score',
            existingScore: existingEntry.score 
          })
        };
      }
      
      // Remove old entry from same player
      leaderboard = leaderboard.filter(e => e.name.toLowerCase() !== playerName);

      const newEntry = {
        name: name.substring(0, 15),
        score: newScore,
        wave: parseInt(wave),
        kills: parseInt(kills),
        date: new Date().toISOString()
      };

      leaderboard.push(newEntry);
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard = leaderboard.slice(0, 50);

      await fs.writeFile(DATA_FILE, JSON.stringify(leaderboard));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          leaderboard: leaderboard.slice(0, 10) 
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to save score' })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
