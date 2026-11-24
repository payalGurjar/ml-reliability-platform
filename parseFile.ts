import Papa from 'papaparse';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 20000;
export const ACCEPTED = ['.csv', '.tsv', '.txt', '.xlsx', '.xls'];

export interface ParsedFile {
  rows: Record<string, unknown>[];
  columns: string[];
  truncated: boolean;
  fileName: string;
  fileSize: number;
}

function normaliseRows(raw: Record<string, unknown>[]): { rows: Record<string, unknown>[]; columns: string[] } {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 50)) {
    for (const k of Object.keys(r)) {
      const key = k.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  const rows = raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      const v = r[c] !== undefined ? r[c] : r[' ' + c] !== undefined ? r[' ' + c] : null;
      out[c] = v === '' ? null : v;
    }
    return out;
  });
  return { rows, columns };
}

/** Parse a user-selected CSV/TSV/Excel file entirely in the browser. */
export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!ACCEPTED.includes(ext)) {
    throw new Error('Unsupported file type "' + ext + '". Upload a CSV, TSV or Excel file.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is larger than 10 MB. Please upload a sample instead.');
  }

  // The spreadsheet parser is ~400 kB, so it is only fetched when actually needed.
  const XLSX = ext === '.xlsx' || ext === '.xls' ? await import('xlsx') : null;

  return new Promise((resolve, reject) => {
    if (XLSX) {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          if (!sheetName) throw new Error('The workbook contains no sheets.');
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
          if (!raw.length) throw new Error('The first sheet contains no data rows.');
          const truncated = raw.length > MAX_ROWS;
          const { rows, columns } = normaliseRows(raw.slice(0, MAX_ROWS));
          resolve({ rows, columns, truncated, fileName: file.name, fileSize: file.size });
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to parse the workbook.'));
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const raw = (result.data || []).filter((r) => r && typeof r === 'object');
        if (!raw.length) {
          reject(new Error('No data rows found. Ensure the first line contains column headers.'));
          return;
        }
        const truncated = raw.length > MAX_ROWS;
        const { rows, columns } = normaliseRows(raw.slice(0, MAX_ROWS));
        if (!columns.length) {
          reject(new Error('No column headers detected in the file.'));
          return;
        }
        resolve({ rows, columns, truncated, fileName: file.name, fileSize: file.size });
      },
      error: (err) => reject(new Error(err.message || 'Failed to parse the CSV file.')),
    });
  });
}
