// Captures ?ref=KOS001 on first landing and persists it so it survives
// navigation across product pages, cart, and checkout. First-touch: once a
// referral code is stored, a later visit without ?ref (or with a different
// one) does NOT overwrite it — the first agent who sent the customer here
// keeps the attribution, matching the backend's orderSchema.agentCode.
const STORAGE_KEY = 'kosmopads_ref_code';

export function captureReferralFromUrl(search: string) {
  const params = new URLSearchParams(search);
  const ref = params.get('ref');
  if (!ref) return;
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    localStorage.setItem(STORAGE_KEY, ref.trim().toUpperCase());
  }
}

export function getStoredReferralCode(): string | undefined {
  return localStorage.getItem(STORAGE_KEY) || undefined;
}

export function clearStoredReferralCode() {
  localStorage.removeItem(STORAGE_KEY);
}
