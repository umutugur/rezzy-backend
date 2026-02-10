import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Cropper from "react-easy-crop";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { api } from "../../api/client";
import {
  AdminBanner,
  AdminBannerTargetType,
  adminCreateBanner,
  adminDeleteBanner,
  adminListBanners,
  adminUpdateBanner,
} from "../../api/client";
import { useI18n } from "../../i18n";

type RestaurantLite = { _id: string; name: string; region?: string };

async function fetchRestaurantsLite(): Promise<RestaurantLite[]> {
  const { data } = await api.get("/admin/restaurants");
  const items = Array.isArray(data) ? data : data?.items || [];
  return (items ?? []).map((r: any) => ({
    _id: String(r._id),
    name: String(r.name ?? ""),
    region: r.region ? String(r.region) : undefined,
  }));
}

function isoOrNull(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function fileToObjectUrl(file: File): Promise<string> {
  return URL.createObjectURL(file);
}

async function getCroppedImgFile(
  imageSrc: string,
  cropPixels: { x: number; y: number; width: number; height: number },
  fileName: string
) {
  const image: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  // Standard banner output (mobile home_top)
  const OUT_W = 1200;
  const OUT_H = 520; // ~2.307:1

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context yok");

  canvas.width = OUT_W;
  canvas.height = OUT_H;

  // Defensive bounds
  const sx = clamp(cropPixels.x, 0, Math.max(0, image.naturalWidth - 1));
  const sy = clamp(cropPixels.y, 0, Math.max(0, image.naturalHeight - 1));
  const sw = clamp(cropPixels.width, 1, image.naturalWidth - sx);
  const sh = clamp(cropPixels.height, 1, image.naturalHeight - sy);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9
    );
  });

  const safe = fileName.replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${safe}-banner.jpg`, { type: "image/jpeg" });
}

export default function AdminBannersPage() {
  const qc = useQueryClient();
  const { t } = useI18n();

  const [placement, setPlacement] = React.useState("home_top");
  const [region, setRegion] = React.useState<string>(""); // empty => all
  const [active, setActive] = React.useState<string>("true");

  const { data: bannersResp, isLoading } = useQuery({
    queryKey: ["admin-banners", placement, region, active],
    queryFn: () =>
      adminListBanners({
        placement: placement || undefined,
        region: region ? region.toUpperCase() : undefined,
        active: active === "all" ? undefined : (active as any),
      }),
  });

  const { data: restaurants } = useQuery({
    queryKey: ["admin-restaurants-lite"],
    queryFn: fetchRestaurantsLite,
  });

  const banners = bannersResp?.items ?? [];

  // Create form
  const [title, setTitle] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [order, setOrder] = React.useState<number>(0);
  const [isActiveCreate, setIsActiveCreate] = React.useState(true);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt] = React.useState("");
  const [targetType, setTargetType] = React.useState<AdminBannerTargetType>("delivery");
  const [restaurantId, setRestaurantId] = React.useState<string>("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imageSrc, setImageSrc] = React.useState<string>("");
  React.useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [crop, setCrop] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<any>(null);
  const [croppedFile, setCroppedFile] = React.useState<File | null>(null);
  const createMut = useMutation({
    mutationFn: async () => {
if (!imageFile) throw new Error(t("Banner görseli zorunlu"));
const finalImage = croppedFile ?? imageFile;
      if (!restaurantId) throw new Error(t("Restoran seçmelisin"));
      return adminCreateBanner({
        placement,
        region: region ? region.toUpperCase() : null,
        title: title.trim() || null,
        linkUrl: linkUrl.trim() || null,
        order,
        isActive: isActiveCreate,
        startAt: isoOrNull(startAt),
        endAt: isoOrNull(endAt),
        targetType,
        restaurantId,
        imageFile: finalImage,
      });
    },
    onSuccess: async () => {
      setTitle("");
      setLinkUrl("");
      setOrder(0);
      setIsActiveCreate(true);
      setStartAt("");
      setEndAt("");
      setTargetType("delivery");
      setRestaurantId("");
      setImageFile(null);
      if (imageSrc) URL.revokeObjectURL(imageSrc);
setImageSrc("");
setCroppedFile(null);
setCrop({ x: 0, y: 0 });
setZoom(1);
setCroppedAreaPixels(null);
setCropOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: async (p: { id: string; patch: any }) => {
      return adminUpdateBanner(p.id, p.patch);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => adminDeleteBanner(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

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
          <h2 className="text-lg font-semibold">{t("Banner Yönetimi")}</h2>
        </div>

        <Card>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Placement")}</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                placeholder={t("home_top")}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Region (opsiyonel)")}</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t("TR / CY / boş=hepsi")}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Aktif filtresi")}</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={active}
                onChange={(e) => setActive(e.target.value)}
              >
                <option value="true">{t("Sadece aktif")}</option>
                <option value="false">{t("Sadece pasif")}</option>
                <option value="all">{t("Hepsi")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="w-full px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:opacity-90"
                onClick={() => qc.invalidateQueries({ queryKey: ["admin-banners"] })}
              >
                {t("Yenile")}
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">{t("Yeni Banner Ekle")}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Başlık")}</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("opsiyonel")}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Link (opsiyonel)")}</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Sıra (order)")}</div>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Hedef Tip")}</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as AdminBannerTargetType)}
              >
                <option value="delivery">{t("Delivery (paket servis)")}</option>
                <option value="reservation">{t("Reservation (rezervasyon)")}</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-gray-500 mb-1">{t("Restoran")}</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
              >
                <option value="">{t("Restoran seç")}</option>
                {(restaurants ?? []).map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name} {r.region ? `(${r.region})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("StartAt")}</div>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("EndAt")}</div>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActiveCreate}
                  onChange={(e) => setIsActiveCreate(e.target.checked)}
                />
                {t("Aktif")}
              </label>
            </div>

           <div className="md:col-span-3">
  <div className="flex items-center justify-between mb-1">
    <div className="text-xs text-gray-500">
      {t("Görsel")} <span className="text-gray-400">{t("(önerilen: 1200×520 • oran ~2.3:1)")}</span>
    </div>
    {imageSrc ? (
      <button
        type="button"
        className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
        onClick={() => setCropOpen(true)}
      >
        {t("Kırp")}
      </button>
    ) : null}
  </div>

  <input
    type="file"
    accept="image/*"
    onChange={async (e) => {
      const f = e.target.files?.[0] ?? null;
      setImageFile(f);
      setCroppedFile(null);
      setCroppedAreaPixels(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);

      if (imageSrc) URL.revokeObjectURL(imageSrc);

      if (f) {
        const url = await fileToObjectUrl(f);
        setImageSrc(url);
      } else {
        setImageSrc("");
      }
    }}
  />

  {imageSrc ? (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
        <div className="text-xs text-gray-500 mb-2">{t("Önizleme (home_top)")}</div>
        <div className="w-full aspect-[2.3/1] overflow-hidden rounded-lg border bg-white">
          <img
            src={croppedFile ? URL.createObjectURL(croppedFile) : imageSrc}
            alt={t("banner preview")}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          {croppedFile ? t("Kırpılmış görsel kullanılacak.") : t("Görsel kırpılmadı; mobilde cover ile kesilebilir.")}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-3">
        <div className="text-xs text-gray-500 mb-2">{t("İpucu")}</div>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
          <li>{t("Metin/logoları merkeze yakın tut.")}</li>
          <li>{t("Çok yüksek görsellerde üst-alt kesilir; mutlaka kırp.")}</li>
          <li>{t("Yükleme JPEG’e çevrilir (kalite 0.9).")}</li>
        </ul>
      </div>
    </div>
  ) : null}
</div>

            <div className="md:col-span-3">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
              >
                {createMut.isPending ? t("Ekleniyor...") : t("Banner Ekle")}
              </button>
            </div>
          </div>
        </Card>

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">{t("Görsel")}</th>
                <th className="py-2 px-4">{t("Başlık")}</th>
                <th className="py-2 px-4">{t("Target")}</th>
                <th className="py-2 px-4">{t("RestaurantId")}</th>
                <th className="py-2 px-4">{t("Placement")}</th>
                <th className="py-2 px-4">{t("Region")}</th>
                <th className="py-2 px-4">{t("Order")}</th>
                <th className="py-2 px-4">{t("Durum")}</th>
                <th className="py-2 px-4">{t("İşlem")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={9}>
                    {t("Yükleniyor…")}
                  </td>
                </tr>
              )}

              {(banners ?? []).map((b: AdminBanner) => (
                <tr key={b._id} className="border-t align-top">
                  <td className="py-2 px-4">
                    <img
                      src={b.imageUrl}
                      alt={b.title ?? "banner"}
                      className="w-36 h-20 object-cover rounded-xl border"
                    />
                  </td>

                  <td className="py-2 px-4">
                    <div className="font-medium">{b.title ?? "-"}</div>
                    {b.linkUrl ? (
                      <a className="text-brand-700 underline" href={b.linkUrl} target="_blank">
                        {t("link")}
                      </a>
                    ) : (
                      <div className="text-gray-400">{t("link yok")}</div>
                    )}
                  </td>

                  <td className="py-2 px-4">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      value={b.targetType}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { targetType: e.target.value as AdminBannerTargetType },
                        })
                      }
                    >
                      <option value="delivery">{t("delivery")}</option>
                      <option value="reservation">{t("reservation")}</option>
                    </select>
                  </td>

                  <td className="py-2 px-4">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm max-w-[260px]"
                      value={b.restaurantId}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { restaurantId: e.target.value },
                        })
                      }
                    >
                      {(restaurants ?? []).map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="py-2 px-4">{b.placement}</td>
                  <td className="py-2 px-4">{b.region ?? "-"}</td>

                  <td className="py-2 px-4">
                    <input
                      type="number"
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1"
                      defaultValue={b.order}
                      onBlur={(e) =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { order: Number(e.target.value) },
                        })
                      }
                    />
                  </td>

                  <td className="py-2 px-4">
                    <button
                      className={
                        "inline-flex px-2 py-0.5 text-xs rounded-full " +
                        (b.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700")
                      }
                      onClick={() =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { isActive: !b.isActive },
                        })
                      }
                    >
                      {b.isActive ? t("Aktif") : t("Pasif")}
                    </button>
                  </td>

                  <td className="py-2 px-4">
                    <button
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs hover:opacity-90"
                      onClick={() => {
                        if (confirm(t("Banner silinsin mi?"))) deleteMut.mutate(b._id);
                      }}
                    >
                      {t("Sil")}
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && banners.length === 0 && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={9}>
                    {t("Kayıt yok")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-gray-500">
          {t("Not: Banner tıklama aksiyonunu mobilde `targetType` üzerinden route edeceğiz.")}
        </div>
        {cropOpen && imageSrc ? (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <div className="font-semibold">{t("Banner Kırp")}</div>
          <div className="text-xs text-gray-500">{t("Çıktı: 1200×520 (oran ~2.3:1)")}</div>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
          onClick={() => setCropOpen(false)}
        >
          {t("Kapat")}
        </button>
      </div>

      <div className="relative w-full" style={{ height: 420 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={2.3 / 1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
        />
      </div>

      <div className="px-4 py-4 border-t">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700 font-medium">{t("Zoom")}</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-56"
            />
            <div className="text-xs text-gray-500">{zoom.toFixed(2)}x</div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              onClick={() => {
                setCroppedFile(null);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                setCroppedAreaPixels(null);
              }}
            >
              {t("Sıfırla")}
            </button>

            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:opacity-90"
              onClick={async () => {
                if (!imageFile) return;
                if (!croppedAreaPixels) {
                  setCropOpen(false);
                  return;
                }

                try {
                  const f = await getCroppedImgFile(imageSrc, croppedAreaPixels, imageFile.name);
                  setCroppedFile(f);
                  setCropOpen(false);
                } catch (e) {
                  console.error(e);
                  alert(t("Kırpma sırasında hata oluştu"));
                }
              }}
            >
              {t("Kırpmayı Kaydet")}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
) : null}
      </div>
    </div>
  );
}
