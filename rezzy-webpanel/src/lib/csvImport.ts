// Re-export all pure helpers from the plain-ESM runtime (shared with the assert script)
export * from "./csvImport.runtime.mjs";

// ── Additional TS-only types ──────────────────────────────────────────────────

export interface ColumnMap {
  title: string;
  category: string;
  defaultPrice: string;
  barcode: string;
  unit: string;
  defaultDiscountPrice: string;
}

export interface ImportOptions {
  decimalSeparator: "." | ",";
  stripCurrency: boolean;
  unitMap: Record<string, string>;
}

// ── parseCsv — moved from OrgCatalog.tsx ─────────────────────────────────────
// Robust CSV parser: handles quoted fields, embedded commas, and escaped double quotes ("")
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  function splitRow(line: string): string[] {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let field = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            field += line[i];
            i++;
          }
        }
        fields.push(field);
        if (line[i] === ",") i++;
      } else {
        const end = line.indexOf(",", i);
        if (end === -1) {
          fields.push(line.slice(i).trim());
          break;
        } else {
          fields.push(line.slice(i, end).trim());
          i = end + 1;
        }
      }
    }
    return fields;
  }

  const headers = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}
