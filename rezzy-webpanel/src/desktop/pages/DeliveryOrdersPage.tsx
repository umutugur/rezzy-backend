import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout, useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import { showToast } from "../../ui/Toast";
import {
  restaurantListDeliveryOrders,
  restaurantAcceptDeliveryOrder,
  restaurantSetDeliveryOrderOnTheWay,
  restaurantSetDeliveryOrderDelivered,
  restaurantCancelDeliveryOrder,
  type DeliveryOrderRow,
} from "../../api/client";

type Status = "new" | "accepted" | "on_the_way" | "delivered" | "cancelled";

function formatMoney(amount: number, currency: "TRY" | "GBP") {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const symbol = currency === "GBP" ? "£" : "₺";
    return `${n.toFixed(2)}${symbol}`;
  }
}

function print80mm(title: string, html: string) {
  const w = window.open("", "_blank", "width=420,height=800");
  if (!w) return;

  w.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm 2mm; }
          body { font-family: Menlo, Monaco, Consolas, monospace; font-size: 11px; margin: 0; width: 72mm; }
          .wrap { padding: 6px 8px; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          .row { display:flex; justify-content:space-between; margin: 2px 0; }
          .bold { font-weight: 800; }
          .small { font-size: 10px; }
        </style>
      </head>
      <body><div class="wrap">${html}</div></body>
    </html>
  `);

  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 150);
}

function buildPrintHtml(o: DeliveryOrderRow, currency: "TRY" | "GBP") {
  const created = o.createdAt ? new Date(o.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "-";

  const items = (o.items || []).map((it) => {
    const line = Number(it.price || 0) * Number(it.qty || 1);
    return `<div class="row"><span>${it.qty}× ${it.title}</span><span>${formatMoney(line, currency)}</span></div>`;
  }).join("");

  const addr = o.addressText || "-";
  const note = (o.customerNote || "").trim();

  return `
    <div class="center bold">${o.restaurantName || "Restoran"}</div>
    <div class="center small">PAKET SİPARİŞ</div>
    <div class="line"></div>
    <div class="row small"><span>Sipariş</span><span>#${o.shortCode || o._id.slice(-6)}</span></div>
    <div class="row small"><span>Tarih</span><span>${created}</span></div>
    <div class="line"></div>
    <div class="bold">Adres</div>
    <div class="small">${addr}</div>
    <div class="line"></div>
    <div class="row bold"><span>Ürün</span><span>Tutar</span></div>
    ${items || `<div class="small">Ürün yok.</div>`}
    <div class="line"></div>
    <div class="row"><span>Ara Toplam</span><span>${formatMoney(o.subtotal || 0, currency)}</span></div>
    <div class="row"><span>Teslimat</span><span>${formatMoney(o.deliveryFee || 0, currency)}</span></div>
    <div class="row bold"><span>Toplam</span><span>${formatMoney(o.total || 0, currency)}</span></div>
    ${note ? `<div class="line"></div><div class="bold">Not</div><div class="small">${note}</div>` : ""}
    <div class="line"></div>
    <div class="center small">Rezvix</div>
  `;
}

export const DeliveryOrdersPage: React.FC = () => {
  const qc = useQueryClient();
  const user = authStore.getUser();
  const fallbackMembershipRestaurantId = user?.restaurantMemberships?.[0]?.id ?? null;
  const rid = asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  const { region } = useRestaurantDesktopCurrency();
  const currency: "TRY" | "GBP" = region === "UK" || region === "GB" ? "GBP" : "TRY";

  // sound + delta detection
  const soundRef = React.useRef<HTMLAudioElement | null>(null);
  const prevByIdRef = React.useRef<Record<string, DeliveryOrderRow> | null>(null);

  React.useEffect(() => {
    soundRef.current = new Audio("/sounds/notify.mp3");
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-delivery-orders", rid],
    queryFn: () => restaurantListDeliveryOrders(rid),
    enabled: !!rid,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const orders: DeliveryOrderRow[] = data?.items ?? [];

  // ✅ yeni sipariş sesi (status=new yeni gelen)
  React.useEffect(() => {
    const prev = prevByIdRef.current;
    const nowMap: Record<string, DeliveryOrderRow> = {};
    for (const o of orders) nowMap[String(o._id)] = o;

    if (!prev) {
      prevByIdRef.current = nowMap;
      return;
    }

    let shouldPlay = false;
    for (const id of Object.keys(nowMap)) {
      if (!prev[id] && nowMap[id]?.status === "new") {
        shouldPlay = true;
        break;
      }
      // status değişimi new -> accepted da uyarı istersen buraya eklenir
    }

    if (shouldPlay && soundRef.current) {
      try {
        soundRef.current.currentTime = 0;
        soundRef.current.play().catch(() => {});
      } catch {}
    }

    prevByIdRef.current = nowMap;
  }, [orders]);

  const acceptMut = useMutation({
    mutationFn: async (orderId: string) => restaurantAcceptDeliveryOrder(rid, orderId),
    onSuccess: (resp, vars) => {
      showToast("Sipariş onaylandı.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });

      // ✅ onaylanınca yazdır
      const o = orders.find((x) => String(x._id) === String(vars)) || null;
      if (o) {
        const html = buildPrintHtml(o, currency);
        print80mm("Paket Sipariş", html);
      }
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Onaylanamadı.", "error"),
  });

  const onTheWayMut = useMutation({
    mutationFn: async (orderId: string) => restaurantSetDeliveryOrderOnTheWay(rid, orderId),
    onSuccess: () => {
      showToast("Yola çıktı olarak işaretlendi.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Güncellenemedi.", "error"),
  });

  const deliveredMut = useMutation({
    mutationFn: async (orderId: string) => restaurantSetDeliveryOrderDelivered(rid, orderId),
    onSuccess: () => {
      showToast("Teslim edildi.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Güncellenemedi.", "error"),
  });

  const cancelMut = useMutation({
    mutationFn: async (orderId: string) => restaurantCancelDeliveryOrder(rid, orderId),
    onSuccess: () => {
      showToast("Sipariş iptal edildi.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "İptal edilemedi.", "error"),
  });

  const groups = React.useMemo(() => {
    const by: Record<Status, DeliveryOrderRow[]> = {
      new: [],
      accepted: [],
      on_the_way: [],
      delivered: [],
      cancelled: [],
    };
    for (const o of orders) {
      const st = (o.status as Status) || "new";
      if (by[st]) by[st].push(o);
      else by.new.push(o);
    }
    return by;
  }, [orders]);

  return (
    <RestaurantDesktopLayout
      activeNav="delivery"
      title="Paket Sipariş"
      subtitle="Yeni siparişleri onaylayın, yola çıktı ve teslim edildi durumlarını yönetin."
      summaryChips={[
        { label: "Yeni", value: `${groups.new.length}`, tone: groups.new.length ? "danger" : "neutral" },
        { label: "Onaylı", value: `${groups.accepted.length}`, tone: groups.accepted.length ? "warning" : "neutral" },
        { label: "Yolda", value: `${groups.on_the_way.length}`, tone: groups.on_the_way.length ? "success" : "neutral" },
      ]}
    >
      {isLoading && <div className="rezvix-empty"><div className="rezvix-empty__title">Siparişler yükleniyor…</div></div>}
      {isError && !isLoading && <div className="rezvix-empty"><div className="rezvix-empty__title">Siparişler yüklenemedi</div></div>}
      {!isLoading && !isError && orders.length === 0 && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">🛵</div>
          <div className="rezvix-empty__title">Paket sipariş yok</div>
          <div className="rezvix-empty__text">Yeni sipariş geldiğinde burada göreceksiniz.</div>
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Column
            title="Yeni"
            items={groups.new}
            currency={currency}
            actions={(o) => (
              <>
                <button className="rezvix-btn rezvix-btn--primary" onClick={() => acceptMut.mutate(String(o._id))}>
                  Onayla + Yazdır
                </button>
                <button className="rezvix-btn rezvix-btn--danger" onClick={() => cancelMut.mutate(String(o._id))}>
                  İptal
                </button>
              </>
            )}
          />
          <Column
            title="Onaylı"
            items={groups.accepted}
            currency={currency}
            actions={(o) => (
              <>
                <button className="rezvix-btn rezvix-btn--primary" onClick={() => onTheWayMut.mutate(String(o._id))}>
                  Yola Çıktı
                </button>
                <button className="rezvix-btn rezvix-btn--danger" onClick={() => cancelMut.mutate(String(o._id))}>
                  İptal
                </button>
              </>
            )}
          />
          <Column
            title="Yolda"
            items={groups.on_the_way}
            currency={currency}
            actions={(o) => (
              <>
                <button className="rezvix-btn rezvix-btn--primary" onClick={() => deliveredMut.mutate(String(o._id))}>
                  Teslim Edildi
                </button>
                <button className="rezvix-btn rezvix-btn--danger" onClick={() => cancelMut.mutate(String(o._id))}>
                  İptal
                </button>
              </>
            )}
          />
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};

function Column(props: {
  title: string;
  items: DeliveryOrderRow[];
  currency: "TRY" | "GBP";
  actions: (o: DeliveryOrderRow) => React.ReactNode;
}) {
  const { title, items, currency, actions } = props;

  return (
    <div style={{ background: "var(--rez-card)", border: "1px solid var(--rez-line)", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title} ({items.length})</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((o) => (
          <div key={String(o._id)} style={{ border: "1px solid var(--rez-line)", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>
                #{o.shortCode || String(o._id).slice(-6)}
              </div>
              <div style={{ fontWeight: 900 }}>
                {formatMoney(Number(o.total || 0), currency)}
              </div>
            </div>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              {o.addressText || "-"}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {actions(o)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}