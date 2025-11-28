const { initDB, getDB } = require('./db');

exports.handler = async (event) => {
  await initDB();
  const sql = getDB();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://neon.tech;",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Check if settings table exists
    const announcement = await sql`
      SELECT value FROM settings WHERE key = 'announcement'
    `.catch(() => []);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        announcement: announcement.length > 0 ? announcement[0].value : null
      })
    };
  } catch (error) {
    console.error('Announcement error:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ announcement: null })
    };
  }
};
