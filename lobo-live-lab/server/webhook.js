// Outbound webhook — optional. If WEBHOOK_URL + WEBHOOK_SECRET are set, POST every
// normalised event as JSON with an X-Signature: sha256=<hex-hmac> header.
const crypto = require('crypto');

async function dispatch(ev) {
  const url = process.env.WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!url || !secret) return;
  const body = JSON.stringify(ev);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
      body,
    });
  } catch (e) {
    // Don't crash the pipeline on webhook failure
    // eslint-disable-next-line no-console
    console.warn('[webhook] dispatch failed:', e && e.message);
  }
}

module.exports = { dispatch };
