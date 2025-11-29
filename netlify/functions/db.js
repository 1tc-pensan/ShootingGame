const { neon } = require('@neondatabase/serverless');

// Get database URL from environment variable
const getDatabaseUrl = () => {
  // Try multiple environment variable names that Netlify/Neon might use
  return process.env.DATABASE_URL || 
         process.env.NETLIFY_DATABASE_URL || 
         process.env.NEON_DATABASE_URL ||
         process.env.POSTGRES_URL;
};

let sql = null;

async function initDB() {
  if (sql) {
    return sql;
  }

  try {
    const databaseUrl = getDatabaseUrl();
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Create Neon serverless SQL client
    sql = neon(databaseUrl);

    // Create tables if they don't exist
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        coins INTEGER DEFAULT 0,
        permanent_upgrades TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_username ON users(username)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        wave INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_score ON scores(score DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_score ON scores(user_id, score DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_created_at ON scores(created_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_token ON sessions(token)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_expires ON sessions(expires_at)
    `;

    console.log('Database initialized successfully');
    return sql;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

function getDB() {
  if (!sql) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return sql;
}

// Clean up expired sessions
async function cleanExpiredSessions() {
  try {
    const sql = getDB();
    await sql`DELETE FROM sessions WHERE expires_at < NOW()`;
  } catch (error) {
    console.error('Error cleaning expired sessions:', error);
  }
}

module.exports = { initDB, getDB, cleanExpiredSessions };
