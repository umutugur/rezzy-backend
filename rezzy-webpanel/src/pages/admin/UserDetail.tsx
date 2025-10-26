import React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import {
  adminGetUser,
  adminBanUser,
  adminUnbanUser,
  adminUpdateUserRole,
  adminGetUserRiskHistory
} from "../../api/client";
import { showToast } from "../../ui/Toast";

const TYPE_LABEL: Record<string, string> = {
  NO_SHOW: "Gelmedi",
  LATE_CANCEL: "Geç iptal",
  UNDER_ATTEND: "Eksik katılım",
  GOOD_ATTEND: "İyi katılım",
};

export default function AdminUserDetailPage() {
  const { uid = "" } = useParams();
  const qc = useQueryClient();

  const uQ = useQuery({
    queryKey: ["admin-user", uid],
    queryFn: () => adminGetUser(uid),
    enabled: !!uid
  });

  // ---- Ban form state
  const [banReason, setBanReason] = React.useState("");
  const [banUntil, setBanUntil] = React.useState(""); // YYYY-MM-DD

  const banMut = useMutation({
    mutationFn: () =>
      adminBanUser(uid, {
        reason: banReason.trim(),
        bannedUntil: banUntil ? new Date(banUntil).toISOString() : undefined
      }),
    onSuccess: () => {
      showToast("Kullanıcı banlandı", "success");
      setBanReason("");
      setBanUntil("");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
      qc.invalidateQueries({ queryKey: ["admin-user-risk", uid] });
    }
  });

  const unbanMut = useMutation({
    mutationFn: () => adminUnbanUser(uid),
    onSuccess: () => {
      showToast("Ban kaldırıldı", "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
      qc.invalidateQueries({ queryKey: ["admin-user-risk", uid] });
    }
  });

  const user = (uQ.data as any)?.user ?? uQ.data;

  const [role, setRole] = React.useState("customer");
  React.useEffect(() => {
    if (user?.role) setRole(user.role);
  }, [user?.role]);

  const roleMut = useMutation({
    mutationFn: () => adminUpdateUserRole(uid, role as any),
    onSuccess: () => {
      showToast("Rol güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
    }
  });

  // -----------------------------
  // Risk geçmişi
  // -----------------------------
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [limit, setLimit] = React.useState<number>(100);

  const riskQ = useQuery({
    queryKey: ["admin-user-risk", uid, start, end, limit],
    queryFn: () =>
      adminGetUserRiskHistory(uid, {
        start: start || undefined,
        end: end || undefined,
        limit
      }),
    enabled: !!uid
  });

  const fmtDateTime = (v?: string) => {
    if (!v) return "-";
    try {
      const d = new Date(v);
      return d.toLocaleString();
    } catch {
      return v!;
    }
  };

  const riskScore = riskQ.data?.snapshot?.riskScore ?? 0;

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
        <h2 className="text-lg font-semibold">Kullanıcı Detayı</h2>

        <Card title="Bilgiler">
          {uQ.isLoading ? (
            "Yükleniyor…"
          ) : uQ.error ? (
            <div className="text-red-600 text-sm">Kullanıcı bilgileri alınamadı.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Ad</span>
                <div>{user?.name || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">E-posta</span>
                <div>{user?.email || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Telefon</span>
                <div>{user?.phone || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Rol</span>
                <div>{user?.role || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Durum</span>
                <div>{user?.banned ? "Banlı" : "Aktif"}</div>
              </div>
            </div>
          )}
        </Card>

        <Card title="İşlemler">
          <div className="flex flex-col gap-3">
            {/* Ban formu */}
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Ban Sebebi *</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Örn: Son 3 rezervasyonda no-show"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Bitiş (opsiyonel)</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2"
                  value={banUntil}
                  onChange={(e) => setBanUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white disabled:opacity-60"
                onClick={() => banMut.mutate()}
                disabled={
                  banMut.isPending || uQ.isLoading || user?.banned || banReason.trim().length === 0
                }
                title={banReason.trim() ? "" : "Sebep gerekli"}
              >
                Banla
              </button>

              <button
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                onClick={() => unbanMut.mutate()}
                disabled={unbanMut.isPending || uQ.isLoading || !user?.banned}
              >
                Banı Kaldır
              </button>

              <div className="ml-auto flex items-end gap-2">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Rol</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="border rounded-lg px-3 py-2"
                  >
                    <option value="customer">customer</option>
                    <option value="restaurant">restaurant</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <button
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
                  onClick={() => roleMut.mutate()}
                  disabled={roleMut.isPending || uQ.isLoading}
                >
                  Rolü Kaydet
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* RİSK ÖZETİ */}
        <Card title="Risk Özeti">
          {riskQ.isLoading ? (
            "Yükleniyor…"
          ) : riskQ.error ? (
            <div className="text-red-600 text-sm">Risk verisi alınamadı.</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border">
                <div className="text-gray-500 text-sm">Risk Skoru</div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-semibold">{riskScore}</div>
                  {riskScore >= 75 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                      Yüksek risk
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="text-gray-500 text-sm">No-show Sayısı</div>
                <div className="text-2xl font-semibold">
                  {riskQ.data?.snapshot?.noShowCount ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="text-gray-500 text-sm">Ban Durumu</div>
                <div className="text-2xl font-semibold">
                  {riskQ.data?.snapshot?.banned ? "Banlı" : "Aktif"}
                </div>
                {riskQ.data?.snapshot?.bannedUntil && (
                  <div className="text-xs text-gray-500 mt-1">
                    {fmtDateTime(riskQ.data.snapshot.bannedUntil)}
                  </div>
                )}
              </div>

              <div className="md:col-span-3 grid md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg border">
                  <div className="text-gray-500 text-sm">İyi Katılım Serisi</div>
                  <div className="text-xl font-semibold">
                    {riskQ.data?.snapshot?.consecutiveGoodShows ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="text-gray-500 text-sm">Pencere (gün)</div>
                  <div className="text-xl font-semibold">
                    {riskQ.data?.snapshot?.windowDays ?? 180}
                  </div>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="text-gray-500 text-sm">Ağırlık Çarpanı</div>
                  <div className="text-xl font-semibold">
                    {riskQ.data?.snapshot?.multiplier ?? 25}
                  </div>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="text-gray-500 text-sm">Ban Nedeni</div>
                  <div className="text-sm">
                    {riskQ.data?.snapshot?.banReason || "-"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* RİSK OLAYLARI */}
        <Card title="Risk Olayları">
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="ml-auto flex items-end gap-2">
              <div>
                <label className="block text-xs text-gray-500">Başlangıç</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Bitiş</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="border rounded px-2 py-1 w-24"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value || 100))}
                />
              </div>
            </div>
          </div>

          {riskQ.isLoading ? (
            "Yükleniyor…"
          ) : !riskQ.data?.incidents?.length ? (
            <div className="text-gray-500 text-sm">Kayıt bulunamadı.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4">Tarih</th>
                    <th className="py-2 pr-4">Tip</th>
                    <th className="py-2 pr-4">Ağırlık</th>
                    <th className="py-2 pr-4">Rezervasyon</th>
                  </tr>
                </thead>
                <tbody>
                  {riskQ.data.incidents.map((it, idx) => {
                    const tooltip =
                      it.type === "NO_SHOW"
                        ? "No-show: +25"
                        : it.type === "LATE_CANCEL"
                        ? "Geç iptal: +12.5"
                        : it.type === "UNDER_ATTEND"
                        ? "Eksik katılım: oran*25*0.25"
                        : "İyi katılım: -2.5";
                    const cls =
                      it.type === "NO_SHOW"
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : it.type === "LATE_CANCEL"
                        ? "bg-orange-100 text-orange-700 border border-orange-200"
                        : it.type === "UNDER_ATTEND"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-green-100 text-green-700 border border-green-200";

                    return (
                      <tr key={idx} className="border-t">
                        <td className="py-2 pr-4">{fmtDateTime(it.at)}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${cls}`}
                            title={tooltip}
                          >
                            {TYPE_LABEL[it.type] ?? it.type}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{it.weight}</td>
                        <td className="py-2 pr-4">
                          {it.reservationId ? (
                            <a
                              className="text-blue-600 hover:underline"
                              href={`/admin/reservations?reservationId=${it.reservationId}`}
                              title="Rezervasyon listesinde aç"
                            >
                              Rezervasyonu aç{" "}
                              <code className="text-xs ml-1">{it.reservationId}</code>
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}