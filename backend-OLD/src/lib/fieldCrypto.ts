import crypto from 'crypto';

// ============================================
// Field-level encryption for sensitive data at rest.
//
// WHY THIS EXISTS: national ID numbers (required to open a PayGo
// installment plan) were being stored as plain text in the database —
// a real government ID number, sitting in cleartext, readable by
// anyone with database access. That's the most exposed compliance gap
// on this platform: Rwanda's data protection law treats national ID
// as sensitive personal data, and any KYC-driven lending product
// (which PayGo is) should not be storing the ID used to verify
// identity in a form that a database leak or an overly-broad Supabase
// role could expose directly.
//
// HOW IT WORKS: AES-256-GCM (authenticated encryption — tampering with
// the stored value is detected, not just theoretically possible to
// decrypt). Each value gets a random IV, so encrypting the same
// national ID twice produces different ciphertext — this is why a
// SEPARATE deterministic hash (see hashForLookup) exists for exact-match
// search: the encrypted value itself can never be searched or compared
// directly in SQL.
//
// CONFIGURATION: requires FIELD_ENCRYPTION_KEY — a 32-byte key encoded
// as 64 hex characters. Generate one with:
//   openssl rand -hex 32
// This throws (rather than silently storing plaintext or garbage) if
// the key is missing or the wrong length — a missing encryption key
// for a KYC identity number should be a hard stop, not a fallback.
// ============================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

function getKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('FIELD_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` and add it to your environment before storing or reading national ID numbers.');
  }
  const key = Buffer.from(secret, 'hex');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters (openssl rand -hex 32).');
  }
  return key;
}

// Stored format: "<iv>:<authTag>:<ciphertext>", each base64-encoded.
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptField(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted field value — expected "<iv>:<authTag>:<ciphertext>".');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

// Deterministic HMAC-SHA256 of the plaintext, used ONLY as a lookup
// index (exact-match search) alongside the encrypted value — never used
// to reconstruct the original value, and on its own reveals nothing
// about the plaintext beyond "same input produces same hash."
export function hashForLookup(plaintext: string): string {
  return crypto.createHmac('sha256', getKey()).update(plaintext).digest('hex');
}

// For display in admin lists/exports where the full ID isn't needed —
// shows only the last 4 digits, matching how card numbers/SSNs are
// conventionally masked. Full ID is only decrypted on the single-record
// detail view, where there's a real reason to need it.
export function maskNationalId(plaintext: string): string {
  if (plaintext.length <= 4) return plaintext;
  return `${'*'.repeat(plaintext.length - 4)}${plaintext.slice(-4)}`;
}

// Shared "upsert" resolver used everywhere a customer/agent record is
// updated with an OPTIONAL new national ID that should fall back to
// whatever's already stored if not provided. Centralized here so every
// call site gets the encrypt+hash pairing right instead of each one
// reimplementing (and risking forgetting the hash half of) the same logic.
export function resolveNationalIdUpdate(
  newPlaintext: string | null | undefined,
  existingEncrypted: string | null | undefined,
  existingHash: string | null | undefined
): { nationalId: string | null; nationalIdHash: string | null } {
  if (newPlaintext) {
    return { nationalId: encryptField(newPlaintext), nationalIdHash: hashForLookup(newPlaintext) };
  }
  return { nationalId: existingEncrypted ?? null, nationalIdHash: existingHash ?? null };
}
