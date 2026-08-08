import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../config/database';
import { products, admins } from './schema';
import { eq } from 'drizzle-orm';

// The real KosmoPads catalogue, matching kosmopads.rw
const CATALOGUE = [
  {
    name: 'Large Package',
    description: '1 Large KosmoPad (333mm × 206mm) is suitable for heavy flow.',
    priceRwf: 2000,
    packageType: 'large',
    imageUrl: '/images/large-package.png',
  },
  {
    name: 'Medium Package',
    description: '5 Medium KosmoPads (305mm × 190mm) are dignity kits, best for normal flow.',
    priceRwf: 6000,
    packageType: 'medium',
    imageUrl: '/images/medium-package.png',
  },
  {
    name: 'Nursing Pads',
    description: 'Nursing pads are worn inside the bra by lactating mothers to absorb leakage.',
    priceRwf: 600,
    packageType: 'nursing',
    imageUrl: '/images/nursing-pads.png',
  },
  {
    name: 'Mix of 2 Package',
    description: '1 Small and 1 Medium KosmoPads mixed for experiencing our sustainable pads.',
    priceRwf: 2500,
    packageType: 'mix',
    imageUrl: '/images/mix-package.png',
  },
  {
    name: 'Small Package',
    description: '5 Small KosmoPads (275mm × 190mm) are dignity kits, best for light-normal flow.',
    priceRwf: 5000,
    packageType: 'small',
    imageUrl: '/images/small-package.png',
  },
  {
    name: 'Pantyliner Package',
    description: 'Our Pantyliners absorb light discharge and spotting and protect underwear from stains and odor. 5 pieces per package.',
    priceRwf: 3000,
    packageType: 'pantyliner',
    imageUrl: '/images/pantyliner-package.png',
  },
];

async function seedProducts() {
  for (const item of CATALOGUE) {
    const [existing] = await db.select().from(products).where(eq(products.name, item.name));
    if (existing) {
      await db.update(products).set({ ...item, updatedAt: new Date() }).where(eq(products.id, existing.id));
      console.log(`↻ Updated product: ${item.name}`);
    } else {
      await db.insert(products).values(item);
      console.log(`✓ Inserted product: ${item.name}`);
    }
  }
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@kosmotive.rw').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME || 'Kosmotive Admin';

  const [existing] = await db.select().from(admins).where(eq(admins.email, email));
  if (existing) {
    console.log(`↻ Admin already exists: ${email} (skipping)`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(admins).values({ name, email, passwordHash, role: 'superadmin' });
  console.log(`✓ Created admin: ${email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  ⚠️  Using default password "${password}" — set SEED_ADMIN_PASSWORD in .env before seeding in production, and change it after first login.`);
  }
}

async function main() {
  console.log('🌱 Seeding KosmoPads database...\n');
  await seedProducts();
  await seedAdmin();
  console.log('\n✅ Seeding complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
