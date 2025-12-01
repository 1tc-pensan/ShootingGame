-- Reset all users' coins and permanent upgrades
UPDATE users 
SET coins = 0, 
    permanent_upgrades = '[]'
WHERE id > 0;
