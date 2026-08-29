import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from '../config/database';
import { rwDistricts, rwSectors, rwCells, rwVillages } from './schema';
import { sql } from 'drizzle-orm';

// ============================================
// Seeds Rwanda's full administrative hierarchy (Province → District →
// Sector → Cell → Village) for the cascading location dropdowns — see
// src/routes/locations.ts.
//
// SOURCE: backend/data/rwanda-locations.json — a real, complete dataset
// (5 provinces, 30 districts, 416 sectors, 2,149 cells, 14,837 villages),
// matching Rwanda's actual official administrative structure. Shaped as
// nested objects: { [province]: { [district]: { [sector]: { [cell]:
// [villageName, ...] } } } }.
//
// This replaces hard-coded/CSV-import guessing entirely — every level of
// the hierarchy comes from this one real file, not from memory.
//
// Safe to re-run: wipes and reloads the four location tables each time
// (they're pure reference data with nothing else pointing into them via
// foreign key, so this is never destructive to real customer/agent data).
//
// Usage:
//   cd backend
//   npm run db:seed-locations
// ============================================

interface LocationData {
  [province: string]: {
    [district: string]: {
      [sector: string]: {
        [cell: string]: string[]; // village names
      };
    };
  };
}

async function main() {
  const filePath = path.join(__dirname, '../../data/rwanda-locations.json');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ${filePath} not found. Place the Rwanda locations JSON there before running this script.`);
    process.exit(1);
  }

  const data: LocationData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  console.log('Clearing existing location reference data...');
  // Order matters: children before parents, since FKs point upward.
  await db.execute(sql`TRUNCATE TABLE rw_villages, rw_cells, rw_sectors, rw_districts RESTART IDENTITY CASCADE`);

  let districtCount = 0;
  let sectorCount = 0;
  let cellCount = 0;
  let villageCount = 0;

  for (const [province, districts] of Object.entries(data)) {
    for (const [districtName, sectors] of Object.entries(districts)) {
      const [district] = await db.insert(rwDistricts).values({ province, name: districtName }).returning();
      districtCount++;

      // Batch-insert this district's sectors in one statement, then look
      // up their generated IDs by name — far fewer round trips than one
      // INSERT per sector/cell/village across a 14,000+ row dataset.
      const sectorNames = Object.keys(sectors);
      const insertedSectors = await db
        .insert(rwSectors)
        .values(sectorNames.map((name) => ({ districtId: district.id, name })))
        .returning();
      sectorCount += insertedSectors.length;
      const sectorIdByName = new Map(insertedSectors.map((s) => [s.name, s.id]));

      for (const [sectorName, cells] of Object.entries(sectors)) {
        const sectorId = sectorIdByName.get(sectorName)!;
        const cellNames = Object.keys(cells);
        const insertedCells = await db
          .insert(rwCells)
          .values(cellNames.map((name) => ({ sectorId, name })))
          .returning();
        cellCount += insertedCells.length;
        const cellIdByName = new Map(insertedCells.map((c) => [c.name, c.id]));

        // Villages for every cell in this sector, one batched insert.
        const villageRows: { cellId: number; name: string }[] = [];
        for (const [cellName, villages] of Object.entries(cells)) {
          const cellId = cellIdByName.get(cellName)!;
          for (const villageName of villages) {
            villageRows.push({ cellId, name: villageName });
          }
        }
        if (villageRows.length > 0) {
          await db.insert(rwVillages).values(villageRows);
          villageCount += villageRows.length;
        }
      }
    }
    console.log(`  ${province}: done`);
  }

  console.log(`\nDone. Inserted: ${districtCount} districts, ${sectorCount} sectors, ${cellCount} cells, ${villageCount} villages.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed script crashed:', err);
  process.exit(1);
});
