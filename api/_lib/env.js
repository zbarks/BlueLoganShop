// =============================================================
//  Environment. Every secret comes from env vars, never code.
//  See .env.example for the full annotated list.
//  Designed by Barker Digital
// =============================================================

const trim = (s) => (s || '').replace(/\/+$/, '');

export const env = {
  get siteUrl()        { return trim(process.env.SITE_URL); },
  get mainSiteUrl()    { return trim(process.env.MAIN_SITE_URL) || 'https://bluelogan.co.uk'; }, // TODO(Zach): confirm main site URL
  get adminEmail()     { return (process.env.ADMIN_EMAIL || '').trim().toLowerCase(); },

  get stripeSecret()   { return process.env.STRIPE_SECRET_KEY || ''; },
  get stripePublishable() { return process.env.STRIPE_PUBLISHABLE_KEY || ''; },
  get stripeWebhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || ''; },

  get supabaseUrl()    { return trim(process.env.SUPABASE_URL); },
  get supabaseAnon()   { return process.env.SUPABASE_ANON_KEY || ''; },
  get supabaseService(){ return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; },

  get resendKey()      { return process.env.RESEND_API_KEY || ''; },
  get emailFrom()      { return process.env.EMAIL_FROM || 'Blue Logan <onboarding@resend.dev>'; },
  get emailReplyTo()   { return process.env.EMAIL_REPLY_TO || ''; },
  get emailsEnabled()  { return process.env.EMAILS_ENABLED === 'true' && !!process.env.RESEND_API_KEY; },

  get posthogEnabled() { return process.env.POSTHOG_ENABLED === 'true' && !!process.env.POSTHOG_KEY; },
  get posthogKey()     { return process.env.POSTHOG_KEY || ''; },
  get posthogHost()    { return trim(process.env.POSTHOG_HOST) || 'https://eu.i.posthog.com'; },

  // Test-only overrides so the automated tests can point at local mocks.
  // Leave unset in every real environment.
  get stripeApiBase()  { return process.env.STRIPE_API_BASE || ''; },
  get resendApiBase()  { return trim(process.env.RESEND_API_BASE) || 'https://api.resend.com'; },

  get dbConfigured()   { return !!(this.supabaseUrl && this.supabaseService && this.supabaseAnon); },
};
