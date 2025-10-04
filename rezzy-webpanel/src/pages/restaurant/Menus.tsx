// src/pages/restaurant/Menus.tsx
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { authStore } from "../../store/auth";
import { Card } from "../../components/Card";

type MenuItem = {
  _id?: string;
  title: string;
  description?: string;
  pricePerPerson: number;
  isActive?: boolean;
};

async function fetchMenus(rid: string): Promise<MenuItem[]> {
  const { data } = await api.get(`/restaurants/${rid}`);
  // Hem "menus" hem de farklı isim alan response’lara dayanıklı olalım
  const raw = data?.menus ?? [];
  return Array.isArray(raw)
    ? raw.map((m: any) => ({
        _id: m._id,
        title: m.title ?? m.name ?? "",
        description: m.description ?? "",
        pricePerPerson: Number(m.pricePerPerson ?? m.price ?? 0),
        isActive: m.isActive !== false,
      }))
    : [];
}

async function updateMenus(rid: string, menus: MenuItem[]) {
  // Backend mobil ile aynı: { title, description, pricePerPerson, isActive }
  const payload = menus.map((m) => ({
    _id: m._id,
    title: m.title,
    description: m.description ?? "",
    pricePerPerson: Number(m.pricePerPerson || 0),
    isActive: m.isActive !== false,
  }));
  const { data } = await api.put(`/restaurants/${rid}/menus`, { menus: payload });
  return data;
}

export default function MenusPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["menus", rid],
    queryFn: () => fetchMenus(rid),
    enabled: !!rid,
  });

  const [rows, setRows] = React.useState<MenuItem[]>([]);
  React.useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: (payload: MenuItem[]) => updateMenus(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus", rid] }),
  });

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { title: "", description: "", pricePerPerson: 0, isActive: true },
    ]);
  const delRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/opening-hours", label: "Çalışma Saatleri" },
          { to: "/restaurant/tables", label: "Masalar" },
          { to: "/restaurant/menus", label: "Menüler" },
          { to: "/restaurant/policies", label: "Politikalar" },
          { to: "/restaurant/photos", label: "Fotoğraflar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" },
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Menüler</h2>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Veri getirilemedi</div>}

        <Card>
          <div className="space-y-4">
            {rows.map((m, idx) => (
              <div
                key={m._id ?? idx}
                className="grid grid-cols-1 md:grid-cols-8 gap-3 items-start"
              >
                <input
                  className="md:col-span-2 border rounded-lg px-3 py-2"
                  placeholder="Menü adı"
                  value={m.title}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                    )
                  }
                />
                <textarea
                  className="md:col-span-4 border rounded-lg px-3 py-2 h-[42px]"
                  placeholder="Açıklama (opsiyonel)"
                  value={m.description ?? ""}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, description: e.target.value } : x
                      )
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  className="border rounded-lg px-3 py-2"
                  placeholder="Kişi başı ₺"
                  value={m.pricePerPerson}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((x, i) =>
                        i === idx
                          ? { ...x, pricePerPerson: Number(e.target.value) || 0 }
                          : x
                      )
                    )
                  }
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Aktif</span>
                    <input
                      type="checkbox"
                      checked={m.isActive ?? true}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, isActive: e.target.checked } : x
                          )
                        )
                      }
                    />
                  </label>
                  <button
                    className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                    onClick={() => delRow(idx)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="text-sm text-gray-500">Kayıt yok</div>
            )}
            <button
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              onClick={addRow}
            >
              Yeni Menü
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={() => mut.mutate(rows)}
              disabled={mut.isPending}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
            >
              {mut.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {mut.isSuccess && (
              <span className="ml-3 text-sm text-green-700">Güncellendi.</span>
            )}
            {mut.isError && (
              <span className="ml-3 text-sm text-red-700">Hata oluştu.</span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
