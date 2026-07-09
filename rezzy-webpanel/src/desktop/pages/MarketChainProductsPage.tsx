import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import {
  listMyOrgProducts,
  upsertOverride,
  type BranchOrgProduct,
} from "../../api/marketBranchOverride";
import { orgBulkPrice } from "../../api/marketOrgCatalog";
import { showToast } from "../../ui/Toast";
import BulkPriceWizard from "../../pages/marketOrg/BulkPriceWizard";
import { BulkActionsMenu } from "../../components/catalog/BulkActionsMenu";
import {
  CategoryGroupHeaderRow,
  ExpandCollapseAll,
  CATEGORY_GROUP_STYLES,
} from "../../components/catalog/CategoryGroupHeader";

// ── merge helper: changes only the patched field, preserves everything else ──
function mergedBody(
  item: BranchOrgProduct,
  patch: Partial<{
    price: number | null;
    discountPrice: number | null;
    isAvailable: boolean | null;
    hidden: boolean;
  }>
) {
  const cur = item.override || {
    price: null,
    discountPrice: null,
    isAvailable: null,
    hidden: false,
  };
  return {
    price: cur.price,
    discountPrice: cur.discountPrice,
    isAvailable: cur.isAvailable,
    hidden: cur.hidden,
    ...patch,
  };
}

// ── tiny inline number input for price/discount overrides ──
interface InlineNumProps {
  value: number | null | undefined;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}
function InlineNum({ value, placeholder, disabled, onCommit }: InlineNumProps) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");

  // sync external value changes (after mutation resolves)
  React.useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  return (
    <input
      type="number"
      className="mcp-num"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const parsed = trimmed === "" ? null : Number(trimmed);
        onCommit(parsed === null ? null : isNaN(parsed) ? null : parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{
        width: 90,
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${disabled ? "#e6e8ef" : "#d7dbe6"}`,
        background: disabled ? "#f8f9fc" : "#fff",
        color: "#1b1c22",
        fontSize: 13,
        outline: "none",
        textAlign: "right",
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

// ── toggle pill ──
interface ToggleProps {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  colorOn?: string;
  colorOff?: string;
}
function Toggle({ checked, disabled, onToggle, colorOn = "#16a34a", colorOff = "#9aa1b1" }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: checked ? colorOn : colorOff,
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background .18s ease",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,.22)",
        }}
      />
    </button>
  );
}

// ── per-row component so each row has its own pending state ──
interface RowProps {
  item: BranchOrgProduct;
  onMutate: (
    orgProductId: string,
    body: Record<string, unknown>,
    label: string
  ) => Promise<void>;
}

function ProductRow({ item, onMutate }: RowProps) {
  const [pending, setPending] = useState(false);

  const ov = item.override;
  const hasOverride = ov !== null;

  const commit = async (
    patch: Partial<{
      price: number | null;
      discountPrice: number | null;
      isAvailable: boolean | null;
      hidden: boolean;
    }>,
    label: string
  ) => {
    setPending(true);
    try {
      await onMutate(item.orgProductId, mergedBody(item, patch), label);
    } finally {
      setPending(false);
    }
  };

  const reset = async () => {
    setPending(true);
    try {
      await onMutate(item.orgProductId, {}, "Sıfırlandı");
    } finally {
      setPending(false);
    }
  };

  const effectiveAvailable = ov?.isAvailable ?? item.isAvailable;
  const effectiveHidden = ov?.hidden ?? false;

  const catLabel =
    item.category && typeof item.category === "object"
      ? item.category?.i18n?.tr?.title ?? item.category?.key ?? ""
      : "";

  return (
    <tr className="mcp-row" style={{ borderBottom: "1px solid #f0f1f6" }}>
      {/* Ürün */}
      <td style={{ padding: "11px 16px", minWidth: 220 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                objectFit: "cover",
                border: "1px solid #e6e8ef",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                flexShrink: 0,
                background: "linear-gradient(135deg,#f0f1fb,#e8eaf6)",
                border: "1px solid #e6e8ef",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6366f1",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              {item.title.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "#1b1c22",
                fontWeight: 600,
                fontSize: 13.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 200,
              }}
            >
              {item.title}
            </div>
            {item.barcode ? (
              <div
                style={{
                  color: "#9aa1b1",
                  fontSize: 11.5,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  marginTop: 2,
                }}
              >
                ▌▍▌ {item.barcode}
              </div>
            ) : catLabel ? (
              <div style={{ color: "#9aa1b1", fontSize: 11.5, marginTop: 2 }}>
                {catLabel}
              </div>
            ) : null}
          </div>
        </div>
      </td>

      {/* Geçerli Fiyat (chain effective — includes any current override already baked in) */}
      <td style={{ padding: "11px 16px", textAlign: "center" }}>
        <div>
          {item.discountPrice != null && item.discountPrice < item.price ? (
            <>
              <div
                style={{
                  color: "#9aa1b1",
                  textDecoration: "line-through",
                  fontSize: 12,
                }}
              >
                ₺{item.price.toFixed(2)}
              </div>
              <div style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
                ₺{(item.discountPrice as number).toFixed(2)}
              </div>
            </>
          ) : (
            <div style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
              ₺{item.price.toFixed(2)}
            </div>
          )}
          <div style={{ color: "#c3c7d2", fontSize: 11, marginTop: 1 }}>
            / {item.unit}
          </div>
        </div>
      </td>

      {/* Şube Fiyatı (override price) */}
      <td style={{ padding: "11px 16px", textAlign: "center" }}>
        <InlineNum
          value={ov?.price ?? null}
          placeholder={`${item.price.toFixed(2)}`}
          disabled={pending}
          onCommit={(v) => commit({ price: v }, "Şube fiyatı güncellendi")}
        />
      </td>

      {/* İndirim (override discountPrice) */}
      <td style={{ padding: "11px 16px", textAlign: "center" }}>
        <InlineNum
          value={ov?.discountPrice ?? null}
          placeholder={
            item.discountPrice != null ? `${item.discountPrice.toFixed(2)}` : "—"
          }
          disabled={pending}
          onCommit={(v) =>
            commit({ discountPrice: v }, "İndirim fiyatı güncellendi")
          }
        />
      </td>

      {/* Stok (isAvailable toggle) */}
      <td style={{ padding: "11px 16px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Toggle
            checked={effectiveAvailable}
            disabled={pending}
            onToggle={() =>
              commit({ isAvailable: !effectiveAvailable }, "Stok durumu güncellendi")
            }
          />
          <span
            style={{
              fontSize: 10.5,
              color: effectiveAvailable ? "#16a34a" : "#dc2626",
              fontWeight: 600,
            }}
          >
            {effectiveAvailable ? "Var" : "Yok"}
          </span>
        </div>
      </td>

      {/* Gizle (hidden toggle) */}
      <td style={{ padding: "11px 16px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Toggle
            checked={effectiveHidden}
            disabled={pending}
            colorOn="#dc2626"
            colorOff="#9aa1b1"
            onToggle={() =>
              commit({ hidden: !effectiveHidden }, "Görünürlük güncellendi")
            }
          />
          <span
            style={{
              fontSize: 10.5,
              color: effectiveHidden ? "#dc2626" : "#9aa1b1",
              fontWeight: 600,
            }}
          >
            {effectiveHidden ? "Gizli" : "Görünür"}
          </span>
        </div>
      </td>

      {/* Override badge + Sıfırla */}
      <td style={{ padding: "11px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {hasOverride && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                background: "rgba(245,158,11,.12)",
                color: "#d97706",
                border: "1px solid rgba(245,158,11,.28)",
                letterSpacing: "0.04em",
              }}
            >
              ŞUBE
            </span>
          )}
          <button
            type="button"
            className="mcp-reset"
            disabled={!hasOverride || pending}
            onClick={reset}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              border: "1px solid #e6e8ef",
              background: "transparent",
              color: hasOverride ? "#dc2626" : "#c3c7d2",
              cursor: hasOverride && !pending ? "pointer" : "not-allowed",
              fontSize: 12,
              fontWeight: 600,
              opacity: hasOverride ? 1 : 0.45,
              transition: "background .12s, color .12s",
            }}
          >
            {pending ? "…" : "Sıfırla"}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function MarketChainProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-org-products", search],
    queryFn: () => listMyOrgProducts({ q: search || undefined }),
    placeholderData: (prev) => prev,
  });

  const { mutateAsync: doUpsert } = useMutation({
    mutationFn: ({
      orgProductId,
      body,
    }: {
      orgProductId: string;
      body: Record<string, unknown>;
    }) => upsertOverride(orgProductId, body as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-org-products"] });
    },
  });

  const handleMutate = async (
    orgProductId: string,
    body: Record<string, unknown>,
    label: string
  ) => {
    try {
      await doUpsert({ orgProductId, body });
      showToast(label, "success");
    } catch {
      showToast("İşlem başarısız", "error");
    }
  };

  const items: BranchOrgProduct[] = data?.items ?? [];
  const organization = data?.organization ?? null;
  const overrideCount = items.filter((i) => i.override !== null).length;

  // Default state: ALL groups collapsed. We track EXPANDED groups explicitly.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const isGroupCollapsed = (id: string) => !expandedGroups.has(id);

  const isSearching = search.trim().length > 0;

  // ── Category grouping (parent → children), derived from populated category on each item ──
  const groupedSections = (() => {
    if (isSearching) return null;

    type CatInfo = { _id: string; title: string; parentId: string | null };
    const catById = new Map<string, CatInfo>();
    for (const it of items) {
      const c = it.category;
      if (c && typeof c === "object" && c._id) {
        if (!catById.has(c._id)) {
          catById.set(c._id, {
            _id: c._id,
            title: c.i18n?.tr?.title ?? c.key ?? "",
            parentId: c.parentId ?? null,
          });
        }
      }
    }

    const byCat = new Map<string, BranchOrgProduct[]>();
    const catIdOf = (it: BranchOrgProduct): string => {
      const c = it.category;
      return c && typeof c === "object" ? c._id : typeof c === "string" ? c : "";
    };
    for (const it of items) {
      const cid = catIdOf(it);
      if (!byCat.has(cid)) byCat.set(cid, []);
      byCat.get(cid)!.push(it);
    }

    const parents = [...catById.values()].filter((c) => !c.parentId);
    type Section = { id: string; title: string; items: BranchOrgProduct[]; children: Section[] };
    const sections: Section[] = [];
    const usedCatIds = new Set<string>();

    for (const parent of parents) {
      const kids = [...catById.values()].filter((c) => c.parentId === parent._id);
      const parentItems = byCat.get(parent._id) ?? [];
      const childSections: Section[] = [];
      for (const kid of kids) {
        usedCatIds.add(kid._id);
        const kidItems = byCat.get(kid._id) ?? [];
        if (kidItems.length > 0) childSections.push({ id: kid._id, title: kid.title, items: kidItems, children: [] });
      }
      usedCatIds.add(parent._id);
      const totalCount = parentItems.length + childSections.reduce((s, c) => s + c.items.length, 0);
      if (totalCount > 0) {
        sections.push({ id: parent._id, title: parent.title, items: parentItems, children: childSections });
      }
    }

    const orphanItems: BranchOrgProduct[] = [];
    for (const [cid, prods] of byCat.entries()) {
      if (!cid || !usedCatIds.has(cid)) orphanItems.push(...prods);
    }
    if (orphanItems.length > 0) {
      sections.push({ id: "__other", title: "Diğer", items: orphanItems, children: [] });
    }

    return sections;
  })();

  const allGroupIds = React.useMemo(() => {
    if (!groupedSections) return [];
    const ids: string[] = [];
    for (const section of groupedSections) {
      ids.push(section.id);
      for (const child of section.children) ids.push(child.id);
    }
    return ids;
  }, [groupedSections]);

  const expandAllGroups = () => setExpandedGroups(new Set(allGroupIds));
  const collapseAllGroups = () => setExpandedGroups(new Set());

  return (
    <MarketDesktopLayout>
      <div style={{ padding: 24 }}>
        <style>{`
          .mcp-row { transition: background .1s ease }
          .mcp-row:hover { background: var(--rezvix-bg-soft) }
          .mcp-num:focus { border-color: var(--rezvix-primary) !important; box-shadow: 0 0 0 3px var(--rezvix-primary-soft); outline: none }
          .mcp-num::placeholder { color: var(--rezvix-text-soft) }
          .mcp-reset:hover:not(:disabled) { background: rgba(220,38,38,.07) !important; border-color: #f1c4c4 !important }
          .mcp-search { transition: border-color .15s, box-shadow .15s }
          .mcp-search:focus { border-color: var(--rezvix-primary) !important; box-shadow: 0 0 0 3px var(--rezvix-primary-soft); outline: none }
          .mcp-search::placeholder { color: var(--rezvix-text-soft) }
          @keyframes mcpFadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
          .mcp-card { animation: mcpFadeIn .22s cubic-bezier(.16,1,.3,1) }
          ${CATEGORY_GROUP_STYLES}
        `}</style>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background:
                      "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    boxShadow: "0 4px 14px rgba(123,44,44,.28)",
                    flexShrink: 0,
                  }}
                >
                  🔗
                </div>
                <h2
                  style={{
                    color: "var(--rezvix-text-main)",
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Zincir Ürünleri
                </h2>
              </div>
              <p style={{ color: "var(--rezvix-text-muted)", margin: "0 0 0 48px", fontSize: 13 }}>
                Zincir kataloğundaki ürünler için bu şubeye özel fiyat/stok ayarı
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {/* Search */}
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--rezvix-text-soft)",
                    fontSize: 13,
                    pointerEvents: "none",
                  }}
                >
                  🔍
                </span>
                <input
                  className="mcp-search"
                  placeholder="Ürün veya barkod ara…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    padding: "9px 14px 9px 32px",
                    borderRadius: 10,
                    border: "1px solid var(--rezvix-border-strong)",
                    background: "var(--rezvix-bg-elevated)",
                    color: "var(--rezvix-text-main)",
                    fontSize: 13.5,
                    width: 250,
                  }}
                />
              </div>

              {organization && (
                <BulkActionsMenu
                  label="Toplu İşlemler"
                  items={[
                    {
                      key: "excel-price",
                      label: "Fiyat Güncelle (Excel)",
                      icon: "chart",
                      onClick: () => setBulkPriceOpen(true),
                      title: "Excel ile toplu fiyat güncelle",
                    },
                  ]}
                />
              )}
            </div>
          </div>

          {/* Stats row */}
          {organization !== null && items.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {[
                {
                  label: "Toplam",
                  value: items.length,
                  dot: "var(--rezvix-primary)",
                  text: "var(--rezvix-primary)",
                },
                {
                  label: "Şube Override",
                  value: overrideCount,
                  dot: "var(--rezvix-warning)",
                  text: "var(--rezvix-warning)",
                },
                {
                  label: "Stoğu Yok",
                  value: items.filter((i) => !(i.override?.isAvailable ?? i.isAvailable)).length,
                  dot: "var(--rezvix-danger)",
                  text: "var(--rezvix-danger)",
                },
                {
                  label: "Gizli",
                  value: items.filter((i) => i.override?.hidden).length,
                  dot: "var(--rezvix-text-soft)",
                  text: "var(--rezvix-text-muted)",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 13px",
                    borderRadius: 9,
                    background: "var(--rezvix-bg-elevated)",
                    border: "1px solid var(--rezvix-border-subtle)",
                    boxShadow: "0 1px 2px rgba(17,20,40,.04)",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: s.dot,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "var(--rezvix-text-muted)", fontSize: 12.5 }}>{s.label}</span>
                  <span style={{ color: s.text, fontSize: 13.5, fontWeight: 700 }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── No-org empty state ── */}
        {!isLoading && organization === null && (
          <div
            className="mcp-card"
            style={{
              textAlign: "center",
              padding: "64px 24px",
              background: "var(--rezvix-bg-elevated)",
              borderRadius: 16,
              border: "1.5px dashed var(--rezvix-border-subtle)",
              boxShadow: "0 1px 4px rgba(17,20,40,.04)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.5 }}>🔗</div>
            <div
              style={{
                color: "var(--rezvix-text-main)",
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 8,
                letterSpacing: "-0.01em",
              }}
            >
              Zincir bağlantısı yok
            </div>
            <p
              style={{
                color: "var(--rezvix-text-muted)",
                fontSize: 14,
                maxWidth: 480,
                margin: "0 auto",
                lineHeight: 1.6,
              }}
            >
              Bu market bir zincire bağlı değil. Zincir ürünleri yalnızca bir
              organizasyona bağlı marketlerde görünür.
            </p>
          </div>
        )}

        {/* ── Loading ── */}
        {isLoading && (
          <div
            style={{
              color: "var(--rezvix-text-muted)",
              padding: 48,
              textAlign: "center",
              fontSize: 14,
            }}
          >
            Yükleniyor…
          </div>
        )}

        {/* ── Empty search result ── */}
        {!isLoading && organization !== null && items.length === 0 && (
          <div
            style={{
              color: "var(--rezvix-text-soft)",
              textAlign: "center",
              padding: "60px 20px",
              background: "var(--rezvix-bg-elevated)",
              borderRadius: 14,
              border: "1px dashed var(--rezvix-border-subtle)",
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 10, opacity: 0.6 }}>📋</div>
            <div style={{ fontSize: 15, color: "var(--rezvix-text-muted)" }}>
              {search ? "Eşleşen ürün yok." : "Zincir kataloğu henüz boş."}
            </div>
          </div>
        )}

        {/* Expand/collapse all — quiet text-link pair, top-right above the table */}
        {!isLoading && organization !== null && groupedSections && groupedSections.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <ExpandCollapseAll
              allCollapsed={expandedGroups.size === 0}
              onExpandAll={expandAllGroups}
              onCollapseAll={collapseAllGroups}
              expandLabel="Tümünü aç"
              collapseLabel="Tümünü kapat"
            />
          </div>
        )}

        {/* ── Table ── */}
        {!isLoading && organization !== null && items.length > 0 && (
          <div
            className="mcp-card"
            style={{
              background: "var(--rezvix-bg-elevated)",
              borderRadius: 14,
              border: "1px solid var(--rezvix-border-subtle)",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(17,20,40,.05)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--rezvix-border-subtle)",
                    background: "var(--rezvix-bg-soft)",
                  }}
                >
                  {[
                    { label: "Ürün", align: "left" as const },
                    { label: "Geçerli Fiyat", align: "center" as const },
                    { label: "Şube Fiyatı", align: "center" as const },
                    { label: "İndirim", align: "center" as const },
                    { label: "Stok", align: "center" as const },
                    { label: "Gizle", align: "center" as const },
                    { label: "Override", align: "center" as const },
                  ].map((h) => (
                    <th
                      key={h.label}
                      style={{
                        padding: "12px 16px",
                        color: "var(--rezvix-text-soft)",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        textAlign: h.align,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  if (groupedSections) {
                    return groupedSections.map((section) => {
                      const parentCollapsed = isGroupCollapsed(section.id);
                      const totalCount =
                        section.items.length + section.children.reduce((s, c) => s + c.items.length, 0);
                      return (
                        <React.Fragment key={section.id}>
                          <CategoryGroupHeaderRow
                            title={section.title}
                            count={totalCount}
                            collapsed={parentCollapsed}
                            depth={0}
                            onToggle={() => toggleGroup(section.id)}
                            colSpan={7}
                          />
                          {!parentCollapsed &&
                            section.items.map((item) => (
                              <ProductRow key={item._id} item={item} onMutate={handleMutate} />
                            ))}
                          {!parentCollapsed &&
                            section.children.map((child) => {
                              const childCollapsed = isGroupCollapsed(child.id);
                              return (
                                <React.Fragment key={child.id}>
                                  <CategoryGroupHeaderRow
                                    title={child.title}
                                    count={child.items.length}
                                    collapsed={childCollapsed}
                                    depth={1}
                                    onToggle={() => toggleGroup(child.id)}
                                    colSpan={7}
                                  />
                                  {!childCollapsed &&
                                    child.items.map((item) => (
                                      <ProductRow key={item._id} item={item} onMutate={handleMutate} />
                                    ))}
                                </React.Fragment>
                              );
                            })}
                        </React.Fragment>
                      );
                    });
                  }

                  return items.map((item) => (
                    <ProductRow key={item._id} item={item} onMutate={handleMutate} />
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* column legend */}
        {!isLoading && organization !== null && items.length > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 9,
              background: "var(--rezvix-primary-soft)",
              border: "1px solid rgba(123,44,44,.12)",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 20px",
            }}
          >
            {[
              ["Şube Fiyatı / İndirim", "boş bırakırsanız zincir varsayılanı geçerlidir"],
              ["Stok", "yalnızca bu şubeyi etkiler"],
              ["Gizle", "ürünü bu şube katalogunda gizler"],
              ["Sıfırla", "tüm özelleştirmeleri siler"],
            ].map(([k, v]) => (
              <span key={k} style={{ fontSize: 11.5, color: "var(--rezvix-text-muted)" }}>
                <strong style={{ color: "var(--rezvix-primary)" }}>{k}</strong> — {v}
              </span>
            ))}
          </div>
        )}

        {bulkPriceOpen && organization && (
          <BulkPriceWizard
            onClose={() => setBulkPriceOpen(false)}
            onDone={() => {
              setBulkPriceOpen(false);
              qc.invalidateQueries({ queryKey: ["my-org-products"] });
            }}
            submit={(rows, dryRun) => orgBulkPrice(organization, rows, dryRun)}
          />
        )}
      </div>
    </MarketDesktopLayout>
  );
}
