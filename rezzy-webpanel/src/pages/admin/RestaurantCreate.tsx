import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { adminCreateRestaurant, adminSearchUsers } from "../../api/client";
import { showToast } from "../../ui/Toast";

type UserLite = { _id: string; name?: string; email?: string; role?: string };

export default function AdminRestaurantCreatePage() {
  const nav = useNavigate();

  // Form state
  const [ownerQuery, setOwnerQuery] = React.useState("");
  const [owner, setOwner] = React.useState<UserLite | null>(null);

  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [commissionPct, setCommissionPct] = React.useState<string>("5");
  const [depositRequired, setDepositRequired] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState<string>("0");
  const [checkinBefore, setCheckinBefore] = React.useState<string>("15");
  const [checkinAfter, setCheckinAfter] = React.useState<string>("90");
  const [uaThreshold, setUaThreshold] = React.useState<string>("80");

  const searchQ = useQuery({
    queryKey: ["admin-user-search", ownerQuery],
    queryFn: () => adminSearchUsers(ownerQuery),
    enabled: ownerQuery.trim().length >= 2
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminCreateRestaurant({
        ownerId: owner?._id as string,
        name,
        city: city || undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        commissionRate: Number(commissionPct), // yüzde veya oran, backend normalize ediyor
        depositRequired,
        depositAmount: Number(depositAmount || "0"),
        checkinWindowBeforeMinutes: Number(checkinBefore || "0"),
        checkinWindowAfterMinutes: Number(checkinAfter || "0"),
        underattendanceThresholdPercent: Number(uaThreshold || "80"),
      }),
    onSuccess: (res: any) => {
      const rid = res?.restaurant?._id || res?._id;
      showToast("Restoran oluşturuldu", "success");
      if (rid) nav(`/admin/restaurants/${rid}`, { replace: true });
      else nav("/admin/restaurants", { replace: true });
    },
    onError: () => showToast("Restoran oluşturulamadı", "error")
  });

  const canSubmit =
    !!owner && name.trim().length > 0;

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" }
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Yeni Restoran Ekle</h2>
          <button
            onClick={() => nav(-1)}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            Geri
          </button>
        </div>

        <Card title="Sahip (Owner) Seçimi">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Kullanıcı Ara</label>
              <input
                type="text"
                value={ownerQuery}
                onChange={(e) => { setOwnerQuery(e.target.value); setOwner(null); }}
                placeholder="İsim veya e-posta yaz"
                className="w-full border rounded-lg px-3 py-2"
              />
              {ownerQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-48 overflow-auto border rounded-lg">
                  {searchQ.isLoading && <div className="px-3 py-2 text-sm text-gray-500">Aranıyor…</div>}
                  {searchQ.data?.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">Sonuç yok</div>}
                  {(searchQ.data ?? []).map((u: UserLite) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => setOwner(u)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        owner?._id === u._id ? "bg-brand-50" : ""
                      }`}
                    >
                      <div className="font-medium">{u.name || "-"}</div>
                      <div className="text-gray-500">{u.email || ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Seçilen Sahip</label>
              <div className="border rounded-lg px-3 py-2 min-h-[42px]">
                {owner ? (
                  <div>
                    <div className="font-medium">{owner.name || "-"}</div>
                    <div className="text-gray-500 text-sm">{owner.email || ""}</div>
                  </div>
                ) : (
                  <span className="text-gray-500 text-sm">Henüz seçilmedi</span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Restoran Bilgileri">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Ad *</label>
              <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Şehir</label>
              <input value={city} onChange={(e)=>setCity(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Adres</label>
              <input value={address} onChange={(e)=>setAddress(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Telefon</label>
              <input value={phone} onChange={(e)=>setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">E-posta</label>
              <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
        </Card>

        <Card title="Kurallar & Finans">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Komisyon (%)</label>
              <input type="number" min={0} step={0.1} value={commissionPct} onChange={(e)=>setCommissionPct(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Depozito Zorunlu mu?</label>
              <select value={depositRequired ? "yes" : "no"} onChange={(e)=>setDepositRequired(e.target.value==="yes")} className="w-full border rounded-lg px-3 py-2">
                <option value="no">Hayır</option>
                <option value="yes">Evet</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Depozito Tutarı</label>
              <input type="number" min={0} step={1} value={depositAmount} onChange={(e)=>setDepositAmount(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Check-in Önce (dk)</label>
              <input type="number" min={0} step={1} value={checkinBefore} onChange={(e)=>setCheckinBefore(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Check-in Sonra (dk)</label>
              <input type="number" min={0} step={1} value={checkinAfter} onChange={(e)=>setCheckinAfter(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Eksik Katılım Eşiği (%)</label>
              <input type="number" min={0} max={100} step={1} value={uaThreshold} onChange={(e)=>setUaThreshold(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
          >
            {createMut.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <span className="text-sm text-gray-500">* zorunlu alan</span>
        </div>
      </div>
    </div>
  );
}