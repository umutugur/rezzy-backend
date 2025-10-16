import React from "react";
import { useMutation } from "@tanstack/react-query";
import { adminSendNotification, AdminSendTargets } from "../../api/client";
import { showToast } from "../../ui/Toast";

export default function AdminNotificationsPage() {
  const [targets, setTargets] = React.useState<AdminSendTargets>("all");
  const [email, setEmail] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [dataRaw, setDataRaw] = React.useState<string>('{"route":"ReservationDetail","id":""}');

  const m = useMutation({
    mutationFn: adminSendNotification,
    onSuccess: (res) => {
      showToast(`Gönderildi • kullanıcı: ${res.targetedUsers}, token: ${res.targetedTokens}`, "success");
    },
    onError: (e:any) => {
      const msg = e?.response?.data?.error || e?.message || "Gönderim hatası";
      showToast(msg, "error");
    }
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let data: Record<string,string> | undefined = undefined;
    if (dataRaw.trim()) {
      try { data = JSON.parse(dataRaw); }
      catch { return showToast("Data JSON geçersiz", "error"); }
    }
    if (!title.trim() || !body.trim()) {
      return showToast("Başlık ve içerik gerekli", "error");
    }
    if (targets === "email" && !email.trim()) {
      return showToast("E-posta gerekli", "error");
    }
    m.mutate({ targets, email: email.trim() || undefined, title: title.trim(), body: body.trim(), data });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Manuel Bildirim Gönder</h2>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-soft p-6 space-y-5">
        {/* Targets */}
        <div>
          <label className="block text-sm text-gray-700 mb-2">Hedef</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { k: "all", t: "Tümü" },
              { k: "customers", t: "Müşteriler" },
              { k: "restaurants", t: "Restoranlar" },
              { k: "email", t: "Tek E-posta" },
            ].map(opt => (
              <label key={opt.k} className={`border rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2 ${targets===opt.k ? "border-brand-600 bg-brand-50" : "border-gray-300"}`}>
                <input
                  type="radio"
                  name="targets"
                  value={opt.k}
                  checked={targets===opt.k}
                  onChange={()=>setTargets(opt.k as AdminSendTargets)}
                />
                <span>{opt.t}</span>
              </label>
            ))}
          </div>
        </div>

        {targets === "email" && (
          <div>
            <label className="block text-sm text-gray-700 mb-1">E-posta</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              placeholder="kullanici@ornek.com"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-700 mb-1">Başlık</label>
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={title}
            onChange={(e)=>setTitle(e.target.value)}
            placeholder="Örn: Rezervasyonun Onaylandı!"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">İçerik</label>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 h-28 focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={body}
            onChange={(e)=>setBody(e.target.value)}
            placeholder="Örn: Bugünkü rezervasyonunuz saat 19:00’da. QR ile hızlı check-in yapabilirsiniz."
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Ek Veri (JSON, opsiyonel)</label>
          <textarea
            className="w-full font-mono text-sm rounded-lg border border-gray-300 px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={dataRaw}
            onChange={(e)=>setDataRaw(e.target.value)}
            placeholder='{"route":"ReservationDetail","id":"..."}'
          />
          <p className="text-xs text-gray-500 mt-1">Bildirim tıklanınca yönlendirme için kullanılabilir (örn. <code>route</code>, <code>id</code>).</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={m.isPending}
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
          >
            {m.isPending ? "Gönderiliyor..." : "Gönder"}
          </button>
          {m.isSuccess && <span className="text-sm text-gray-600">Gönderildi.</span>}
        </div>
      </form>
    </div>
  );
}