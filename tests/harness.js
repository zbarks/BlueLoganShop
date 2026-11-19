// Starts the mocks and the dev server together for the tests.
//   node tests/harness.js            (prints READY when up)
//   DEMO=1 node tests/harness.js     (no database: design preview mode)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = { site: 4100, supa: 4101, stripe: 4102, resend: 4103 };
const demo = process.env.DEMO === '1';

Object.assign(process.env, {
  SITE_URL: `http://localhost:${P.site}`,
  MAIN_SITE_URL: 'https://bluelogan.co.uk',
  ADMIN_EMAIL: 'blue@example.com',
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
  STRIPE_API_BASE: `http://localhost:${P.stripe}`,
  RESEND_API_KEY: 're_test', RESEND_API_BASE: `http://localhost:${P.resend}`, EMAILS_ENABLED: 'true',
  EMAIL_FROM: 'Blue Logan <orders@example.com>',
  PORTAL_USERNAME: 'admin', PORTAL_PASSWORD: 'test-only-password', SESSION_SECRET: 'x'.repeat(64),
});
if (!demo) Object.assign(process.env, { SUPABASE_URL: `http://localhost:${P.supa}`, SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });

const { startSupabase, startStripe, startResend } = await import('./mocks.js');
const { startDevServer } = await import('./dev-server.js');

if (!demo) await startSupabase({ port: P.supa, root, anonKey: 'anon-key', serviceKey: 'service-key', users: {
  'blue@example.com': { id: '11111111-1111-4111-8111-111111111111', password: 'correct horse', business: 'bluelogan' },
  'cleanway@example.com': { id: '22222222-2222-4222-8222-222222222222', password: 'pw', business: 'cleanway' },
  'someone@example.com': { id: '33333333-3333-4333-8333-333333333333', password: 'pw' },
} });
await startStripe({ port: P.stripe, webhookUrl: `http://localhost:${P.site}/api/stripe-webhook`, webhookSecret: 'whsec_test_mock' });
await startResend({ port: P.resend });
await startDevServer({ port: P.site, root });
console.log('READY', JSON.stringify(P));
