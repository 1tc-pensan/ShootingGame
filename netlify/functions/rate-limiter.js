// Simple in-memory rate limiter
// For production, use Redis or similar
const requestCounts = new Map();
const WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS = 10; // Max requests per window

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
}

function checkRateLimit(identifier) {
  cleanupOldEntries();
  
  const now = Date.now();
  const data = requestCounts.get(identifier);
  
  if (!data) {
    requestCounts.set(identifier, {
      count: 1,
      windowStart: now
    });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }
  
  // Check if window has expired
  if (now - data.windowStart > WINDOW_MS) {
    requestCounts.set(identifier, {
      count: 1,
      windowStart: now
    });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }
  
  // Increment count
  data.count++;
  
  if (data.count > MAX_REQUESTS) {
    return { 
      allowed: false, 
      remaining: 0,
      retryAfter: Math.ceil((WINDOW_MS - (now - data.windowStart)) / 1000)
    };
  }
  
  return { allowed: true, remaining: MAX_REQUESTS - data.count };
}

module.exports = { checkRateLimit };
