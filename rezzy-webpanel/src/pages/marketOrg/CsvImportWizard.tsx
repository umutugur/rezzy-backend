import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  parseCsv,
  guessColumnMap,
  detectDecimalSeparator,
  normalizeUnit,
  guessCategoryMatch,
  applyMapping,
  headerFingerprint,
  type ColumnMap,
  type ImportOptions,
} from "../../lib/csvImport";
import {
  bulkImportProducts,
  listImportTemplates,
  saveImportTemplate,
  updateImportTemplate,
  deleteImportTemplate,
  type ImportTemplate,
} from "../../api/marketOrgCatalog";
import { showToast } from "../../ui/Toast";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NormalizedCategory {
  _id: string;
  key: string;
  title: string;
}

interface Props {
  orgId: string;
  categories: NormalizedCategory[];
  onClose: () => void;
  onImported: () => void;
}

const STEPS = [
  "Yükle",
  "Sütun Eşleme",
  "Normalizasyon",
  "Kategori Eşleme",
  "Önizleme",
] as const;

const UNIT_VALUES = ["kg", "piece", "litre", "pack"] as const;
type UnitValue = (typeof UNIT_VALUES)[number];

const COL_MAP_FIELDS: { field: keyof ColumnMap; label: string; required: boolean }[] = [
  { field: "title", label: "Ürün Adı", required: true },
  { field: "category", label: "Kategori", required: true },
  { field: "defaultPrice", label: "Varsayılan Fiyat", required: true },
  { field: "barcode", label: "Barkod", required: false },
  { field: "unit", label: "Birim", required: false },
  { field: "defaultDiscountPrice", label: "İndirimli Fiyat", required: false },
];

// ── Shared styles ──────────────────────────────────────────────────────────────

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

// ── Wizard ─────────────────────────────────────────────────────────────────────

export default function CsvImportWizard({ orgId, categories, onClose, onImported }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");

  // Template state (used in step 1 lower area after parse)
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const fp = React.useMemo(() => (headers.length > 0 ? headerFingerprint(headers) : ""), [headers]);

  // Step 2 state
  const [columnMap, setColumnMap] = useState<Partial<ColumnMap>>({});

  // Step 3 state
  const [decimalSep, setDecimalSep] = useState<"." | ",">( ".");
  const [stripCurrency, setStripCurrency] = useState(true);
  const [unitMap, setUnitMap] = useState<Record<string, UnitValue>>({});

  // Step 4 state
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});

  // Step 5 state
  const [importing, setImporting] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // ── Load templates once headers are available ─────────────────────────────────

  useEffect(() => {
    if (headers.length === 0) return;
    setTemplatesLoading(true);
    listImportTemplates(orgId)
      .then(({ items }) => {
        setTemplates(items);
        // Auto-select fingerprint match
        const match = items.find((t) => t.headerFingerprint === fp);
        if (match) {
          setSelectedTemplateId(match._id);
          applyTemplate(match);
        }
      })
      .catch(() => {
        // silently ignore — templates are optional
      })
      .finally(() => setTemplatesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers.join(","), orgId]);

  const applyTemplate = useCallback((tmpl: ImportTemplate) => {
    setColumnMap(tmpl.columnMap as Partial<ColumnMap>);
    setCategoryMap(tmpl.categoryMap ?? {});
    setDecimalSep(tmpl.options?.decimalSeparator ?? ".");
    setStripCurrency(tmpl.options?.stripCurrency ?? true);
    setUnitMap((tmpl.options?.unitMap ?? {}) as Record<string, UnitValue>);
    setTemplateName(tmpl.name);
  }, []);

  const clearTemplate = useCallback(() => {
    setSelectedTemplateId(null);
    setTemplateName("");
    // Reset to guessed defaults
    if (headers.length > 0) {
      const guess = guessColumnMap(headers);
      setColumnMap(guess);
    }
    setCategoryMap({});
    setUnitMap({});
  }, [headers]);

  const handleSelectTemplate = useCallback(
    (id: string | null) => {
      if (!id) {
        clearTemplate();
        return;
      }
      const tmpl = templates.find((t) => t._id === id);
      if (!tmpl) return;
      setSelectedTemplateId(id);
      applyTemplate(tmpl);
    },
    [templates, applyTemplate, clearTemplate],
  );

  const handleDeleteTemplate = useCallback(
    async (id: string) => {
      try {
        await deleteImportTemplate(orgId, id);
        setTemplates((prev) => prev.filter((t) => t._id !== id));
        if (selectedTemplateId === id) {
          clearTemplate();
        }
        showToast("Şablon silindi", "success");
      } catch {
        showToast("Şablon silinemedi", "error");
      }
    },
    [orgId, selectedTemplateId, clearTemplate],
  );

  // ── Computed ─────────────────────────────────────────────────────────────────

  const requiredMapped =
    !!columnMap.title && !!columnMap.category && !!columnMap.defaultPrice;

  // Distinct non-empty category column values
  const distinctCatValues: string[] = React.useMemo(() => {
    if (!columnMap.category) return [];
    const seen = new Set<string>();
    for (const row of csvRows) {
      const v = String(row[columnMap.category] ?? "").trim();
      if (v) seen.add(v);
    }
    return Array.from(seen);
  }, [csvRows, columnMap.category]);

  const catMapComplete =
    distinctCatValues.length > 0 &&
    distinctCatValues.every((v) => !!categoryMap[v]);

  const mappedCount = distinctCatValues.filter((v) => !!categoryMap[v]).length;

  // Distinct unit column values
  const distinctUnitValues: string[] = React.useMemo(() => {
    if (!columnMap.unit) return [];
    const seen = new Set<string>();
    for (const row of csvRows) {
      const v = String(row[columnMap.unit] ?? "").trim();
      if (v) seen.add(v);
    }
    return Array.from(seen);
  }, [csvRows, columnMap.unit]);

  // applyMapping result (Step 5)
  const mappingResult = React.useMemo(() => {
    if (step !== 4 || csvRows.length === 0 || !requiredMapped) return null;
    const opts: ImportOptions = {
      decimalSeparator: decimalSep,
      stripCurrency,
      unitMap,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return applyMapping(csvRows, columnMap as any, categoryMap, opts);
  }, [step, csvRows, columnMap, categoryMap, decimalSep, stripCurrency, unitMap, requiredMapped]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setFileError("");
    // Reset template selections when loading a new file
    setSelectedTemplateId(null);
    setTemplateName("");
    setTemplates([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setFileError("CSV dosyasında geçerli satır bulunamadı.");
        return;
      }
      const hdrs = Object.keys(rows[0]);
      setCsvRows(rows);
      setHeaders(hdrs);
      setFileName(file.name);

      // Auto-guess column map (will be overridden if a matching template is found in useEffect)
      const guess = guessColumnMap(hdrs);
      setColumnMap(guess);

      // Auto-detect decimal separator from price column samples
      const priceSamples = rows
        .slice(0, 30)
        .map((r) => r[guess.defaultPrice ?? ""])
        .filter(Boolean);
      const sep = detectDecimalSeparator(priceSamples);
      setDecimalSep(sep);

      // Reset downstream
      setUnitMap({});
      setCategoryMap({});
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const handleGuessCategories = useCallback(() => {
    const newMap: Record<string, string> = { ...categoryMap };
    for (const val of distinctCatValues) {
      if (!newMap[val]) {
        const hit = guessCategoryMatch(val, categories);
        if (hit) newMap[val] = hit;
      }
    }
    setCategoryMap(newMap);
  }, [categoryMap, distinctCatValues, categories]);

  const handleImport = async () => {
    if (!mappingResult || mappingResult.rows.length === 0) return;
    setImporting(true);
    try {
      const result = await bulkImportProducts(orgId, mappingResult.rows);
      qc.invalidateQueries({ queryKey: ["org-products", orgId] });

      // ── Save / update template ────────────────────────────────────────────────
      if (saveAsTemplate && templateName.trim()) {
        const tmplBody = {
          name: templateName.trim(),
          columnMap,
          categoryMap,
          options: { decimalSeparator: decimalSep, stripCurrency, unitMap },
          headerFingerprint: fp,
        };
        try {
          if (selectedTemplateId) {
            await updateImportTemplate(orgId, selectedTemplateId, tmplBody);
          } else {
            await saveImportTemplate(orgId, tmplBody);
          }
          showToast("Şablon kaydedildi", "success");
        } catch {
          // Don't block import on template save failure
          showToast("İçe aktarma başarılı, ancak şablon kaydedilemedi", "error");
        }
      }

      const errMsg =
        result.errors?.length > 0
          ? ` — ${result.errors.length} hata: ${result.errors
              .slice(0, 2)
              .map((e: { row: number; message: string }) => `Satır ${e.row}: ${e.message}`)
              .join("; ")}`
          : "";
      showToast(
        `${result.created} eklendi, ${result.updated} güncellendi${errMsg}`,
        result.errors?.length > 0 ? "error" : "success",
      );
      onImported();
      onClose();
    } catch {
      showToast("İçe aktarma başarısız", "error");
    } finally {
      setImporting(false);
    }
  };

  // ── Step navigation ───────────────────────────────────────────────────────────

  const canGoNext = (() => {
    if (step === 0) return csvRows.length > 0;
    if (step === 1) return requiredMapped;
    if (step === 2) return true;
    if (step === 3) return catMapComplete;
    return false;
  })();

  const goNext = () => {
    if (step === 1 && columnMap.unit) {
      // Pre-populate unit map with defaults
      const newUnitMap: Record<string, UnitValue> = {};
      for (const val of distinctUnitValues) {
        newUnitMap[val] = (unitMap[val] as UnitValue) ?? (normalizeUnit(val, {}) as UnitValue);
      }
      setUnitMap(newUnitMap);
    }
    if (step === 2) {
      // Pre-populate category map with guesses (only for unmapped values)
      handleGuessCategories();
    }
    setStep((s) => s + 1);
  };

  const goBack = () => setStep((s) => s - 1);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes wizardIn { from { opacity:0; transform: translateY(16px) scale(.97) } to { opacity:1; transform: none } }
        .wizard-card { animation: wizardIn .24s cubic-bezier(.16,1,.3,1); }
        .wizard-input:focus { border-color: var(--rezvix-primary) !important; box-shadow: 0 0 0 3px var(--rezvix-primary-soft) !important; outline: none; }
        .wizard-input::placeholder { color: var(--rezvix-text-soft); }
        .step-btn:hover:not(:disabled) { opacity:.82 !important; }
        .wiz-row:hover { background: var(--rezvix-bg-soft) !important; }
        .wiz-close:hover { background: var(--rezvix-bg-soft) !important; color: var(--rezvix-text-main) !important; }
        .drop-zone:hover { border-color: var(--rezvix-primary) !important; background: var(--rezvix-primary-soft) !important; }
        .err-toggle:hover { color: var(--rezvix-text-main) !important; }
        .tmpl-row:hover { background: var(--rezvix-bg-soft) !important; }
        .tmpl-del:hover { background: rgba(220,38,38,.12) !important; color: var(--rezvix-danger) !important; }
        @keyframes tmplIn { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: none } }
        .tmpl-panel { animation: tmplIn .22s cubic-bezier(.16,1,.3,1); }
      `}</style>

      {/* Backdrop */}
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
      >
        <div
          className="wizard-card"
          style={{
            background: "var(--rezvix-bg-elevated)",
            borderRadius: 20,
            width: 780,
            maxWidth: "100%",
            border: "1px solid var(--rezvix-border-subtle)",
            boxShadow: "0 36px 96px rgba(10,13,28,.36)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              padding: "20px 28px 0",
              background: "var(--rezvix-bg-soft)",
              borderBottom: "1px solid var(--rezvix-border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    background:
                      "linear-gradient(135deg, rgba(123,44,44,.22) 0%, rgba(243,179,107,.18) 100%)",
                    border: "1px solid rgba(243,179,107,.28)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  🧙
                </div>
                <div>
                  <h2
                    style={{
                      color: "var(--rezvix-text-main)",
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    CSV İçe Aktarma Sihirbazı
                  </h2>
                  <p
                    style={{
                      color: "var(--rezvix-text-soft)",
                      margin: "3px 0 0",
                      fontSize: 12.5,
                    }}
                  >
                    {fileName
                      ? `📄 ${fileName}`
                      : "Adım adım rehberli içe aktarma"}
                  </p>
                </div>
              </div>

              <button
                className="wiz-close"
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
            <div
              style={{
                display: "flex",
                gap: 0,
                marginBottom: 0,
              }}
            >
              {STEPS.map((label, i) => {
                const active = i === step;
                const done = i < step;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      paddingBottom: 14,
                      paddingTop: 4,
                      borderBottom: active
                        ? "2.5px solid var(--rezvix-primary)"
                        : done
                        ? "2.5px solid rgba(123,44,44,.28)"
                        : "2.5px solid transparent",
                      transition: "border-color .2s ease",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: active
                          ? "var(--rezvix-primary)"
                          : done
                          ? "rgba(22,163,74,.18)"
                          : "var(--rezvix-bg-elevated)",
                        border: active
                          ? "none"
                          : done
                          ? "1.5px solid rgba(22,163,74,.5)"
                          : "1.5px solid var(--rezvix-border-strong)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 800,
                        color: active
                          ? "#fff"
                          : done
                          ? "var(--rezvix-success)"
                          : "var(--rezvix-text-soft)",
                        transition: "all .2s ease",
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        color: active
                          ? "var(--rezvix-primary)"
                          : done
                          ? "var(--rezvix-success)"
                          : "var(--rezvix-text-soft)",
                        letterSpacing: "-0.01em",
                        transition: "color .2s ease",
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Body ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 28px",
              minHeight: 320,
            }}
          >
            {step === 0 && (
              <Step1Upload
                fileInputRef={fileInputRef}
                onFileChange={handleFileChange}
                csvRows={csvRows}
                headers={headers}
                fileError={fileError}
                fileName={fileName}
                // Template panel props
                templates={templates}
                templatesLoading={templatesLoading}
                selectedTemplateId={selectedTemplateId}
                fp={fp}
                onSelectTemplate={handleSelectTemplate}
                onDeleteTemplate={handleDeleteTemplate}
              />
            )}
            {step === 1 && (
              <Step2ColumnMap
                headers={headers}
                columnMap={columnMap}
                onChange={setColumnMap}
              />
            )}
            {step === 2 && (
              <Step3Normalize
                columnMap={columnMap}
                csvRows={csvRows}
                decimalSep={decimalSep}
                setDecimalSep={setDecimalSep}
                stripCurrency={stripCurrency}
                setStripCurrency={setStripCurrency}
                distinctUnitValues={distinctUnitValues}
                unitMap={unitMap}
                setUnitMap={setUnitMap}
              />
            )}
            {step === 3 && (
              <Step4Categories
                distinctCatValues={distinctCatValues}
                categories={categories}
                categoryMap={categoryMap}
                setCategoryMap={setCategoryMap}
                mappedCount={mappedCount}
              />
            )}
            {step === 4 && mappingResult && (
              <Step5Preview
                result={mappingResult}
                categories={categories}
                errorsOpen={errorsOpen}
                setErrorsOpen={setErrorsOpen}
              />
            )}
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 28px",
              borderTop: "1px solid var(--rezvix-border-subtle)",
              background: "var(--rezvix-bg-soft)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* Save-as-template control (only on preview step) */}
            {step === 4 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    style={{ accentColor: "var(--rezvix-primary)", width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--rezvix-text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🗂️ {selectedTemplateId ? "Şablonu güncelle" : "Şablon olarak kaydet"}
                  </span>
                </label>
                {saveAsTemplate && (
                  <input
                    className="wizard-input"
                    type="text"
                    placeholder="Şablon adı"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{
                      padding: "6px 11px",
                      borderRadius: 7,
                      border: "1px solid var(--rezvix-border-strong)",
                      background: "var(--rezvix-bg-elevated)",
                      color: "var(--rezvix-text-main)",
                      fontSize: 13,
                      outline: "none",
                      minWidth: 160,
                      maxWidth: 220,
                    }}
                  />
                )}
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
              {step > 0 && (
                <button
                  className="step-btn"
                  onClick={goBack}
                  disabled={importing}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 9,
                    border: "1px solid var(--rezvix-border-strong)",
                    background: "transparent",
                    color: "var(--rezvix-text-muted)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                    transition: "opacity .12s ease",
                  }}
                >
                  ← Geri
                </button>
              )}

              {step < 4 ? (
                <button
                  className="step-btn"
                  onClick={goNext}
                  disabled={!canGoNext}
                  style={{
                    padding: "10px 26px",
                    borderRadius: 9,
                    border: "none",
                    background: canGoNext
                      ? "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))"
                      : "var(--rezvix-bg-soft)",
                    color: canGoNext ? "#fff" : "var(--rezvix-text-soft)",
                    cursor: canGoNext ? "pointer" : "not-allowed",
                    fontWeight: 700,
                    fontSize: 14,
                    boxShadow: canGoNext ? "0 6px 18px rgba(123,44,44,.28)" : "none",
                    transition: "opacity .12s ease",
                  }}
                >
                  İleri →
                </button>
              ) : (
                <button
                  className="step-btn"
                  onClick={handleImport}
                  disabled={
                    importing ||
                    !mappingResult ||
                    mappingResult.rows.length === 0
                  }
                  style={{
                    padding: "10px 28px",
                    borderRadius: 9,
                    border: "none",
                    background:
                      importing || !mappingResult || mappingResult.rows.length === 0
                        ? "var(--rezvix-bg-soft)"
                        : "linear-gradient(135deg, #16a34a, #15803d)",
                    color:
                      importing || !mappingResult || mappingResult.rows.length === 0
                        ? "var(--rezvix-text-soft)"
                        : "#fff",
                    cursor:
                      importing || !mappingResult || mappingResult.rows.length === 0
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: 700,
                    fontSize: 14,
                    boxShadow:
                      importing || !mappingResult || mappingResult.rows.length === 0
                        ? "none"
                        : "0 6px 18px rgba(22,163,74,.30)",
                    transition: "opacity .12s ease",
                  }}
                >
                  {importing
                    ? "İçe Aktarılıyor…"
                    : `İçe Aktar (${mappingResult?.rows.length ?? 0})`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────

function Step1Upload({
  fileInputRef,
  onFileChange,
  csvRows,
  headers,
  fileError,
  fileName,
  templates,
  templatesLoading,
  selectedTemplateId,
  fp,
  onSelectTemplate,
  onDeleteTemplate,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  csvRows: Record<string, string>[];
  headers: string[];
  fileError: string;
  fileName: string;
  templates: ImportTemplate[];
  templatesLoading: boolean;
  selectedTemplateId: string | null;
  fp: string;
  onSelectTemplate: (id: string | null) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const suggestedTemplate = templates.find((t) => t.headerFingerprint === fp);

  return (
    <div>
      <p
        style={{
          color: "var(--rezvix-text-soft)",
          fontSize: 13,
          marginBottom: 20,
          lineHeight: 1.6,
        }}
      >
        CSV dosyanızı seçin. İlk satır sütun başlıkları olmalıdır. Sihirbaz
        sütunları otomatik eşlemeye çalışacaktır.
      </p>

      {/* Drop zone / file picker */}
      <label
        className="drop-zone"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: 160,
          borderRadius: 14,
          border: `2px dashed ${csvRows.length > 0 ? "var(--rezvix-success)" : "var(--rezvix-border-strong)"}`,
          background:
            csvRows.length > 0
              ? "rgba(22,163,74,.07)"
              : "var(--rezvix-bg-soft)",
          cursor: "pointer",
          textAlign: "center",
          padding: 24,
          transition: "border-color .15s ease, background .15s ease",
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.8 }}>
          {csvRows.length > 0 ? "✅" : "📂"}
        </div>
        {csvRows.length > 0 ? (
          <>
            <div
              style={{
                color: "var(--rezvix-success)",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {fileName}
            </div>
            <div
              style={{
                color: "var(--rezvix-text-soft)",
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--rezvix-success)", fontWeight: 700 }}>
                {csvRows.length}
              </span>{" "}
              satır,{" "}
              <span style={{ color: "var(--rezvix-success)", fontWeight: 700 }}>
                {headers.length}
              </span>{" "}
              sütun bulundu
            </div>
            <div
              style={{
                color: "var(--rezvix-text-soft)",
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              Farklı dosya seçmek için tıklayın
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                color: "var(--rezvix-text-main)",
                fontWeight: 600,
                fontSize: 14.5,
              }}
            >
              CSV dosyası seçin
            </div>
            <div
              style={{ color: "var(--rezvix-text-soft)", fontSize: 12.5 }}
            >
              .csv uzantılı dosyalar kabul edilir
            </div>
          </>
        )}
        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
      </label>

      {fileError && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 9,
            background: "rgba(220,38,38,.08)",
            border: "1px solid rgba(220,38,38,.24)",
            color: "var(--rezvix-danger)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {fileError}
        </div>
      )}

      {csvRows.length > 0 && headers.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--rezvix-text-soft)",
              marginBottom: 10,
            }}
          >
            Algılanan Sütunlar
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {headers.map((h) => (
              <span
                key={h}
                style={{
                  padding: "4px 11px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--rezvix-bg-soft)",
                  color: "var(--rezvix-text-muted)",
                  border: "1px solid var(--rezvix-border-subtle)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Template panel — only shown after file parse ── */}
      {csvRows.length > 0 && (
        <TemplatePanel
          templates={templates}
          loading={templatesLoading}
          selectedId={selectedTemplateId}
          suggestedTemplate={suggestedTemplate ?? null}
          onSelect={onSelectTemplate}
          onDelete={onDeleteTemplate}
        />
      )}
    </div>
  );
}

// ── Template Panel ─────────────────────────────────────────────────────────────

function TemplatePanel({
  templates,
  loading,
  selectedId,
  suggestedTemplate,
  onSelect,
  onDelete,
}: {
  templates: ImportTemplate[];
  loading: boolean;
  selectedId: string | null;
  suggestedTemplate: ImportTemplate | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (loading) {
    return (
      <div
        style={{
          marginTop: 20,
          padding: "14px 16px",
          borderRadius: 12,
          background: "var(--rezvix-bg-soft)",
          border: "1px solid var(--rezvix-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--rezvix-text-soft)",
          fontSize: 13,
        }}
      >
        <span style={{ opacity: 0.7, fontSize: 16 }}>🗂️</span>
        <span>Kayıtlı şablonlar yükleniyor…</span>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div
        style={{
          marginTop: 20,
          padding: "12px 16px",
          borderRadius: 10,
          background: "var(--rezvix-bg-soft)",
          border: "1px dashed var(--rezvix-border-subtle)",
          color: "var(--rezvix-text-soft)",
          fontSize: 12.5,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16, opacity: 0.6 }}>🗂️</span>
        <span>
          Henüz kayıtlı şablon yok. İlk içe aktarmanın ardından şablon
          oluşturabilirsiniz.
        </span>
      </div>
    );
  }

  return (
    <div
      className="tmpl-panel"
      style={{
        marginTop: 20,
        borderRadius: 14,
        border: "1px solid var(--rezvix-border-subtle)",
        overflow: "hidden",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: "12px 16px",
          background: "var(--rezvix-bg-soft)",
          borderBottom: "1px solid var(--rezvix-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>🗂️</span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: "var(--rezvix-text-main)",
            }}
          >
            Kayıtlı Şablonlar
          </span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-text-soft)",
              border: "1px solid var(--rezvix-border-subtle)",
            }}
          >
            {templates.length}
          </span>
        </div>
        {selectedId && (
          <button
            onClick={() => onSelect(null)}
            style={{
              padding: "4px 11px",
              borderRadius: 7,
              border: "1px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-soft)",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sıfırdan Eşle
          </button>
        )}
      </div>

      {/* Suggested banner */}
      {suggestedTemplate && selectedId === suggestedTemplate._id && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(22,163,74,.08)",
            borderBottom: "1px solid rgba(22,163,74,.18)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            color: "var(--rezvix-success)",
            fontWeight: 600,
          }}
        >
          <span>✨</span>
          <span>
            Önerilen şablon: <strong>{suggestedTemplate.name}</strong> — bu dosya daha önce bu şablonla içe aktarıldı.
          </span>
        </div>
      )}

      {suggestedTemplate && selectedId === null && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(243,179,107,.08)",
            borderBottom: "1px solid rgba(243,179,107,.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                Önerilen şablon bulundu
              </div>
              <div style={{ fontSize: 11.5, color: "var(--rezvix-text-soft)" }}>
                <strong style={{ color: "var(--rezvix-text-muted)" }}>{suggestedTemplate.name}</strong> bu dosyanın sütun yapısıyla eşleşiyor
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelect(suggestedTemplate._id)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Uygula
          </button>
        </div>
      )}

      {/* Template list */}
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {templates.map((tmpl, i) => {
          const isSelected = selectedId === tmpl._id;
          const isSuggested = tmpl.headerFingerprint === suggestedTemplate?.headerFingerprint;
          return (
            <div
              key={tmpl._id}
              className="tmpl-row"
              onClick={() => onSelect(tmpl._id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 16px",
                borderBottom:
                  i < templates.length - 1
                    ? "1px solid var(--rezvix-border-subtle)"
                    : "none",
                cursor: "pointer",
                background: isSelected ? "rgba(123,44,44,.07)" : "transparent",
                transition: "background .1s ease",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: isSelected
                      ? "none"
                      : "2px solid var(--rezvix-border-strong)",
                    background: isSelected
                      ? "var(--rezvix-primary)"
                      : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    color: "#fff",
                    fontWeight: 800,
                    transition: "all .15s ease",
                  }}
                >
                  {isSelected ? "✓" : ""}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "var(--rezvix-text-main)" : "var(--rezvix-text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    transition: "color .15s ease",
                  }}
                >
                  {tmpl.name}
                </span>
                {isSuggested && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: "rgba(22,163,74,.12)",
                      color: "var(--rezvix-success)",
                      border: "1px solid rgba(22,163,74,.26)",
                      flexShrink: 0,
                    }}
                  >
                    Önerilen
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {confirmDelete === tmpl._id ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(tmpl._id);
                        setConfirmDelete(null);
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 7,
                        border: "none",
                        background: "rgba(220,38,38,.18)",
                        color: "var(--rezvix-danger)",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Sil
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 7,
                        border: "1px solid var(--rezvix-border-strong)",
                        background: "transparent",
                        color: "var(--rezvix-text-soft)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      İptal
                    </button>
                  </>
                ) : (
                  <button
                    className="tmpl-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(tmpl._id);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "1px solid var(--rezvix-border-subtle)",
                      background: "transparent",
                      color: "var(--rezvix-text-soft)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "background .12s ease, color .12s ease",
                    }}
                  >
                    Sil
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedId === null && templates.length > 0 && !suggestedTemplate && (
        <div
          style={{
            padding: "9px 16px",
            background: "var(--rezvix-bg-soft)",
            borderTop: "1px solid var(--rezvix-border-subtle)",
            color: "var(--rezvix-text-soft)",
            fontSize: 11.5,
            fontStyle: "italic",
          }}
        >
          Şablon seçilmedi — otomatik tahmin kullanılacak
        </div>
      )}
    </div>
  );
}

// ── Step 2: Column Mapping ─────────────────────────────────────────────────────

function Step2ColumnMap({
  headers,
  columnMap,
  onChange,
}: {
  headers: string[];
  columnMap: Partial<ColumnMap>;
  onChange: (m: Partial<ColumnMap>) => void;
}) {
  return (
    <div>
      <p
        style={{
          color: "var(--rezvix-text-soft)",
          fontSize: 13,
          marginBottom: 20,
          lineHeight: 1.6,
        }}
      >
        Her alan için CSV dosyasındaki karşılık gelen sütunu seçin. Yıldız
        işaretli alanlar zorunludur.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {COL_MAP_FIELDS.map(({ field, label, required }) => {
          const val = columnMap[field] ?? "";
          const missing = required && !val;
          return (
            <div key={field}>
              <label style={label12}>
                {label}{" "}
                {required ? (
                  <span style={{ color: "var(--rezvix-danger)" }}>*</span>
                ) : (
                  <span
                    style={{
                      color: "var(--rezvix-text-soft)",
                      fontWeight: 400,
                    }}
                  >
                    (isteğe bağlı)
                  </span>
                )}
              </label>
              <select
                className="wizard-input"
                value={val}
                onChange={(e) =>
                  onChange({ ...columnMap, [field]: e.target.value || undefined })
                }
                style={{
                  ...baseInput,
                  borderColor: missing
                    ? "rgba(220,38,38,.5)"
                    : "var(--rezvix-border-strong)",
                }}
              >
                <option value="">— Yok —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {!columnMap.title || !columnMap.category || !columnMap.defaultPrice ? (
        <div
          style={{
            marginTop: 18,
            padding: "10px 14px",
            borderRadius: 9,
            background: "rgba(220,38,38,.06)",
            border: "1px solid rgba(220,38,38,.20)",
            color: "var(--rezvix-danger)",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          Devam etmek için Ürün Adı, Kategori ve Varsayılan Fiyat sütunlarını
          eşlemeniz gerekiyor.
        </div>
      ) : (
        <div
          style={{
            marginTop: 18,
            padding: "10px 14px",
            borderRadius: 9,
            background: "rgba(22,163,74,.07)",
            border: "1px solid rgba(22,163,74,.24)",
            color: "var(--rezvix-success)",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          ✓ Zorunlu sütunlar eşlendi, devam edebilirsiniz.
        </div>
      )}
    </div>
  );
}

// ── Step 3: Normalization ──────────────────────────────────────────────────────

function Step3Normalize({
  columnMap,
  csvRows,
  decimalSep,
  setDecimalSep,
  stripCurrency,
  setStripCurrency,
  distinctUnitValues,
  unitMap,
  setUnitMap,
}: {
  columnMap: Partial<ColumnMap>;
  csvRows: Record<string, string>[];
  decimalSep: "." | ",";
  setDecimalSep: (v: "." | ",") => void;
  stripCurrency: boolean;
  setStripCurrency: (v: boolean) => void;
  distinctUnitValues: string[];
  unitMap: Record<string, UnitValue>;
  setUnitMap: (m: Record<string, UnitValue>) => void;
}) {
  // Price samples for preview
  const priceSamples = csvRows
    .slice(0, 5)
    .map((r) => r[columnMap.defaultPrice ?? ""])
    .filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <p style={{ color: "var(--rezvix-text-soft)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
        Fiyat ve birim değerlerinin nasıl yorumlanacağını belirleyin.
      </p>

      {/* Price section */}
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          border: "1px solid var(--rezvix-border-subtle)",
          background: "var(--rezvix-bg-soft)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--rezvix-text-soft)",
            marginBottom: 16,
          }}
        >
          Fiyat Formatı
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={label12}>Ondalık Ayırıcı</label>
            <select
              className="wizard-input"
              value={decimalSep}
              onChange={(e) => setDecimalSep(e.target.value as "." | ",")}
              style={baseInput}
            >
              <option value=".">Nokta (1234.56)</option>
              <option value=",">Virgül (1234,56)</option>
            </select>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                padding: "10px 13px",
                borderRadius: 8,
                border: "1px solid var(--rezvix-border-strong)",
                background: "var(--rezvix-bg-elevated)",
              }}
            >
              <input
                type="checkbox"
                checked={stripCurrency}
                onChange={(e) => setStripCurrency(e.target.checked)}
                style={{ accentColor: "var(--rezvix-primary)", width: 15, height: 15 }}
              />
              <div>
                <div style={{ color: "var(--rezvix-text-main)", fontSize: 13, fontWeight: 600 }}>
                  Para birimi sembolünü kaldır
                </div>
                <div style={{ color: "var(--rezvix-text-soft)", fontSize: 11.5, marginTop: 1 }}>
                  ₺, $, € gibi karakterleri yoksay
                </div>
              </div>
            </label>
          </div>
        </div>

        {priceSamples.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)", fontWeight: 600, marginBottom: 6 }}>
              Örnek fiyat değerleri:
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {priceSamples.map((s, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--rezvix-bg-elevated)",
                    border: "1px solid var(--rezvix-border-subtle)",
                    color: "var(--rezvix-text-muted)",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unit section */}
      {columnMap.unit && distinctUnitValues.length > 0 && (
        <div
          style={{
            padding: 18,
            borderRadius: 12,
            border: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--rezvix-text-soft)",
              marginBottom: 16,
            }}
          >
            Birim Eşleme
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {distinctUnitValues.map((val) => (
              <div
                key={val}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 200px",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      padding: "4px 11px",
                      borderRadius: 7,
                      fontSize: 12.5,
                      fontWeight: 600,
                      background: "var(--rezvix-bg-elevated)",
                      border: "1px solid var(--rezvix-border-subtle)",
                      color: "var(--rezvix-text-muted)",
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {val}
                  </span>
                  <span style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>→</span>
                </div>
                <select
                  className="wizard-input"
                  value={unitMap[val] ?? "piece"}
                  onChange={(e) =>
                    setUnitMap({ ...unitMap, [val]: e.target.value as UnitValue })
                  }
                  style={baseInput}
                >
                  {UNIT_VALUES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!columnMap.unit && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "var(--rezvix-bg-soft)",
            border: "1px solid var(--rezvix-border-subtle)",
            color: "var(--rezvix-text-soft)",
            fontSize: 12.5,
          }}
        >
          Birim sütunu eşlenmedi — tüm ürünler <strong>piece</strong> birimi ile
          içe aktarılacak.
        </div>
      )}
    </div>
  );
}

// ── Step 4: Category Mapping ───────────────────────────────────────────────────

function Step4Categories({
  distinctCatValues,
  categories,
  categoryMap,
  setCategoryMap,
  mappedCount,
}: {
  distinctCatValues: string[];
  categories: NormalizedCategory[];
  categoryMap: Record<string, string>;
  setCategoryMap: (m: Record<string, string>) => void;
  mappedCount: number;
}) {
  const allMapped = mappedCount === distinctCatValues.length && distinctCatValues.length > 0;

  return (
    <div>
      {/* Summary bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <p style={{ color: "var(--rezvix-text-soft)", fontSize: 13, margin: 0 }}>
          CSV'deki her kategori değeri için sistem kategorisi seçin.
        </p>
        <div
          style={pill(
            allMapped ? "var(--rezvix-success)" : "var(--rezvix-primary)",
            allMapped ? "rgba(22,163,74,.10)" : "var(--rezvix-primary-soft)",
            allMapped ? "rgba(22,163,74,.28)" : "rgba(123,44,44,.24)",
          )}
        >
          {mappedCount} / {distinctCatValues.length} eşlendi
        </div>
      </div>

      {!allMapped && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 9,
            background: "rgba(220,38,38,.06)",
            border: "1px solid rgba(220,38,38,.20)",
            color: "var(--rezvix-danger)",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          Tüm kategori değerleri eşlenmeden içe aktarma başlatılamaz.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {distinctCatValues.map((val) => {
          const mapped = !!categoryMap[val];
          return (
            <div
              key={val}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 260px",
                alignItems: "center",
                gap: 14,
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${mapped ? "rgba(22,163,74,.22)" : "rgba(220,38,38,.22)"}`,
                background: mapped ? "rgba(22,163,74,.04)" : "rgba(220,38,38,.04)",
                transition: "border-color .15s ease, background .15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 14,
                    color: mapped ? "var(--rezvix-success)" : "var(--rezvix-danger)",
                  }}
                >
                  {mapped ? "✓" : "○"}
                </span>
                <span
                  style={{
                    padding: "3px 11px",
                    borderRadius: 7,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: "var(--rezvix-bg-elevated)",
                    border: "1px solid var(--rezvix-border-subtle)",
                    color: "var(--rezvix-text-muted)",
                    fontFamily: "ui-monospace, monospace",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={val}
                >
                  {val}
                </span>
              </div>

              <select
                className="wizard-input"
                value={categoryMap[val] ?? ""}
                onChange={(e) =>
                  setCategoryMap({ ...categoryMap, [val]: e.target.value })
                }
                style={{
                  ...baseInput,
                  borderColor: mapped
                    ? "rgba(22,163,74,.4)"
                    : "rgba(220,38,38,.4)",
                }}
              >
                <option value="">— Kategori seçin —</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.title}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {distinctCatValues.length === 0 && (
        <div
          style={{
            padding: "32px 24px",
            textAlign: "center",
            color: "var(--rezvix-text-soft)",
            fontSize: 13,
          }}
        >
          Kategori sütunu eşlenmedi veya değer bulunamadı.
        </div>
      )}
    </div>
  );
}

// ── Step 5: Preview & Import ───────────────────────────────────────────────────

function Step5Preview({
  result,
  categories,
  errorsOpen,
  setErrorsOpen,
}: {
  result: { rows: any[]; errors: { row: number; message: string }[] };
  categories: NormalizedCategory[];
  errorsOpen: boolean;
  setErrorsOpen: (v: boolean) => void;
}) {
  const catById = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c._id] = c.title;
    return m;
  }, [categories]);

  const PREVIEW_ROWS = result.rows.slice(0, 10);

  return (
    <div>
      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            background: "rgba(22,163,74,.07)",
            border: "1px solid rgba(22,163,74,.24)",
          }}
        >
          <div
            style={{
              color: "var(--rezvix-success)",
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {result.rows.length}
          </div>
          <div style={{ color: "var(--rezvix-success)", fontSize: 12.5, marginTop: 4 }}>
            geçerli satır
          </div>
        </div>
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            background:
              result.errors.length > 0
                ? "rgba(220,38,38,.07)"
                : "var(--rezvix-bg-soft)",
            border: `1px solid ${result.errors.length > 0 ? "rgba(220,38,38,.24)" : "var(--rezvix-border-subtle)"}`,
          }}
        >
          <div
            style={{
              color:
                result.errors.length > 0
                  ? "var(--rezvix-danger)"
                  : "var(--rezvix-text-soft)",
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {result.errors.length}
          </div>
          <div
            style={{
              color:
                result.errors.length > 0
                  ? "var(--rezvix-danger)"
                  : "var(--rezvix-text-soft)",
              fontSize: 12.5,
              marginTop: 4,
            }}
          >
            hatalı satır
          </div>
        </div>
      </div>

      {/* Preview table */}
      {PREVIEW_ROWS.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--rezvix-text-soft)",
              marginBottom: 10,
            }}
          >
            Önizleme (ilk {PREVIEW_ROWS.length} / {result.rows.length} satır)
          </div>

          <div
            style={{
              borderRadius: 12,
              border: "1px solid var(--rezvix-border-subtle)",
              overflow: "hidden",
            }}
          >
            {/* Head */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 80px 70px 90px 90px",
                padding: "8px 14px",
                background: "var(--rezvix-bg-soft)",
                borderBottom: "1px solid var(--rezvix-border-subtle)",
                gap: 8,
              }}
            >
              {["Ürün Adı", "Kategori", "Barkod", "Birim", "Fiyat", "İndirimli"].map((h) => (
                <span
                  key={h}
                  style={{
                    color: "var(--rezvix-text-soft)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            {PREVIEW_ROWS.map((row, idx) => (
              <div
                key={idx}
                className="wiz-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 80px 70px 90px 90px",
                  padding: "9px 14px",
                  borderBottom:
                    idx < PREVIEW_ROWS.length - 1
                      ? "1px solid var(--rezvix-border-subtle)"
                      : "none",
                  gap: 8,
                  transition: "background .1s ease",
                }}
              >
                <span
                  style={{
                    color: "var(--rezvix-text-main)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.title}
                </span>
                <span
                  style={{
                    color: "var(--rezvix-text-muted)",
                    fontSize: 11.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {catById[row.category] ?? row.category}
                </span>
                <span
                  style={{
                    color: "var(--rezvix-text-soft)",
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.barcode || "—"}
                </span>
                <span style={{ color: "var(--rezvix-text-soft)", fontSize: 11.5 }}>
                  {row.unit}
                </span>
                <span
                  style={{
                    color: "var(--rezvix-success)",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  ₺{row.defaultPrice?.toFixed(2) ?? "—"}
                </span>
                <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12.5 }}>
                  {row.defaultDiscountPrice != null
                    ? `₺${row.defaultDiscountPrice.toFixed(2)}`
                    : "—"}
                </span>
              </div>
            ))}

            {result.rows.length > 10 && (
              <div
                style={{
                  padding: "9px 14px",
                  background: "var(--rezvix-bg-soft)",
                  color: "var(--rezvix-text-soft)",
                  fontSize: 12,
                  fontStyle: "italic",
                }}
              >
                … ve {result.rows.length - 10} satır daha
              </div>
            )}
          </div>
        </div>
      )}

      {/* Errors collapsible */}
      {result.errors.length > 0 && (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(220,38,38,.24)",
            overflow: "hidden",
          }}
        >
          <button
            className="err-toggle"
            onClick={() => setErrorsOpen(!errorsOpen)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(220,38,38,.07)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--rezvix-danger)",
              fontSize: 13,
              fontWeight: 700,
              transition: "color .12s ease",
            }}
          >
            <span>⚠️ {result.errors.length} hatalı satır</span>
            <span style={{ fontSize: 16 }}>{errorsOpen ? "▲" : "▼"}</span>
          </button>

          {errorsOpen && (
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {result.errors.map((err, i) => (
                <div
                  key={i}
                  style={{
                    padding: "9px 16px",
                    borderTop: "1px solid rgba(220,38,38,.14)",
                    fontSize: 12.5,
                    display: "flex",
                    gap: 12,
                    color: "var(--rezvix-text-soft)",
                  }}
                >
                  <span
                    style={{
                      color: "var(--rezvix-danger)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Satır {err.row}
                  </span>
                  <span>{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result.rows.length === 0 && (
        <div
          style={{
            padding: "20px 16px",
            borderRadius: 10,
            background: "rgba(220,38,38,.06)",
            border: "1px solid rgba(220,38,38,.22)",
            color: "var(--rezvix-danger)",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          İçe aktarılacak geçerli satır bulunamadı. Lütfen eşleme ayarlarını
          kontrol edin.
        </div>
      )}
    </div>
  );
}
