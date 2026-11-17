// =============================================================
//  npm run check:webhook
//  Guards against the Hepple 308 bug. Sends a POST to the webhook URL
//  with redirects switched OFF (Stripe never follows them) and fails if
//  the answer is a 3xx. A healthy endpoint answers 400 (bad signature),
//  which proves the request reached the function itself.
//    SITE_URL=https://shop.example.com npm run check:webhook
// =============================================================

const base = (process.env.SITE_URL || process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.error('Set SITE_URL (or pass the site URL as an argument).'); process.exit(2); }
const url = `${base}/api/stripe-webhook`;

const r = await fetch(url, { method: 'POST', redirect: 'manual', headers: { 'stripe-signature': 'check', 'content-type': 'application/json' }, body: '{}' });
if (r.status >= 300 && r.status < 400) {
  console.error(`FAIL  ${url} answered ${r.status} and redirects to ${r.headers.get('location')}`);
  console.error('      Register the final URL in Stripe instead, and set SITE_URL to that same host.');
  process.exit(1);
}
if (r.status === 400) { console.log(`OK    ${url} reached the webhook (no redirect).`); process.exit(0); }
console.error(`CHECK ${url} answered ${r.status}. Expected 400 for an unsigned test request. Are the Stripe env vars set?`);
process.exit(1);
