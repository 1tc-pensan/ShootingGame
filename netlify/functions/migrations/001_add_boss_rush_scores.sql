-- Create boss_rush_scores table
CREATE TABLE IF NOT EXISTS boss_rush_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_boss_rush_score ON boss_rush_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_boss_rush_user_score ON boss_rush_scores(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_boss_rush_created_at ON boss_rush_scores(created_at DESC);
