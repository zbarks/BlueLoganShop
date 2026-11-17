import { env } from './env.js';

// Server-side PostHog event (same as Hepple: deduplicated on the session id).
export async function capturePostHog(event, distinctId, properties) {
  if (!env.posthogEnabled) return { skipped: 'posthog-disabled' };
  try {
    await fetch(`${env.posthogHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.posthogKey, event, distinct_id: distinctId, properties }),
    });
    return { ok: true };
  } catch (e) { return { error: String(e && e.message) }; }
}

// -------------------------------------------------------------
//  Shipping label hook (LATER PHASE, NOT BUILT).
//
//  When Royal Mail Click & Drop / FedEx automation is added (as built for
//  Hepple), implement createLabel() to create the shipment and return
//  { tracking_number, carrier, label_url }. The portal's "Mark as shipped"
//  action already calls this first when SHIPPING_AUTOMATION=true, and
//  falls back to the tracking number Blue typed in.
// -------------------------------------------------------------
export async function createLabel(/* order */) {
  if (process.env.SHIPPING_AUTOMATION !== 'true') return null;
  return null; // TODO(later phase): Click & Drop for single items, FedEx for 2+.
}
