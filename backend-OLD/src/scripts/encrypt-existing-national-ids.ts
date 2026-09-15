import 'dotenv/config';
import { db } from '../config/database';
import { customers, agents } from '../db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { encryptField, hashForLookup } from '../lib/fieldCrypto';

// ============================================
// One-time backfill: encrypts any national ID that's still stored in
// plaintext from before field-level encryption existed.
//
// SAFE TO RE-RUN: a value already in the "<iv>:<authTag>:<ciphertext>"
// envelope (3 base64 parts joined by ':') is skipped, so running this
// twice — or running it after some rows are already encrypted and others
// aren't — never double-encrypts anything.
//
// RUN THIS ONCE, right after applying the schema migration that widened
// the nationalId column and added nationalIdHash, and BEFORE relying on
// the admin dashboard to show any existing customer's/agent's national ID
// — until this runs, old plaintext values will fail to decrypt (shown as
// blank/masked rather than crashing, but not actually protected either).
//
// Usage:
//   cd backend
//   npx ts-node src/scripts/encrypt-existing-national-ids.ts
// ============================================

// A value already in our encrypted envelope format: 3 base64-looking
// segments joined by colons. A plain 16-digit national ID will never
// accidentally match this shape, so this check is safe.
function looksAlreadyEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p));
}

async function backfillTable(label: string, table: typeof customers | typeof agents) {
  const rows = await db.select().from(table as any).where(isNotNull((table as any).nationalId));
  let encrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows as any[]) {
    const plaintext = row.nationalId as string;
    if (looksAlreadyEncrypted(plaintext)) {
      skipped++;
      continue;
    }
    try {
      await db
        .update(table as any)
        .set({ nationalId: encryptField(plaintext), nationalIdHash: hashForLookup(plaintext) })
        .where(eq((table as any).id, row.id));
      encrypted++;
    } catch (err) {
      console.error(`  ❌ Failed to encrypt ${label} #${row.id}:`, err);
      failed++;
    }
  }

  console.log(`${label}: ${encrypted} encrypted, ${skipped} already encrypted (skipped), ${failed} failed`);
  return { encrypted, skipped, failed };
}

async function main() {
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.error('❌ FIELD_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`, add it to your environment, and run this again.');
    process.exit(1);
  }

  console.log('Encrypting existing plaintext national IDs...\n');
  const customerResult = await backfillTable('customers', customers);
  const agentResult = await backfillTable('agents', agents);

  console.log('\nDone.');
  console.log(`Total encrypted: ${customerResult.encrypted + agentResult.encrypted}`);
  if (customerResult.failed + agentResult.failed > 0) {
    console.error(`⚠️  ${customerResult.failed + agentResult.failed} row(s) failed — check the errors above before considering this complete.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill script crashed:', err);
  process.exit(1);
});
