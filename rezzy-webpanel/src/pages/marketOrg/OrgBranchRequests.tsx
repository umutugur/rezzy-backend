// src/pages/marketOrg/OrgBranchRequests.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from "react-leaflet";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import {
  createMarketBranchRequest,
  listMarketBranchRequests,
  type MarketBranchRequest,
} from "../../api/marketOrgCatalog";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

// ─── Shared styles (mirror OrgSettings / OrgBranchDetail) ─────────────────────

const inputSx: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1.5px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  fontSize: 13.5,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

const selectSx: React.CSSProperties = {
  ...inputSx,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a9bb0' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 34,
  cursor: "pointer",
};

const sectionCardSx: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 14,
  padding: "20px 24px",
  marginBottom: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

const sectionTitleSx: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--rezvix-text-soft)",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  marginBottom: 18,
};

function onInputFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) {
  e.currentTarget.style.borderColor = "var(--rezvix-primary)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--rezvix-primary-soft)";
}
function onInputBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) {
  e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
  e.currentTarget.style.boxShadow = "none";
}

// ─── Category options ─────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "supermarket", label: "Süpermarket" },
  { value: "bakery", label: "Fırın" },
  { value: "greengrocer", label: "Manav" },
  { value: "organic", label: "Organik" },
  { value: "pharmacy", label: "Eczane" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

const STATUS_META: Record<
  MarketBranchRequest["status"],
  { label: string; bg: string; fg: string; border: string; dot: string }
> = {
  pending: {
    label: "Beklemede",
    bg: "rgba(217,119,6,.10)",
    fg: "var(--rezvix-warning, #b45309)",
    border: "rgba(217,119,6,.24)",
    dot: "#d97706",
  },
  approved: {
    label: "Onaylandı",
    bg: "rgba(22,163,74,.10)",
    fg: "var(--rezvix-success)",
    border: "rgba(22,163,74,.24)",
    dot: "var(--rezvix-success)",
  },
  rejected: {
    label: "Reddedildi",
    bg: "rgba(220,38,38,.10)",
    fg: "var(--rezvix-danger)",
    border: "rgba(220,38,38,.24)",
    dot: "var(--rezvix-danger)",
  },
};

function StatusBadge({
  status,
  t,
}: {
  status: MarketBranchRequest["status"];
  t: (s: string) => string;
}) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "4px 11px",
        fontSize: 12,
        fontWeight: 600,
        background: m.bg,
        color: m.fg,
        border: `1px solid ${m.border}`,
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot }}
      />
      {t(m.label)}
    </span>
  );
}

// ─── Map picker (reuse leaflet pattern from MarketSettingsPage) ───────────────

function LocationClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
}) {
  const center = value ?? { lat: 35.1856, lng: 33.3823 }; // Lefkoşa fallback
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={value ? 15 : 11}
      style={{
        height: 260,
        width: "100%",
        borderRadius: 12,
        border: "1px solid var(--rezvix-border-subtle)",
      }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <LocationClickHandler onPick={(lat, lng) => onChange({ lat, lng })} />
      {value && (
        <CircleMarker
          center={[value.lat, value.lng]}
          radius={10}
          pathOptions={{
            color: "#4f46e5",
            fillColor: "#4f46e5",
            fillOpacity: 0.85,
          }}
        />
      )}
    </MapContainer>
  );
}

// ─── No-org empty state ───────────────────────────────────────────────────────

function NoOrgState({ t }: { t: (s: string) => string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.4 }}>🏢</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--rezvix-text-main)",
        }}
      >
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div
        style={{ fontSize: 13, color: "var(--rezvix-text-muted)", maxWidth: 360 }}
      >
        {t(
          "Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.",
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrgBranchRequests() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const [statusFilter, setStatusFilter] = React.useState<string>("");

  // Form state
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("supermarket");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [location, setLocation] = React.useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const listQ = useQuery({
    queryKey: ["market-org-branch-requests", orgId, statusFilter],
    queryFn: () => listMarketBranchRequests(orgId!, statusFilter || undefined),
    enabled: !!orgId,
  });

  const items = listQ.data ?? [];

  const fmtDate = (v?: string | null) => {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleString("tr-TR");
    } catch {
      return v;
    }
  };

  const createMut = useMutation({
    mutationFn: () =>
      createMarketBranchRequest(orgId!, {
        name: name.trim(),
        category,
        address: address.trim(),
        city: city.trim() || undefined,
        phone: phone.trim() || undefined,
        location: {
          type: "Point",
          coordinates: [location!.lng, location!.lat],
        },
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      showToast(t("Şube talebi oluşturuldu"), "success");
      setName("");
      setCategory("supermarket");
      setAddress("");
      setCity("");
      setPhone("");
      setNotes("");
      setLocation(null);
      qc.invalidateQueries({
        queryKey: ["market-org-branch-requests", orgId],
      });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t("Şube talebi oluşturulamadı");
      showToast(msg, "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) {
      showToast(t("Bir zincire bağlı değilsiniz"), "error");
      return;
    }
    if (!name.trim()) {
      showToast(t("Şube adı zorunlu"), "error");
      return;
    }
    if (!address.trim()) {
      showToast(t("Adres zorunlu"), "error");
      return;
    }
    if (!location) {
      showToast(t("Haritadan konum seçin"), "error");
      return;
    }
    createMut.mutate();
  };

  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          title={t("Yeni Şube Talebi")}
          subtitle={t("Zincirinize yeni şube ekleme talebi gönderin")}
        />
        <NoOrgState t={t} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <AdminPageHeader
        title={t("Yeni Şube Talebi")}
        subtitle={t("Zincirinize yeni şube ekleme talebi gönderin")}
      />

      {/* ── New request form ── */}
      <form onSubmit={handleSubmit} style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Yeni Şube Talebi")}</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0 20px",
          }}
        >
          <FormField label={t("Şube Adı")} required>
            <input
              type="text"
              style={inputSx}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              placeholder={t("Örn: Lefkoşa Merkez Şube")}
            />
          </FormField>

          <FormField label={t("Kategori")} required>
            <select
              style={selectSx}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t("Şehir")}>
            <input
              type="text"
              style={inputSx}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            />
          </FormField>

          <FormField label={t("Telefon")}>
            <input
              type="text"
              style={inputSx}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            />
          </FormField>
        </div>

        <FormField label={t("Adres")} required>
          <input
            type="text"
            style={inputSx}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </FormField>

        <FormField
          label={t("Konum")}
          required
          hint={
            location
              ? t("Seçilen konum: {lat}, {lng}", {
                  lat: location.lat.toFixed(6),
                  lng: location.lng.toFixed(6),
                })
              : t("Şubenin tam konumunu işaretlemek için haritaya tıklayın")
          }
        >
          <LocationPicker value={location} onChange={setLocation} />
        </FormField>

        <FormField label={t("Not (opsiyonel)")}>
          <textarea
            style={{ ...inputSx, minHeight: 70, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </FormField>

        <div style={{ marginTop: 4 }}>
          <button
            type="submit"
            disabled={createMut.isPending}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "var(--rezvix-primary)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: createMut.isPending ? "default" : "pointer",
              opacity: createMut.isPending ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {createMut.isPending
              ? t("Talep gönderiliyor…")
              : t("Talep Gönder")}
          </button>
        </div>
      </form>

      {/* ── Existing requests ── */}
      <div style={sectionCardSx}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ ...sectionTitleSx, marginBottom: 0 }}>
            {t("Şube Talepleri")}
          </div>
          <select
            style={{ ...selectSx, width: "auto", minWidth: 160 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          >
            <option value="">{t("Tümü")}</option>
            <option value="pending">{t("Beklemede")}</option>
            <option value="approved">{t("Onaylandı")}</option>
            <option value="rejected">{t("Reddedildi")}</option>
          </select>
        </div>

        {listQ.isLoading ? (
          <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)" }}>
            {t("Yükleniyor…")}
          </div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)" }}>
            {t("Henüz şube talebi yok.")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((r) => (
              <div
                key={r._id}
                style={{
                  border: "1px solid var(--rezvix-border-subtle)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  background: "var(--rezvix-bg)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--rezvix-text-main)",
                      }}
                    >
                      {r.payload?.name || "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--rezvix-text-muted)",
                        marginTop: 3,
                      }}
                    >
                      {t(
                        CATEGORY_LABEL[r.payload?.category] ??
                          r.payload?.category ??
                          "",
                      )}
                      {r.payload?.city ? ` · ${r.payload.city}` : ""}
                      {r.payload?.address ? ` · ${r.payload.address}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={r.status} t={t} />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 8,
                    fontSize: 11.5,
                    color: "var(--rezvix-text-soft)",
                  }}
                >
                  <span>{fmtDate(r.createdAt)}</span>
                </div>

                {r.status === "rejected" && r.rejectReason && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(220,38,38,.06)",
                      border: "1px solid rgba(220,38,38,.18)",
                      fontSize: 12.5,
                      color: "var(--rezvix-danger)",
                    }}
                  >
                    {t("Red gerekçesi: {reason}", {
                      reason: r.rejectReason,
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
