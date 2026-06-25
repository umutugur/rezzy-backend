import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import {
  VehicleMake,
  VehicleModel,
  createMake,
  createModel,
  deleteMake,
  deleteModel,
  listMakes,
  listModels,
  updateMake,
  updateModel,
} from "../../api/vehicleCatalog";

// ─── Style constants ───────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-[var(--rezvix-border-strong)] bg-[var(--rezvix-bg-elevated)] text-[var(--rezvix-text-main)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rezvix-primary)] placeholder:text-[var(--rezvix-text-soft)]";

const COUNTRY_OPTIONS = [
  { value: "KKTC", label: "KKTC — Kuzey Kıbrıs" },
  { value: "TR", label: "TR — Türkiye" },
  { value: "CY", label: "CY — Kıbrıs" },
];

// ─── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ active, labels }: { active: boolean; labels: [string, string] }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        background: active ? "rgba(22,163,74,0.1)" : "rgba(120,120,120,0.1)",
        color: active ? "var(--rezvix-success)" : "var(--rezvix-text-soft)",
      }}
    >
      <span style={{ fontSize: 8 }}>●</span>
      {active ? labels[0] : labels[1]}
    </span>
  );
}

// ─── Editable name cell ────────────────────────────────────────────────────────
function NameCell({
  value,
  editing,
  draft,
  onDraft,
  onStartEdit,
  onCommit,
  onCancel,
  selected,
}: {
  value: string;
  editing: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onStartEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  selected?: boolean;
}) {
  if (editing) {
    return (
      <input
        className={inputCls}
        autoFocus
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCommit}
        style={{ padding: "5px 10px", fontSize: 13 }}
      />
    );
  }
  return (
    <span
      onClick={onStartEdit}
      title=""
      style={{
        fontWeight: 600,
        color: selected ? "var(--rezvix-primary)" : "var(--rezvix-text-main)",
        cursor: "text",
      }}
    >
      {value}
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function VehicleCatalogPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [country, setCountry] = React.useState("CY");
  const [selectedMake, setSelectedMake] = React.useState<string | null>(null);

  // Inline edit state
  const [editingMakeId, setEditingMakeId] = React.useState<string | null>(null);
  const [makeDraft, setMakeDraft] = React.useState("");
  const [editingModelId, setEditingModelId] = React.useState<string | null>(null);
  const [modelDraft, setModelDraft] = React.useState("");

  // Add inputs
  const [newMake, setNewMake] = React.useState("");
  const [newModel, setNewModel] = React.useState("");

  // ── Queries ──
  const makesKey = ["vehicle-makes", country];
  const {
    data: makesData,
    isLoading: makesLoading,
    isError: makesError,
  } = useQuery({
    queryKey: makesKey,
    queryFn: () => listMakes(country),
  });
  const makes = React.useMemo(
    () => [...(makesData?.items ?? [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [makesData?.items]
  );

  const modelsKey = ["vehicle-models", country, selectedMake];
  const {
    data: modelsData,
    isLoading: modelsLoading,
    isError: modelsError,
  } = useQuery({
    queryKey: modelsKey,
    queryFn: () => listModels(country, selectedMake as string),
    enabled: !!selectedMake,
  });
  const models = React.useMemo(
    () => [...(modelsData?.items ?? [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [modelsData?.items]
  );

  // Reset selection when country changes
  React.useEffect(() => {
    setSelectedMake(null);
    setEditingMakeId(null);
    setEditingModelId(null);
  }, [country]);

  // ── Make mutations ──
  const invalidateMakes = () => qc.invalidateQueries({ queryKey: makesKey });
  const invalidateModels = () =>
    qc.invalidateQueries({ queryKey: ["vehicle-models", country, selectedMake] });

  const createMakeMut = useMutation({
    mutationFn: (name: string) =>
      createMake({ countryCode: country, name, order: makes.length }),
    onSuccess: async () => {
      setNewMake("");
      await invalidateMakes();
    },
  });

  const updateMakeMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<VehicleMake> }) =>
      updateMake(id, body),
    onSuccess: async () => {
      setEditingMakeId(null);
      await invalidateMakes();
    },
  });

  const deleteMakeMut = useMutation({
    mutationFn: (id: string) => deleteMake(id),
    onSuccess: async (_res, id) => {
      if (selectedMake === id) setSelectedMake(null);
      await invalidateMakes();
    },
  });

  // ── Model mutations ──
  const createModelMut = useMutation({
    mutationFn: (name: string) =>
      createModel({
        countryCode: country,
        make: selectedMake as string,
        name,
        order: models.length,
      }),
    onSuccess: async () => {
      setNewModel("");
      await invalidateModels();
    },
  });

  const bulkCreateModelMut = useMutation({
    mutationFn: async (names: string[]) => {
      let order = models.length;
      for (const name of names) {
        await createModel({
          countryCode: country,
          make: selectedMake as string,
          name,
          order: order++,
        });
      }
    },
    onSuccess: async () => {
      setNewModel("");
      await invalidateModels();
    },
  });

  const updateModelMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<VehicleModel> }) =>
      updateModel(id, body),
    onSuccess: async () => {
      setEditingModelId(null);
      await invalidateModels();
    },
  });

  const deleteModelMut = useMutation({
    mutationFn: (id: string) => deleteModel(id),
    onSuccess: async () => {
      await invalidateModels();
    },
  });

  // ── Handlers ──
  const submitNewMake = () => {
    const v = newMake.trim();
    if (!v) return;
    createMakeMut.mutate(v);
  };

  const submitNewModel = () => {
    if (!selectedMake) return;
    const raw = newModel.trim();
    if (!raw) return;
    const names = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    if (names.length === 1) createModelMut.mutate(names[0]);
    else bulkCreateModelMut.mutate(names);
  };

  const commitMakeName = (m: VehicleMake) => {
    const v = makeDraft.trim();
    if (!v || v === m.name) {
      setEditingMakeId(null);
      return;
    }
    updateMakeMut.mutate({ id: m._id, body: { name: v } });
  };

  const commitModelName = (m: VehicleModel) => {
    const v = modelDraft.trim();
    if (!v || v === m.name) {
      setEditingModelId(null);
      return;
    }
    updateModelMut.mutate({ id: m._id, body: { name: v } });
  };

  const selectedMakeObj = makes.find((m) => m._id === selectedMake) ?? null;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <AdminPageHeader
        title={t("Araç Kataloğu")}
        subtitle={t("Ülke bazında araç markalarını ve modellerini yönetin")}
      />

      {/* Country selector */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rezvix-text-muted)" }}>
            {t("Ülke")}
          </span>
          <select className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
          {makesLoading
            ? t("Yükleniyor…")
            : t("{n} marka tanımlı", { n: makes.length })}
        </div>
      </div>

      {/* Two-pane: Makes | Models */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* LEFT — Makes */}
        <div style={paneStyle}>
          <div style={paneHeader}>
            <span style={paneTitle}>{t("Markalar")}</span>
            <span style={paneCount}>{makes.length}</span>
          </div>

          {/* Add make */}
          <div style={addRow}>
            <input
              className={inputCls}
              value={newMake}
              onChange={(e) => setNewMake(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewMake();
              }}
              placeholder={t("Yeni marka adı")}
              style={{ padding: "8px 12px" }}
            />
            <button
              onClick={submitNewMake}
              disabled={createMakeMut.isPending || !newMake.trim()}
              style={{ ...btnPrimary, opacity: createMakeMut.isPending || !newMake.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
            >
              + {t("Ekle")}
            </button>
          </div>

          <div style={listWrap}>
            {makesLoading && <div style={emptyBox}>{t("Yükleniyor…")}</div>}
            {makesError && <div style={emptyBox}>{t("Yüklenemedi")}</div>}
            {!makesLoading && !makesError && makes.length === 0 && (
              <div style={emptyBox}>{t("Bu ülke için tanımlı marka yok")}</div>
            )}
            {!makesLoading &&
              makes.map((m) => {
                const isSel = m._id === selectedMake;
                return (
                  <div
                    key={m._id}
                    onClick={() => setSelectedMake(m._id)}
                    style={{
                      ...rowStyle,
                      cursor: "pointer",
                      background: isSel ? "var(--rezvix-bg-soft)" : "transparent",
                      borderLeft: isSel
                        ? "3px solid var(--rezvix-primary)"
                        : "3px solid transparent",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => editingMakeId === m._id && e.stopPropagation()}>
                      <NameCell
                        value={m.name}
                        editing={editingMakeId === m._id}
                        draft={makeDraft}
                        onDraft={setMakeDraft}
                        onStartEdit={() => {
                          setEditingMakeId(m._id);
                          setMakeDraft(m.name);
                        }}
                        onCommit={() => commitMakeName(m)}
                        onCancel={() => setEditingMakeId(null)}
                        selected={isSel}
                      />
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span style={orderBadge}>{m.order}</span>
                      <button
                        onClick={() =>
                          updateMakeMut.mutate({ id: m._id, body: { isActive: !m.isActive } })
                        }
                        style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                        title={t("Durumu değiştir")}
                      >
                        <StatusDot active={m.isActive} labels={[t("Aktif"), t("Pasif")]} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingMakeId(m._id);
                          setMakeDraft(m.name);
                        }}
                        style={btnSmall}
                      >
                        {t("Düzenle")}
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              t("Marka ve tüm modelleri silinsin mi?")
                            )
                          )
                            deleteMakeMut.mutate(m._id);
                        }}
                        style={btnDanger}
                      >
                        {t("Sil")}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* RIGHT — Models */}
        <div style={paneStyle}>
          <div style={paneHeader}>
            <span style={paneTitle}>
              {t("Modeller")}
              {selectedMakeObj && (
                <span style={{ color: "var(--rezvix-text-soft)", fontWeight: 600 }}>
                  {" · "}
                  {selectedMakeObj.name}
                </span>
              )}
            </span>
            {selectedMake && <span style={paneCount}>{models.length}</span>}
          </div>

          {!selectedMake ? (
            <div style={{ ...emptyBox, padding: "48px 16px" }}>
              {t("Modelleri görmek için soldan bir marka seçin")}
            </div>
          ) : (
            <>
              {/* Add model + bulk */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={addRow}>
                  <input
                    className={inputCls}
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitNewModel();
                    }}
                    placeholder={t("Model adı — toplu için virgülle ayırın")}
                    style={{ padding: "8px 12px" }}
                  />
                  <button
                    onClick={submitNewModel}
                    disabled={
                      createModelMut.isPending ||
                      bulkCreateModelMut.isPending ||
                      !newModel.trim()
                    }
                    style={{
                      ...btnPrimary,
                      opacity:
                        createModelMut.isPending ||
                        bulkCreateModelMut.isPending ||
                        !newModel.trim()
                          ? 0.6
                          : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    + {t("Ekle")}
                  </button>
                </div>
                <span style={{ fontSize: 11.5, color: "var(--rezvix-text-soft)" }}>
                  {t("örn: Corolla, Yaris, Auris → her biri ayrı model olarak eklenir")}
                </span>
              </div>

              <div style={listWrap}>
                {modelsLoading && <div style={emptyBox}>{t("Yükleniyor…")}</div>}
                {modelsError && <div style={emptyBox}>{t("Yüklenemedi")}</div>}
                {!modelsLoading && !modelsError && models.length === 0 && (
                  <div style={emptyBox}>{t("Bu marka için tanımlı model yok")}</div>
                )}
                {!modelsLoading &&
                  models.map((m) => (
                    <div key={m._id} style={rowStyle}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <NameCell
                          value={m.name}
                          editing={editingModelId === m._id}
                          draft={modelDraft}
                          onDraft={setModelDraft}
                          onStartEdit={() => {
                            setEditingModelId(m._id);
                            setModelDraft(m.name);
                          }}
                          onCommit={() => commitModelName(m)}
                          onCancel={() => setEditingModelId(null)}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={orderBadge}>{m.order}</span>
                        <button
                          onClick={() =>
                            updateModelMut.mutate({
                              id: m._id,
                              body: { isActive: !m.isActive },
                            })
                          }
                          style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                          title={t("Durumu değiştir")}
                        >
                          <StatusDot active={m.isActive} labels={[t("Aktif"), t("Pasif")]} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingModelId(m._id);
                            setModelDraft(m.name);
                          }}
                          style={btnSmall}
                        >
                          {t("Düzenle")}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(t("Model silinsin mi?")))
                              deleteModelMut.mutate(m._id);
                          }}
                          style={btnDanger}
                        >
                          {t("Sil")}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1.5px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "18px 22px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  marginBottom: 20,
};

const paneStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1.5px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "16px 18px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const paneHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const paneTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "var(--rezvix-text-main)",
};

const paneCount: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--rezvix-text-soft)",
  background: "var(--rezvix-bg-soft)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 999,
  padding: "1px 10px",
  minWidth: 26,
  textAlign: "center",
};

const addRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "stretch",
};

const listWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 12,
  overflow: "hidden",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--rezvix-border-subtle)",
  fontSize: 13,
};

const orderBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--rezvix-text-muted)",
  background: "var(--rezvix-bg-soft)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 6,
  padding: "1px 7px",
  minWidth: 22,
  textAlign: "center",
};

const emptyBox: React.CSSProperties = {
  padding: "28px 16px",
  textAlign: "center",
  color: "var(--rezvix-text-soft)",
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  background: "var(--rezvix-primary)",
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  background: "var(--rezvix-bg-soft)",
  border: "1px solid var(--rezvix-border-strong)",
  color: "var(--rezvix-text-main)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  background: "rgba(220,38,38,0.08)",
  border: "1px solid rgba(220,38,38,0.2)",
  color: "var(--rezvix-danger)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
