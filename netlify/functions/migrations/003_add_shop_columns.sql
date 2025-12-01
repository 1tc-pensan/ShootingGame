-- Add shop-related columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permanent_upgrades TEXT DEFAULT '[]';

-- Add submitted_at column to scores tables
ALTER TABLE scores ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE boss_rush_scores ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins);
CREATE INDEX IF NOT EXISTS idx_scores_submitted_at ON scores(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_boss_rush_submitted_at ON boss_rush_scores(submitted_at DESC);
