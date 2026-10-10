// Public runtime configuration. The quote endpoint URL is safe to expose;
// the SuperFrete token must stay only in the Edge Function environment.
window.LIGHT_CONFIG = {
  shippingQuoteEndpoint: "https://pmelkpobmunvfvjsrcmd.supabase.co/functions/v1/shipping-quote",
};
