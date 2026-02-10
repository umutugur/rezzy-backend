// src/pages/admin/AdminRestaurantCreatePage.tsx
import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
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
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: t("Dashboard") },
          { to: "/admin/banners", label: t("Bannerlar") },
          { to: "/admin/commissions", label: t("Komisyonlar") }, // ✅ menüye eklendi
          { to: "/admin/organizations", label: t("Organizasyonlar") },
          { to: "/admin/restaurants", label: t("Restoranlar") },
          { to: "/admin/users", label: t("Kullanıcılar") },
          { to: "/admin/reservations", label: t("Rezervasyonlar") },
          { to: "/admin/moderation", label: t("Moderasyon") },
          { to: "/admin/notifications", label: t("Bildirim Gönder") },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Yeni Restoran Ekle")}</h2>
          <button
            onClick={() => nav(-1)}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            {t("Geri")}
          </button>
        </div>

        <Card title={t("Sahip (Owner) Seçimi")}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-end gap-2 mb-1">
                <label className="block text-sm text-gray-600">{t("Kullanıcı Ara")}</label>
                <button
                  type="button"
                  onClick={() => setUserModalOpen(true)}
                  className="ml-auto px-2.5 py-1.5 text-xs rounded-md bg-brand-600 text-white hover:bg-brand-700"
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
                className="w-full border rounded-lg px-3 py-2"
              />
              {ownerQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-48 overflow-auto border rounded-lg">
                  {searchQ.isLoading && (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      {t("Aranıyor…")}
                    </div>
                  )}
                  {searchQ.data?.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      {t("Sonuç yok")}
                    </div>
                  )}
                  {(searchQ.data ?? []).map((u: UserLite) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => setOwner(u)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        owner?._id === u._id ? "bg-brand-50" : ""
                      }`}
                    >
                      <div className="font-medium">{u.name || t("-")}</div>
                      <div className="text-gray-500">{u.email || ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Seçilen Sahip")}
              </label>
              <div className="border rounded-lg px-3 py-2 min-h-[42px]">
                {owner ? (
                  <div>
                    <div className="font-medium">{owner.name || t("-")}</div>
                    <div className="text-gray-500 text-sm">
                      {owner.email || ""}
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-500 text-sm">
                    {t("Henüz seçilmedi")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card title={t("Restoran Bilgileri")}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Ad *")}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            {/* ✅ BusinessType */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("İşletme Tipi *")}
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>
                    {t(bt.label)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Bölge (ülke kodu) *")}
              </label>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t("TR, US, UK...")}
                className="w-full border rounded-lg px-3 py-2"
              />
              <p className="mt-1 text-xs text-gray-500">
                {t("2-3 harfli ISO ülke kodu girin (örn. TR, US, UK).")}
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Şehir")}
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">
                {t("Adres")}
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Telefon")}
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("E-posta")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </Card>

        <Card title={t("Konum Bilgileri")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Harita Adresi")}
              </label>
              <input
                value={mapAddress}
                onChange={(e) => setMapAddress(e.target.value)}
                placeholder={t("Google Harita üzerindeki adres")}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Google Maps URL")}
              </label>
              <input
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder={t("https://maps.google.com/... veya https://maps.app.goo.gl/...")}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Latitude (enlem)")}
              </label>
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
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Longitude (boylam)")}
              </label>
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
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          {typeof lat === "number" &&
            typeof lng === "number" &&
            Number.isFinite(lat) &&
            Number.isFinite(lng) && (
              <div className="mt-4">
                <iframe
                  title={t("Harita")}
                  width="100%"
                  height="250"
                  className="rounded-lg border"
                  loading="lazy"
                  src={`https://www.google.com/maps?q=${lat},${lng}&hl=tr&z=16&output=embed`}
                />
              </div>
            )}
        </Card>

        <Card title={t("Kurallar & Finans")}>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Komisyon (%)")}
              </label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Depozito Zorunlu mu?")}
              </label>
              <select
                value={depositRequired ? "yes" : "no"}
                onChange={(e) =>
                  setDepositRequired(e.target.value === "yes")
                }
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="no">{t("Hayır")}</option>
                <option value="yes">{t("Evet")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Depozito Tutarı")}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={depositAmount}
                onChange={(e) =>
                  setDepositAmount(e.target.value)
                }
                className="w-full border rounded-lg px-3 py-2"
                disabled={!depositRequired}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Check-in Önce (dk)")}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={checkinBefore}
                onChange={(e) =>
                  setCheckinBefore(e.target.value)
                }
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Check-in Sonra (dk)")}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={checkinAfter}
                onChange={(e) =>
                  setCheckinAfter(e.target.value)
                }
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Eksik Katılım Eşiği (%)")}
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={uaThreshold}
                onChange={(e) =>
                  setUaThreshold(e.target.value)
                }
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
          >
            {createMut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
          <span className="text-sm text-gray-500">
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
            <label className="block text-sm text-gray-600 mb-1">
              {t("Ad *")}
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {t("E-posta")}
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {t("Telefon")}
            </label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {t("Şifre (opsiyonel)")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setUserModalOpen(false)}
            >
              {t("Vazgeç")}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
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
    </div>
  );
}
