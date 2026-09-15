import { Response } from 'express';

// ============================================
// Shared helpers for the admin/agent "list" endpoints — pagination,
// search, and CSV export all follow the same shape across
// orders/loans/agents/customers, so the parsing and response envelope
// live here once instead of being re-implemented per route.
// ============================================

export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
  search: string;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export function parsePageParams(query: any): PageParams {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  return { page, pageSize, offset: (page - 1) * pageSize, search };
}

export function paginatedResponse<T>(rows: T[], total: number, params: PageParams) {
  return {
    success: true,
    data: rows,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    },
  };
}

// Escapes a single CSV field: wraps in quotes and doubles any embedded
// quotes whenever the value contains a comma, quote, or newline.
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sendCsv(res: Response, filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(','));
  }
  const csv = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
