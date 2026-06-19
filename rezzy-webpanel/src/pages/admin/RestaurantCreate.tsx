// src/pages/admin/AdminRestaurantCreatePage.tsx
import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card";
import {
  adminCreateSingleRestaurant,
  adminSearchUsers,
  adminCreateUser,
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import Modal from "../../components/Modal";
import { parseLatLngFromGoogleMaps } from "../../utils/geo";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

type UserLite = { _id: string; name?: string; email?: string; role?: string };

const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restoran" },
  { value: "meyhane", label: "Meyhane" },
  { value: "bar", label: "Bar" },
  { value: "cafe", label: "Kafe" },
  { value: "kebapci", label: "Kebapçı" },
  { value: "fast_food", label: "Fast Food" },
  { value: "coffee_shop", label: "Coffee Shop" },
  { value: "pub", label: "Pub" },
  { value: "other", label: "Diğer" },
];

// ── Shared style helpers ──────────────────────────────────────────────────────
const inputCls = "border rounded-lg px-3 py-2 w-full bg-white text-sm";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--rezvix-text-soft)",
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  padding: "9px 20px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  background: "var(--rezvix-primary)",
  color: "#fff",
  transition: "opacity 0.15s ease",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-soft)",
  color: "var(--rezvix-text-muted)",
  fontSize: 13,
  cursor: "pointer",
  fontWeight: 500,
};

export default function AdminRestaurantCreatePage() {
  const nav = useNavigate();
  const { t } = useI18n();

  // Owner seçimi
  const [ownerQuery, setOwnerQuery] = React.useState("");
  const [owner, setOwner] = React.useState<UserLite | null>(null);

  // Restoran formu
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");

  // ✅ Business type
  const [businessType, setBusinessType] =
    React.useState<string>("restaurant");

  // Finans/kurallar
  const [commissionPct, setCommissionPct] = React.useState<string>("5");
  const [depositRequired, setDepositRequired] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState<string>("0");
  const [checkinBefore, setCheckinBefore] = React.useState<string>("15");
  const [checkinAfter, setCheckinAfter] = React.useState<string>("90");
  const [uaThreshold, setUaThreshold] = React.useState<string>("80");

  // Konum
  const [mapAddress, setMapAddress] = React.useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = React.useState("");
  const [lat, setLat] = React.useState<number | "">("");
  const [lng, setLng] = React.useState<number | "">("");
  const [region, setRegion] = React.useState("");

  // Yeni kullanıcı modalı
  const [userModalOpen, setUserModalOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const searchQ = useQuery({
    queryKey: ["admin-user-search", ownerQuery],
    queryFn: () => adminSearchUsers(ownerQuery),
    enabled: ownerQuery.trim().length >= 2,
  });

  // Google Maps URL değişince otomatik lat/lng çek
  React.useEffect(() => {
    if (!googleMapsUrl) return;
    const p = parseLatLngFromGoogleMaps(googleMapsUrl);
    if (p) {
      setLat(Number(p.lat.toFixed(6)));
      setLng(Number(p.lng.toFixed(6)));
    }
  }, [googleMapsUrl]);

  const createMut = useMutation({
    mutationFn: () => {
      // % → fraksiyon dönüştür
      const commissionRate =
        Math.max(0, Number(commissionPct || "0")) / 100;

      // GeoJSON location (sadece ikisi de sayıysa gönder)
      let location: any | undefined = undefined;
      const latNum = typeof lat === "string" ? Number(lat) : lat;
      const lngNum = typeof lng === "string" ? Number(lng) : lng;
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        location = {
          type: "Point",
          coordinates: [Number(lngNum), Number(latNum)],
        }; // [lng,lat]
      }

            return adminCreateSingleRestaurant({
        ownerId: owner?._id as string,
        name,
        region: region.trim().toUpperCase(),
        city: city || undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,

        // ✅ işletme tipi
        businessType,

        // (opsiyonel) org adı override: boş bırakırsan backend restoran adından türetsin
        // organizationName: name.trim(),

        // finans/kurallar
        commissionRate,
        depositRequired,
        depositAmount: depositRequired ? Number(depositAmount || "0") : 0,
        checkinWindowBeforeMinutes: Number(checkinBefore || "0"),
        checkinWindowAfterMinutes: Number(checkinAfter || "0"),
        underattendanceThresholdPercent: Number(uaThreshold || "80"),

        // konum
        mapAddress: mapAddress || "",
        googleMapsUrl: googleMapsUrl || "",
        ...(location ? { location } : {}),
      });
    },
    onSuccess: (res: any) => {
      const rid = res?.restaurant?._id || res?._id;
      showToast(t("Restoran oluşturuldu"), "success");
      if (rid) nav(`/admin/restaurants/${rid}`, { replace: true });
      else nav("/admin/restaurants", { replace: true });
    },
    onError: (e: any) => {
      showToast(
        e?.response?.data?.message || t("Restoran oluşturulamadı"),
        "error"
      );
    },
  });

  const createUserMut = useMutation({
    mutationFn: () =>
      adminCreateUser({
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        password: newPassword || undefined, // opsiyonel
      }),
    onSuccess: (resp: any) => {
      // ✅ backend { ok, user } döndürse de patlamasın
      const u = resp?.user ?? resp;
      showToast(t("Kullanıcı oluşturuldu"), "success");
      setOwner({ _id: u._id, name: u.name, email: u.email, role: u.role });
      setOwnerQuery(u.email || u.name || "");
      setUserModalOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewPassword("");
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || t("Kullanıcı oluşturulamadı"),
        "error"
      ),
  });

  const canSubmit =
    !!owner && name.trim().length > 0 && region.trim().length > 0;
  const canCreateUser =
    newName.trim().length > 0 &&
    (!!newEmail.trim() || !!newPhone.trim()); // en az e-posta veya telefon

  return (
    <>
      <div style={{ padding: 24 }}>
        <AdminPageHeader
          title={t("Yeni Restoran Ekle")}
          subtitle={t("Sahip seçimi, bilgiler, konum ve kurallar")}
          actions={
            <button
              onClick={() => nav(-1)}
              style={secondaryBtn}
            >
              {t("Geri")}
            </button>
          }
        />

        <Card title={t("Sahip (Owner) Seçimi")}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  {t("Kullanıcı Ara")}
                </label>
                <button
                  type="button"
                  onClick={() => setUserModalOpen(true)}
                  style={{
                    marginLeft: "auto",
                    padding: "4px 10px",
                    fontSize: 11,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    background: "var(--rezvix-primary)",
                    color: "#fff",
                  }}
                >
                  {t("Yeni Kullanıcı")}
                </button>
              </div>
              <input
                type="text"
                value={ownerQuery}
                onChange={(e) => {
                  setOwnerQuery(e.target.value);
                  setOwner(null);
                }}
                placeholder={t("İsim veya e-posta yaz")}
                className={inputCls}
              />
              {ownerQuery.trim().length >= 2 && (
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 192,
                    overflow: "auto",
                    border: "1px solid var(--rezvix-border-strong)",
                    borderRadius: 8,
                    background: "var(--rezvix-bg-elevated)",
                  }}
                >
                  {searchQ.isLoading && (
                    <div
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      {t("Aranıyor…")}
                    </div>
                  )}
                  {searchQ.data?.length === 0 && (
                    <div
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      {t("Sonuç yok")}
                    </div>
                  )}
                  {(searchQ.data ?? []).map((u: UserLite) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => setOwner(u)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        border: "none",
                        background:
                          owner?._id === u._id
                            ? "var(--rezvix-primary-soft)"
                            : "transparent",
                        color: "var(--rezvix-text-main)",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{u.name || t("-")}</div>
                      <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                        {u.email || ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>{t("Seçilen Sahip")}</label>
              <div
                style={{
                  border: "1px solid var(--rezvix-border-strong)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  minHeight: 42,
                  background: "var(--rezvix-bg-elevated)",
                }}
              >
                {owner ? (
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--rezvix-text-main)",
                      }}
                    >
                      {owner.name || t("-")}
                    </div>
                    <div
                      style={{
                        color: "var(--rezvix-text-soft)",
                        fontSize: 12,
                      }}
                    >
                      {owner.email || ""}
                    </div>
                  </div>
                ) : (
                  <span
                    style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}
                  >
                    {t("Henüz seçilmedi")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div style={{ marginTop: 20 }}>
          <Card title={t("Restoran Bilgileri")}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t("Ad *")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* ✅ BusinessType */}
              <div>
                <label style={labelStyle}>{t("İşletme Tipi *")}</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className={inputCls}
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>
                      {t(bt.label)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>{t("Bölge (ülke kodu) *")}</label>
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder={t("TR, US, UK...")}
                  className={inputCls}
                />
                <p style={{ marginTop: 4, fontSize: 11, color: "var(--rezvix-text-soft)" }}>
                  {t("2-3 harfli ISO ülke kodu girin (örn. TR, US, UK).")}
                </p>
              </div>
              <div>
                <label style={labelStyle}>{t("Şehir")}</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>{t("Adres")}</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Telefon")}</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("E-posta")}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title={t("Konum Bilgileri")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t("Harita Adresi")}</label>
                <input
                  value={mapAddress}
                  onChange={(e) => setMapAddress(e.target.value)}
                  placeholder={t("Google Harita üzerindeki adres")}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Google Maps URL")}</label>
                <input
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  placeholder={t(
                    "https://maps.google.com/... veya https://maps.app.goo.gl/..."
                  )}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Latitude (enlem)")}</label>
                <input
                  type="number"
                  step="0.000001"
                  value={lat}
                  onChange={(e) =>
                    setLat(
                      e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                    )
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Longitude (boylam)")}</label>
                <input
                  type="number"
                  step="0.000001"
                  value={lng}
                  onChange={(e) =>
                    setLng(
                      e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                    )
                  }
                  className={inputCls}
                />
              </div>
            </div>

            {typeof lat === "number" &&
              typeof lng === "number" &&
              Number.isFinite(lat) &&
              Number.isFinite(lng) && (
                <div style={{ marginTop: 16 }}>
                  <iframe
                    title={t("Harita")}
                    width="100%"
                    height="250"
                    style={{
                      borderRadius: 8,
                      border: "1px solid var(--rezvix-border-strong)",
                    }}
                    loading="lazy"
                    src={`https://www.google.com/maps?q=${lat},${lng}&hl=tr&z=16&output=embed`}
                  />
                </div>
              )}
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title={t("Kurallar & Finans")}>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label style={labelStyle}>{t("Komisyon (%)")}</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Depozito Zorunlu mu?")}</label>
                <select
                  value={depositRequired ? "yes" : "no"}
                  onChange={(e) =>
                    setDepositRequired(e.target.value === "yes")
                  }
                  className={inputCls}
                >
                  <option value="no">{t("Hayır")}</option>
                  <option value="yes">{t("Evet")}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("Depozito Tutarı")}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className={inputCls}
                  disabled={!depositRequired}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Check-in Önce (dk)")}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={checkinBefore}
                  onChange={(e) => setCheckinBefore(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Check-in Sonra (dk)")}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={checkinAfter}
                  onChange={(e) => setCheckinAfter(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Eksik Katılım Eşiği (%)")}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={uaThreshold}
                  onChange={(e) => setUaThreshold(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </Card>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 20,
          }}
        >
          <button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
            style={{
              ...primaryBtn,
              opacity: !canSubmit || createMut.isPending ? 0.5 : 1,
              cursor: !canSubmit || createMut.isPending ? "not-allowed" : "pointer",
            }}
          >
            {createMut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
          <span style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
            {t("* zorunlu alan")}
          </span>
        </div>
      </div>

      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={t("Yeni Kullanıcı Oluştur")}
      >
        <div className="space-y-3">
          <div>
            <label style={labelStyle}>{t("Ad *")}</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label style={labelStyle}>{t("E-posta")}</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label style={labelStyle}>{t("Telefon")}</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label style={labelStyle}>{t("Şifre (opsiyonel)")}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              paddingTop: 8,
            }}
          >
            <button
              style={secondaryBtn}
              onClick={() => setUserModalOpen(false)}
            >
              {t("Vazgeç")}
            </button>
            <button
              style={{
                ...primaryBtn,
                opacity: !canCreateUser || createUserMut.isPending ? 0.5 : 1,
                cursor:
                  !canCreateUser || createUserMut.isPending
                    ? "not-allowed"
                    : "pointer",
              }}
              disabled={!canCreateUser || createUserMut.isPending}
              onClick={() => createUserMut.mutate()}
            >
              {createUserMut.isPending
                ? t("Oluşturuluyor…")
                : t("Oluştur")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
