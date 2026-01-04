// Usage: node grant-admin.js <userId|username>
// Load environment from .env if dotenv is available (optional)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — assume environment variables are provided externally
}
const { initDB, getDB } = require('../netlify/functions/db');

(async () => {
  await initDB();
  const sql = getDB();

  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node grant-admin.js <userId|username>');
    process.exit(1);
  }

  const maybeId = parseInt(arg, 10);

  try {
    if (!isNaN(maybeId)) {
      const res = await sql`UPDATE users SET is_admin = TRUE WHERE id = ${maybeId} RETURNING id, username, is_admin`;
      console.log('Updated:', res);
      if (res && res.length > 0) {
        const userId = res[0].id;
        await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
        console.log(`Cleared sessions for user ${userId}`);
      }
    } else {
      const res = await sql`UPDATE users SET is_admin = TRUE WHERE username = ${arg} RETURNING id, username, is_admin`;
      console.log('Updated:', res);
      if (res && res.length > 0) {
        const userId = res[0].id;
        await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
        console.log(`Cleared sessions for user ${userId}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('Error granting admin:', err);
    process.exit(1);
  }
})();
