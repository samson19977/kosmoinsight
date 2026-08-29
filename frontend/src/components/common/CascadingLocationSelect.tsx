import React, { useEffect, useState } from 'react';
import api from '../../services/api';

interface LocationOption {
  id: number;
  name: string;
}

export interface LocationValue {
  district: string;
  sector: string;
  cell: string;
  village: string;
}

interface CascadingLocationSelectProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  disabled?: boolean;
}

const selectCls =
  'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400 transition-all';

// ============================================
// Rwanda's administrative address is a fixed, official hierarchy
// (District → Sector → Cell → Village) — letting someone type these
// freely means misspellings, made-up places, and inconsistent naming
// across records, which is a real problem for KYC/PayGo (an address is
// part of verifying who someone actually is). This component makes each
// level a dropdown that only shows options belonging to whatever was
// picked one level up, backed by /api/locations/* — so what ends up
// stored is always one of the official names, never free text.
//
// The component still ultimately just produces plain district/sector/
// cell/village NAME strings via onChange — it doesn't require any schema
// change on the caller's side, since customers/agents already store
// these as text fields. This is deliberately just a better, validated
// way of filling in the same fields, not a new data model.
// ============================================
const CascadingLocationSelect: React.FC<CascadingLocationSelectProps> = ({ value, onChange, disabled }) => {
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [sectors, setSectors] = useState<LocationOption[]>([]);
  const [cells, setCells] = useState<LocationOption[]>([]);
  const [villages, setVillages] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState({ districts: false, sectors: false, cells: false, villages: false });

  // Load districts once.
  useEffect(() => {
    setLoading((l) => ({ ...l, districts: true }));
    api
      .get('/locations/districts')
      .then((res) => setDistricts(res.data.districts || []))
      .catch(() => setDistricts([]))
      .finally(() => setLoading((l) => ({ ...l, districts: false })));
  }, []);

  // Whenever the selected district changes, load its sectors.
  useEffect(() => {
    const district = districts.find((d) => d.name === value.district);
    if (!district) {
      setSectors([]);
      return;
    }
    setLoading((l) => ({ ...l, sectors: true }));
    api
      .get('/locations/sectors', { params: { districtId: district.id } })
      .then((res) => setSectors(res.data.sectors || []))
      .catch(() => setSectors([]))
      .finally(() => setLoading((l) => ({ ...l, sectors: false })));
  }, [value.district, districts]);

  // Whenever the selected sector changes, load its cells.
  useEffect(() => {
    const sector = sectors.find((s) => s.name === value.sector);
    if (!sector) {
      setCells([]);
      return;
    }
    setLoading((l) => ({ ...l, cells: true }));
    api
      .get('/locations/cells', { params: { sectorId: sector.id } })
      .then((res) => setCells(res.data.cells || []))
      .catch(() => setCells([]))
      .finally(() => setLoading((l) => ({ ...l, cells: false })));
  }, [value.sector, sectors]);

  // Whenever the selected cell changes, load its villages.
  useEffect(() => {
    const cell = cells.find((c) => c.name === value.cell);
    if (!cell) {
      setVillages([]);
      return;
    }
    setLoading((l) => ({ ...l, villages: true }));
    api
      .get('/locations/villages', { params: { cellId: cell.id } })
      .then((res) => setVillages(res.data.villages || []))
      .catch(() => setVillages([]))
      .finally(() => setLoading((l) => ({ ...l, villages: false })));
  }, [value.cell, cells]);

  // Picking a level clears everything below it — a sector picked under
  // the OLD district would be meaningless once the district changes.
  const handleDistrict = (name: string) => onChange({ district: name, sector: '', cell: '', village: '' });
  const handleSector = (name: string) => onChange({ ...value, sector: name, cell: '', village: '' });
  const handleCell = (name: string) => onChange({ ...value, cell: name, village: '' });
  const handleVillage = (name: string) => onChange({ ...value, village: name });

  return (
    <div className="grid grid-cols-2 gap-3">
      <select className={selectCls} value={value.district} onChange={(e) => handleDistrict(e.target.value)} disabled={disabled || loading.districts}>
        <option value="">{loading.districts ? 'Loading districts…' : 'District'}</option>
        {districts.map((d) => (
          <option key={d.id} value={d.name}>{d.name}</option>
        ))}
      </select>

      <select className={selectCls} value={value.sector} onChange={(e) => handleSector(e.target.value)} disabled={disabled || !value.district || loading.sectors}>
        <option value="">{loading.sectors ? 'Loading sectors…' : 'Sector'}</option>
        {sectors.map((s) => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>

      <select className={selectCls} value={value.cell} onChange={(e) => handleCell(e.target.value)} disabled={disabled || !value.sector || loading.cells}>
        <option value="">{loading.cells ? 'Loading cells…' : 'Cell'}</option>
        {cells.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>

      <select className={selectCls} value={value.village} onChange={(e) => handleVillage(e.target.value)} disabled={disabled || !value.cell || loading.villages}>
        <option value="">{loading.villages ? 'Loading villages…' : 'Village'}</option>
        {villages.map((v) => (
          <option key={v.id} value={v.name}>{v.name}</option>
        ))}
      </select>
    </div>
  );
};

export default CascadingLocationSelect;
