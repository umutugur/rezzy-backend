// Her türlü değerden (string/obje) 24 haneli ObjectId'yi güvenle çıkarır
export function asId(val: any): string | null {
  if (!val) return null;

  if (typeof val === "string") {
    const m = val.match(/[a-f0-9]{24}/i);
    if (m) return m[0];
    return null;
  }

  if (typeof val === "object") {
    if ((val as any)._id) return String((val as any)._id);
    try {
      const s = JSON.stringify(val);
      const m = s.match(/[a-f0-9]{24}/i);
      if (m) return m[0];
    } catch {}
  }

  try { return String(val); } catch { return null; }
}
