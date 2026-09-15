import { describe, it, expect, beforeEach } from 'vitest';
import { captureReferralFromUrl, getStoredReferralCode, clearStoredReferralCode } from '../src/utils/referral';

describe('referral attribution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the ref code from the URL, uppercased and trimmed', () => {
    captureReferralFromUrl('?ref=kos001');
    expect(getStoredReferralCode()).toBe('KOS001');
  });

  it('does nothing when there is no ref param', () => {
    captureReferralFromUrl('?utm_source=facebook');
    expect(getStoredReferralCode()).toBeUndefined();
  });

  it('is first-touch: a later visit does NOT overwrite an already-stored code', () => {
    // This is the business rule that matters — whichever agent's link the
    // customer clicked FIRST keeps the commission attribution, even if
    // the customer later clicks a different agent's link before checking out.
    captureReferralFromUrl('?ref=KOS001');
    captureReferralFromUrl('?ref=KOS999');
    expect(getStoredReferralCode()).toBe('KOS001');
  });

  it('clearStoredReferralCode allows a fresh code to be captured afterward', () => {
    captureReferralFromUrl('?ref=KOS001');
    clearStoredReferralCode();
    captureReferralFromUrl('?ref=KOS999');
    expect(getStoredReferralCode()).toBe('KOS999');
  });

  it('returns undefined when nothing has ever been stored', () => {
    expect(getStoredReferralCode()).toBeUndefined();
  });
});
