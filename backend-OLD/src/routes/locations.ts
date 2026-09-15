import { Router, Request, Response } from 'express';
import { eq, asc } from 'drizzle-orm';
import { db } from '../config/database';
import { rwDistricts, rwSectors, rwCells, rwVillages } from '../db/schema';

const router = Router();

// ============================================
// Cascading Rwanda administrative hierarchy — public, read-only. Every
// address field (customer registration, agent registration, order
// checkout) should drive its District/Sector/Cell/Village inputs from
// these instead of free text, so what's stored is always one of the
// official names, not whatever someone happened to type.
//
// GET /api/locations/districts
// GET /api/locations/sectors?districtId=5
// GET /api/locations/cells?sectorId=12
// GET /api/locations/villages?cellId=34
// ============================================

router.get('/districts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.select({ id: rwDistricts.id, name: rwDistricts.name, province: rwDistricts.province }).from(rwDistricts).orderBy(asc(rwDistricts.name));
    res.json({ success: true, districts: rows });
  } catch (error) {
    console.error('List districts error:', error);
    res.status(500).json({ error: 'Failed to load districts' });
  }
});

router.get('/sectors', async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = Number(req.query.districtId);
    if (!districtId) {
      res.status(400).json({ error: 'districtId query parameter is required' });
      return;
    }
    const rows = await db.select({ id: rwSectors.id, name: rwSectors.name }).from(rwSectors).where(eq(rwSectors.districtId, districtId)).orderBy(asc(rwSectors.name));
    res.json({ success: true, sectors: rows });
  } catch (error) {
    console.error('List sectors error:', error);
    res.status(500).json({ error: 'Failed to load sectors' });
  }
});

router.get('/cells', async (req: Request, res: Response): Promise<void> => {
  try {
    const sectorId = Number(req.query.sectorId);
    if (!sectorId) {
      res.status(400).json({ error: 'sectorId query parameter is required' });
      return;
    }
    const rows = await db.select({ id: rwCells.id, name: rwCells.name }).from(rwCells).where(eq(rwCells.sectorId, sectorId)).orderBy(asc(rwCells.name));
    res.json({ success: true, cells: rows });
  } catch (error) {
    console.error('List cells error:', error);
    res.status(500).json({ error: 'Failed to load cells' });
  }
});

router.get('/villages', async (req: Request, res: Response): Promise<void> => {
  try {
    const cellId = Number(req.query.cellId);
    if (!cellId) {
      res.status(400).json({ error: 'cellId query parameter is required' });
      return;
    }
    const rows = await db.select({ id: rwVillages.id, name: rwVillages.name }).from(rwVillages).where(eq(rwVillages.cellId, cellId)).orderBy(asc(rwVillages.name));
    res.json({ success: true, villages: rows });
  } catch (error) {
    console.error('List villages error:', error);
    res.status(500).json({ error: 'Failed to load villages' });
  }
});

export default router;
