// Local cron runner that ticks /api/cron/tick every 10 seconds
const http = require('http');

console.log('[Cron Runner] Started. Pinging http://localhost:3000/api/cron/tick every 10s...');

async function tick() {
  try {
    const res = await fetch('http://localhost:3000/api/cron/tick', {
      headers: {
        'x-cron-secret': process.env.CRON_SECRET || 'huanseek_internal_cron_secret_2026_secure'
      }
    });
    const json = await res.json();
    if (json.closed_submissions_count > 0) {
      console.log(`[Cron Runner] Processed & extracted ${json.closed_submissions_count} batch(es) at ${new Date().toLocaleTimeString()}`);
    }
  } catch (err) {
    // Ignore transient connection errors
  }
}

// Tick immediately then every 10 seconds
tick();
setInterval(tick, 10000);
