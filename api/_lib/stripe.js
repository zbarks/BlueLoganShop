import Stripe from 'stripe';
import { env } from './env.js';

let client = null;
export function stripe() {
  if (!env.stripeSecret) return null;
  if (!client) {
    const opts = { maxNetworkRetries: 2 };
    if (env.stripeApiBase) {            // tests only
      const u = new URL(env.stripeApiBase);
      Object.assign(opts, { host: u.hostname, port: u.port, protocol: u.protocol.replace(':', '') });
    }
    client = new Stripe(env.stripeSecret, opts);
  }
  return client;
}

// -------------------------------------------------------------
//  Shipping address. Hepple bug fix: newer Stripe API versions put the
//  address in collected_information.shipping_details, older ones in
//  shipping_details. Read both, fall back to the billing address, and
//  return null (never throw) if there is nothing.
// -------------------------------------------------------------
export function extractShippingAddress(s) {
  const sd = (s.collected_information && s.collected_information.shipping_details)
    || (s.shipping_details && s.shipping_details.address ? s.shipping_details : null)
    || (s.shipping && s.shipping.address ? s.shipping : null);
  const address = (sd && sd.address) || (s.customer_details && s.customer_details.address) || null;
  if (!address || !(address.line1 || address.postal_code)) return null;
  const name = (sd && sd.name) || (s.customer_details && s.customer_details.name) || null;
  return {
    name, line1: address.line1 || null, line2: address.line2 || null, city: address.city || null,
    state: address.state || null, postal_code: address.postal_code || null, country: address.country || null,
  };
}
