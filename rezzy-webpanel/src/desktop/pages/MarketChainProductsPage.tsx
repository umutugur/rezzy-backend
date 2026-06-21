import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import {
  listMyOrgProducts,
  upsertOverride,
  type BranchOrgProduct,
} from "../../api/marketBranchOverride";
import { showToast } from "../../ui/Toast";

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

  return (
    <MarketDesktopLayout>
      <div style={{ padding: 24 }}>
        <style>{`
          .mcp-row { transition: background .1s ease }
          .mcp-row:hover { background: #f7f8fc }
          .mcp-num:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,.14); outline: none }
          .mcp-num::placeholder { color: #c3c7d2 }
          .mcp-reset:hover:not(:disabled) { background: rgba(220,38,38,.07) !important; border-color: #f1c4c4 !important }
          .mcp-search { transition: border-color .15s, box-shadow .15s }
          .mcp-search:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,.14); outline: none }
          .mcp-search::placeholder { color: #9aa1b1 }
          @keyframes mcpFadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
          .mcp-card { animation: mcpFadeIn .22s cubic-bezier(.16,1,.3,1) }
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
                    background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    boxShadow: "0 4px 14px rgba(79,70,229,.28)",
                    flexShrink: 0,
                  }}
                >
                  🔗
                </div>
                <h2
                  style={{
                    color: "#1b1c22",
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Zincir Ürünleri
                </h2>
              </div>
              <p style={{ color: "#5b6172", margin: "0 0 0 48px", fontSize: 13 }}>
                Zincir kataloğundaki ürünler için bu şubeye özel fiyat/stok ayarı
              </p>
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9aa1b1",
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
                  border: "1px solid #d7dbe6",
                  background: "#fff",
                  color: "#1b1c22",
                  fontSize: 13.5,
                  width: 250,
                }}
              />
            </div>
          </div>

          {/* Stats row */}
          {organization !== null && items.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "Toplam", value: items.length, dot: "#6366f1", text: "#4f46e5" },
                {
                  label: "Şube Override",
                  value: overrideCount,
                  dot: "#d97706",
                  text: "#b45309",
                },
                {
                  label: "Stoğu Yok",
                  value: items.filter((i) => !(i.override?.isAvailable ?? i.isAvailable)).length,
                  dot: "#ef4444",
                  text: "#dc2626",
                },
                {
                  label: "Gizli",
                  value: items.filter((i) => i.override?.hidden).length,
                  dot: "#9aa1b1",
                  text: "#5b6172",
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
                    background: "#fff",
                    border: "1px solid #e6e8ef",
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
                  <span style={{ color: "#5b6172", fontSize: 12.5 }}>{s.label}</span>
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
              background: "#fff",
              borderRadius: 16,
              border: "1.5px dashed #e6e8ef",
              boxShadow: "0 1px 4px rgba(17,20,40,.04)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.5 }}>🔗</div>
            <div
              style={{
                color: "#1b1c22",
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
                color: "#5b6172",
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
              color: "#5b6172",
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
              color: "#9aa1b1",
              textAlign: "center",
              padding: "60px 20px",
              background: "#fff",
              borderRadius: 14,
              border: "1px dashed #e6e8ef",
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 10, opacity: 0.6 }}>📋</div>
            <div style={{ fontSize: 15, color: "#5b6172" }}>
              {search ? "Eşleşen ürün yok." : "Zincir kataloğu henüz boş."}
            </div>
          </div>
        )}

        {/* ── Table ── */}
        {!isLoading && organization !== null && items.length > 0 && (
          <div
            className="mcp-card"
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e6e8ef",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(17,20,40,.05)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #eef0f4",
                    background: "#f8f9fc",
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
                        color: "#9aa1b1",
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
                {items.map((item) => (
                  <ProductRow
                    key={item._id}
                    item={item}
                    onMutate={handleMutate}
                  />
                ))}
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
              background: "rgba(99,102,241,.05)",
              border: "1px solid rgba(99,102,241,.12)",
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
              <span key={k} style={{ fontSize: 11.5, color: "#5b6172" }}>
                <strong style={{ color: "#4f46e5" }}>{k}</strong> — {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </MarketDesktopLayout>
  );
}
