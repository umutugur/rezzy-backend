import React, { useState, useCallback, useRef } from "react";
import { parseWorkbook, guessColumnMap } from "../../lib/csvImport";
import type { BulkPriceRow, BulkPriceResult } from "../../api/marketOrgCatalog";
import { showToast } from "../../ui/Toast";

interface Props {
  onClose: () => void;
  onDone: () => void;
  submit: (rows: BulkPriceRow[], dryRun: boolean) => Promise<BulkPriceResult>;
}

const STEPS = ["Yükle", "Sütun Eşleme", "Önizleme"] as const;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const baseInput: React.CSSProperties = {
  width: "100%",
  padding: "9px 13px",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  fontSize: 13.5,
  outline: "none",
  boxSizing: "border-box",
  cursor: "pointer",
};

const label12: React.CSSProperties = {
  color: "var(--rezvix-text-soft)",
  fontSize: 12,
  fontWeight: 600,
  display: "block",
  marginBottom: 5,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 22px",
  borderRadius: 10,
  background: "var(--rezvix-primary)",
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  background: "var(--rezvix-bg-soft)",
  border: "1.5px solid var(--rezvix-border-strong)",
  color: "var(--rezvix-text-muted)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const pill = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 700,
  background: bg,
  color,
  border: `1px solid ${border}`,
  whiteSpace: "nowrap",
});

export default function BulkPriceWizard({ onClose, onDone, submit }: Props) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [barcodeCol, setBarcodeCol] = useState<string>("");
  const [priceCol, setPriceCol] = useState<string>("");
  const [preview, setPreview] = useState<BulkPriceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback(async (file: File) => {
    setFileError("");
    try {
      const buf = await file.arrayBuffer();
      const { headers: h, rows: r } = parseWorkbook(buf);
      if (!h.length) {
        setFileError("Dosya okunamadı veya boş");
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      const guess = guessColumnMap(h);
      setBarcodeCol(guess.barcode || h[0] || "");
      setPriceCol(guess.defaultPrice || h.find((x) => /fiyat|price|satı[şs]|birim/i.test(x)) || h[1] || "");
      setPreview(null);
      setStep(1);
    } catch {
      setFileError("Dosya okunamadı veya boş");
    }
  }, []);

  const buildRows = (): BulkPriceRow[] =>
    rows.map((r) => ({ barcode: String(r[barcodeCol] ?? "").trim(), price: r[priceCol] as unknown as number }));

  const runDry = async () => {
    setBusy(true);
    try {
      const parts = chunk(buildRows(), 5000);
      const agg: BulkPriceResult = { dryRun: true, total: 0, matched: 0, updated: 0, notFound: [], invalid: [] };
      for (const p of parts) {
        const res = await submit(p, true);
        agg.total += res.total;
        agg.matched += res.matched;
        agg.notFound.push(...res.notFound);
        agg.invalid.push(...res.invalid);
      }
      setPreview(agg);
      setStep(2);
    } catch {
      showToast("Önizleme başarısız", "error");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const parts = chunk(buildRows(), 5000);
      let updated = 0;
      for (const p of parts) {
        const res = await submit(p, false);
        updated += res.updated;
      }
      showToast(`${updated} ürünün fiyatı güncellendi`, "success");
      onDone();
    } catch {
      showToast("Güncelleme başarısız", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes bpwIn { from { opacity:0; transform: translateY(16px) scale(.97) } to { opacity:1; transform: none } }
        .bpw-card { animation: bpwIn .24s cubic-bezier(.16,1,.3,1); }
        .bpw-input:focus { border-color: var(--rezvix-primary) !important; box-shadow: 0 0 0 3px var(--rezvix-primary-soft) !important; outline: none; }
        .bpw-close:hover { background: var(--rezvix-bg-soft) !important; color: var(--rezvix-text-main) !important; }
        .bpw-drop:hover { border-color: var(--rezvix-primary) !important; background: var(--rezvix-primary-soft) !important; }
        .bpw-step-btn:hover:not(:disabled) { opacity: .85 !important; }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,13,28,.58)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 1200,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "32px 20px",
          overflowY: "auto",
        }}
        onClick={onClose}
      >
        <div
          className="bpw-card"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--rezvix-bg-elevated)",
            borderRadius: 20,
            width: 640,
            maxWidth: "100%",
            border: "1px solid var(--rezvix-border-subtle)",
            boxShadow: "0 36px 96px rgba(10,13,28,.36)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 28px 18px",
              background: "var(--rezvix-bg-soft)",
              borderBottom: "1px solid var(--rezvix-border-subtle)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  background: "linear-gradient(135deg, rgba(123,44,44,.22) 0%, rgba(243,179,107,.18) 100%)",
                  border: "1px solid rgba(243,179,107,.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                💰
              </div>
              <div>
                <h2 style={{ color: "var(--rezvix-text-main)", margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  Excel/CSV ile Fiyat Güncelle
                </h2>
                <p style={{ color: "var(--rezvix-text-soft)", margin: "3px 0 0", fontSize: 12.5 }}>
                  {fileName ? `📄 ${fileName}` : "Sadece barkod eşleşen ürünlerin fiyatı güncellenir"}
                </p>
              </div>
            </div>
            <button
              className="bpw-close"
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: "1px solid var(--rezvix-border-subtle)",
                background: "transparent",
                color: "var(--rezvix-text-soft)",
                cursor: "pointer",
                fontSize: 20,
                lineHeight: "30px",
                textAlign: "center",
                flexShrink: 0,
                transition: "background .12s ease, color .12s ease",
              }}
              aria-label="Kapat"
            >
              ×
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", padding: "14px 28px 0" }}>
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingBottom: 14 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      background: active || done ? "var(--rezvix-primary)" : "var(--rezvix-bg-soft)",
                      color: active || done ? "#fff" : "var(--rezvix-text-soft)",
                      border: active || done ? "none" : "1px solid var(--rezvix-border-strong)",
                    }}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: active ? "var(--rezvix-text-main)" : "var(--rezvix-text-soft)" }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div style={{ padding: "6px 28px 24px", minHeight: 220 }}>
            {step === 0 && (
              <div>
                <p style={{ color: "var(--rezvix-text-soft)", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
                  Dosyanız çok sütunlu olabilir; bir sonraki adımda yalnızca Barkod ve Fiyat sütunlarını seçeceksiniz.
                  Ürün oluşturulmaz — sadece barkodu eşleşen mevcut ürünlerin fiyatı güncellenir.
                </p>
                <label
                  className="bpw-drop"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    height: 160,
                    borderRadius: 14,
                    border: "1.5px dashed var(--rezvix-border-strong)",
                    background: "var(--rezvix-bg-soft)",
                    cursor: "pointer",
                    textAlign: "center",
                    padding: 16,
                    transition: "border-color .15s ease, background .15s ease",
                  }}
                >
                  <div style={{ fontSize: 30, opacity: 0.85 }}>📄</div>
                  <span style={{ color: "var(--rezvix-text-main)", fontSize: 13.5, fontWeight: 600 }}>
                    Excel veya CSV dosyası seç
                  </span>
                  <span style={{ color: "var(--rezvix-text-soft)", fontSize: 11.5 }}>.xlsx, .xls, .csv</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) onFile(f);
                    }}
                  />
                </label>
                {fileError && (
                  <div style={{ color: "var(--rezvix-danger)", fontSize: 12.5, marginTop: 10 }}>{fileError}</div>
                )}
              </div>
            )}

            {step === 1 && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                  <div>
                    <label style={label12}>Barkod sütunu</label>
                    <select
                      className="bpw-input"
                      style={baseInput}
                      value={barcodeCol}
                      onChange={(e) => setBarcodeCol(e.target.value)}
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={label12}>Fiyat sütunu</label>
                    <select
                      className="bpw-input"
                      style={baseInput}
                      value={priceCol}
                      onChange={(e) => setPriceCol(e.target.value)}
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label style={label12}>Önizleme (ilk 5 satır)</label>
                <div
                  style={{
                    border: "1px solid var(--rezvix-border-subtle)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--rezvix-bg-soft)", textAlign: "left" }}>
                        <th style={{ padding: "8px 12px", color: "var(--rezvix-text-soft)", fontWeight: 700, fontSize: 11 }}>Barkod</th>
                        <th style={{ padding: "8px 12px", color: "var(--rezvix-text-soft)", fontWeight: 700, fontSize: 11 }}>Fiyat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--rezvix-border-subtle)" }}>
                          <td style={{ padding: "7px 12px", color: "var(--rezvix-text-main)" }}>{String(r[barcodeCol] ?? "")}</td>
                          <td style={{ padding: "7px 12px", color: "var(--rezvix-text-main)" }}>{String(r[priceCol] ?? "")}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={2} style={{ padding: "14px 12px", textAlign: "center", color: "var(--rezvix-text-soft)" }}>
                            Satır bulunamadı
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ color: "var(--rezvix-text-soft)", fontSize: 11.5, marginTop: 8 }}>
                  Toplam {rows.length} satır okundu.
                </div>
              </div>
            )}

            {step === 2 && preview && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  <span style={pill("var(--rezvix-success)", "rgba(22,163,74,.10)", "rgba(22,163,74,.28)")}>
                    ✓ {preview.matched} eşleşti
                  </span>
                  <span style={pill("var(--rezvix-text-muted)", "var(--rezvix-bg-soft)", "var(--rezvix-border-strong)")}>
                    {preview.notFound.length} bulunamadı
                  </span>
                  <span style={pill("var(--rezvix-danger)", "rgba(220,38,38,.08)", "rgba(220,38,38,.24)")}>
                    {preview.invalid.length} geçersiz
                  </span>
                </div>

                {preview.notFound.length > 0 && (
                  <details style={{ marginBottom: 12 }}>
                    <summary style={{ color: "var(--rezvix-text-muted)", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>
                      Bulunamayan barkodlar ({preview.notFound.length})
                    </summary>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--rezvix-text-soft)",
                        maxHeight: 120,
                        overflow: "auto",
                        marginTop: 6,
                        padding: "8px 10px",
                        background: "var(--rezvix-bg-soft)",
                        borderRadius: 8,
                      }}
                    >
                      {preview.notFound.slice(0, 200).join(", ")}
                    </div>
                  </details>
                )}

                {preview.invalid.length > 0 && (
                  <details>
                    <summary style={{ color: "var(--rezvix-text-muted)", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>
                      Geçersiz satırlar ({preview.invalid.length})
                    </summary>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--rezvix-danger)",
                        maxHeight: 120,
                        overflow: "auto",
                        marginTop: 6,
                        padding: "8px 10px",
                        background: "rgba(220,38,38,.06)",
                        borderRadius: 8,
                      }}
                    >
                      {preview.invalid.slice(0, 200).map((e, i) => (
                        <div key={i}>
                          {e.barcode || "(boş)"} — {e.reason}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              padding: "16px 28px",
              borderTop: "1px solid var(--rezvix-border-subtle)",
              background: "var(--rezvix-bg-soft)",
            }}
          >
            {step === 0 && <button style={ghostBtn} onClick={onClose}>İptal</button>}

            {step === 1 && (
              <>
                <button style={ghostBtn} onClick={() => setStep(0)}>Geri</button>
                <button
                  className="bpw-step-btn"
                  style={{ ...primaryBtn, opacity: busy || !barcodeCol || !priceCol ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}
                  disabled={busy || !barcodeCol || !priceCol}
                  onClick={runDry}
                >
                  {busy ? "Kontrol ediliyor…" : "Önizle"}
                </button>
              </>
            )}

            {step === 2 && preview && (
              <>
                <button style={ghostBtn} onClick={() => setStep(1)}>Geri</button>
                <button style={ghostBtn} onClick={onClose}>İptal</button>
                <button
                  className="bpw-step-btn"
                  style={{ ...primaryBtn, opacity: busy || preview.matched === 0 ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}
                  disabled={busy || preview.matched === 0}
                  onClick={apply}
                >
                  {busy ? "Uygulanıyor…" : `Uygula (${preview.matched})`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
