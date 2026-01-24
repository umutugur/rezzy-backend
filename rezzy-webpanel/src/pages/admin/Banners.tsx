import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export default function AdminBannersPage() {
  const qc = useQueryClient();

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

  const createMut = useMutation({
    mutationFn: async () => {
      if (!imageFile) throw new Error("Banner görseli zorunlu");
      if (!restaurantId) throw new Error("Restoran seçmelisin");
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
        imageFile,
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
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/banners", label: "Bannerlar" },
          { to: "/admin/commissions", label: "Komisyonlar" }, // ✅ menüye eklendi
          { to: "/admin/organizations", label: "Organizasyonlar" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" },
          { to: "/admin/notifications", label: "Bildirim Gönder" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Banner Yönetimi</h2>
        </div>

        <Card>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Placement</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                placeholder="home_top"
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Region (opsiyonel)</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="TR / CY / boş=hepsi"
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Aktif filtresi</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={active}
                onChange={(e) => setActive(e.target.value)}
              >
                <option value="true">Sadece aktif</option>
                <option value="false">Sadece pasif</option>
                <option value="all">Hepsi</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="w-full px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:opacity-90"
                onClick={() => qc.invalidateQueries({ queryKey: ["admin-banners"] })}
              >
                Yenile
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Yeni Banner Ekle</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Başlık</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="opsiyonel"
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Link (opsiyonel)</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Sıra (order)</div>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Hedef Tip</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as AdminBannerTargetType)}
              >
                <option value="delivery">Delivery (paket servis)</option>
                <option value="reservation">Reservation (rezervasyon)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-gray-500 mb-1">Restoran</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
              >
                <option value="">Restoran seç</option>
                {(restaurants ?? []).map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name} {r.region ? `(${r.region})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">StartAt</div>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">EndAt</div>
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
                Aktif
              </label>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-gray-500 mb-1">Görsel</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="md:col-span-3">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
              >
                {createMut.isPending ? "Ekleniyor..." : "Banner Ekle"}
              </button>
            </div>
          </div>
        </Card>

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Görsel</th>
                <th className="py-2 px-4">Başlık</th>
                <th className="py-2 px-4">Target</th>
                <th className="py-2 px-4">RestaurantId</th>
                <th className="py-2 px-4">Placement</th>
                <th className="py-2 px-4">Region</th>
                <th className="py-2 px-4">Order</th>
                <th className="py-2 px-4">Durum</th>
                <th className="py-2 px-4">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={9}>
                    Yükleniyor…
                  </td>
                </tr>
              )}

              {(banners ?? []).map((b: AdminBanner) => (
                <tr key={b._id} className="border-t align-top">
                  <td className="py-2 px-4">
                    <img
                      src={b.imageUrl}
                      alt={b.title ?? "banner"}
                      className="w-28 h-14 object-cover rounded-lg border"
                    />
                  </td>

                  <td className="py-2 px-4">
                    <div className="font-medium">{b.title ?? "-"}</div>
                    {b.linkUrl ? (
                      <a className="text-brand-700 underline" href={b.linkUrl} target="_blank">
                        link
                      </a>
                    ) : (
                      <div className="text-gray-400">link yok</div>
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
                      <option value="delivery">delivery</option>
                      <option value="reservation">reservation</option>
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
                      {b.isActive ? "Aktif" : "Pasif"}
                    </button>
                  </td>

                  <td className="py-2 px-4">
                    <button
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs hover:opacity-90"
                      onClick={() => {
                        if (confirm("Banner silinsin mi?")) deleteMut.mutate(b._id);
                      }}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && banners.length === 0 && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={9}>
                    Kayıt yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-gray-500">
          Not: Banner tıklama aksiyonunu mobilde `targetType` üzerinden route edeceğiz.
        </div>
      </div>
    </div>
  );
}