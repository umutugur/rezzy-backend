import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { authStore } from "../../store/auth";
import { Card } from "../../components/Card";

type TableItem = { _id?: string; name: string; capacity: number; isActive?: boolean };

async function fetchTables(rid: string): Promise<TableItem[]> {
  const { data } = await api.get(`/restaurants/${rid}`);
  return data?.tables || [];
}

async function updateTables(rid: string, tables: TableItem[]) {
  const { data } = await api.put(`/restaurants/${rid}/tables`, { tables });
  return data;
}

export default function TablesPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tables", rid],
    queryFn: () => fetchTables(rid),
    enabled: !!rid
  });

  const [rows, setRows] = React.useState<TableItem[]>([]);
  React.useEffect(() => { if (data) setRows(data); }, [data]);

  const mut = useMutation({
    mutationFn: (payload: TableItem[]) => updateTables(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables", rid] })
  });

  const addRow = () => setRows(prev => [...prev, { name: "", capacity: 2, isActive: true }]);
  const delRow = (idx: number) => setRows(prev => prev.filter((_, i)=> i!==idx));

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/opening-hours", label: "Çalışma Saatleri" },
          { to: "/restaurant/tables", label: "Masalar" },
          { to: "/restaurant/menus", label: "Menüler" },
          { to: "/restaurant/photos", label: "Fotoğraflar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" }
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Masalar</h2>
        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Veri getirilemedi</div>}

        <Card>
          <div className="space-y-3">
            {rows.map((t, idx)=>(
              <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                <input className="border rounded-lg px-3 py-2" placeholder="Ad" value={t.name}
                       onChange={(e)=> setRows(prev=> prev.map((x,i)=> i===idx?{...x, name:e.target.value}:x))}/>
                <input type="number" min={1} className="border rounded-lg px-3 py-2" placeholder="Kapasite" value={t.capacity}
                       onChange={(e)=> setRows(prev=> prev.map((x,i)=> i===idx?{...x, capacity:Number(e.target.value)||0}:x))}/>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">Aktif</span>
                  <input type="checkbox" checked={t.isActive ?? true}
                         onChange={(e)=> setRows(prev=> prev.map((x,i)=> i===idx?{...x, isActive:e.target.checked}:x))}/>
                </label>
                <button className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2" onClick={()=>delRow(idx)}>Sil</button>
              </div>
            ))}
            {rows.length === 0 && <div className="text-sm text-gray-500">Kayıt yok</div>}
            <button className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2" onClick={addRow}>Yeni Masa</button>
          </div>

          <div className="mt-4">
            <button
              onClick={()=>mut.mutate(rows)}
              disabled={mut.isPending}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
            >
              {mut.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {mut.isSuccess && <span className="ml-3 text-sm text-green-700">Güncellendi.</span>}
            {mut.isError && <span className="ml-3 text-sm text-red-700">Hata oluştu.</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
