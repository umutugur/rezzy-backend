// src/desktop/pages/DeliveryOrdersPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RestaurantDesktopLayout,
  useRestaurantDesktopCurrency,
} from "../layouts/RestaurantDesktopLayout";
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
} from "../../api/delivery";

type Status = "new" | "accepted" | "on_the_way" | "delivered" | "cancelled";
type PaymentMethod = "card" | "cash" | "card_on_delivery" | string | undefined;

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

function paymentLabel(m: PaymentMethod): string {
  if (m === "card") return "Online Ödeme";
  if (m === "cash") return "Kapıda Nakit";
  if (m === "card_on_delivery") return "Kapıda Kart";
  return "—";
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function calcItemTitle(it: any): string {
  return safeStr(it?.itemTitle ?? it?.title);
}

function calcLineTotal(it: any): number {
  const qty = Math.max(1, Number(it?.qty || 1));
  const lineTotal = Number(it?.lineTotal ?? 0);
  if (Number.isFinite(lineTotal) && lineTotal > 0) return lineTotal;

  const unitTotal = Number(it?.unitTotal ?? 0);
  if (Number.isFinite(unitTotal) && unitTotal > 0) return unitTotal * qty;

  const price = Number(it?.price ?? 0);
  if (Number.isFinite(price) && price > 0) return price * qty;

  const basePrice = Number(it?.basePrice ?? 0);
  if (Number.isFinite(basePrice) && basePrice > 0) return basePrice * qty;

  return 0;
}

function buildSelectedModifiersHtml(it: any): string {
  const groups = Array.isArray(it?.selectedModifiers) ? it.selectedModifiers : [];
  if (!groups.length) return "";

  const rows = groups
    .map((g: any) => {
      const gTitle = safeStr(g?.groupTitle);
      const opts = Array.isArray(g?.options) ? g.options : [];
      const optTitles = opts.map((o: any) => safeStr(o?.optionTitle)).filter(Boolean);
      if (!gTitle && optTitles.length === 0) return "";
      return `<div><span class="bold">${gTitle || "Opsiyon"}:</span> ${optTitles.join(", ")}</div>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows) return "";
  return `<div class="small muted" style="margin-top:2px; line-height:1.35;">${rows}</div>`;
}

// Popup blocker fix: user gesture anında window.open
function openPrintWindow(title: string) {
  const w = window.open("", "_blank", "width=420,height=800");
  return w;
}

function writeAndPrint80mm(w: Window, title: string, html: string) {
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
          .row { display:flex; justify-content:space-between; margin: 2px 0; gap: 8px; }
          .bold { font-weight: 800; }
          .small { font-size: 10px; }
          .muted { opacity: .85; }
        </style>
      </head>
      <body><div class="wrap">${html}</div></body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } finally {
      w.close();
    }
  }, 120);
}

function buildPrintHtml(o: DeliveryOrderRow, currency: "TRY" | "GBP") {
  const created = o.createdAt
    ? new Date(o.createdAt).toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "-";

  const itemsHtml = (o.items || [])
    .map((it: any) => {
      const qty = Math.max(1, Number(it?.qty || 1));
      const title = calcItemTitle(it);
      const line = calcLineTotal(it);

      const modsHtml = buildSelectedModifiersHtml(it);

      const noteHtml = safeStr(it?.note)
        ? `<div class="small muted" style="margin-top:2px;">Not: ${safeStr(it.note)}</div>`
        : "";

      return `
        <div class="row"><span>${qty}× ${title}</span><span>${formatMoney(line, currency)}</span></div>
        ${modsHtml}
        ${noteHtml}
      `;
    })
    .join("");

  const addr = safeStr((o as any).addressText) || "-";
  const note = safeStr((o as any).customerNote);
  const pay = paymentLabel((o as any).paymentMethod);

  const customerName = safeStr((o as any).customerName);
  const customerPhone = safeStr((o as any).customerPhone);

  return `
    <div class="center bold">${safeStr((o as any).restaurantName) || "Restoran"}</div>
    <div class="center small">PAKET SİPARİŞ</div>
    <div class="line"></div>

    <div class="row small"><span>Sipariş</span><span>#${safeStr((o as any).shortCode) || String(o._id).slice(-6)}</span></div>
    <div class="row small"><span>Tarih</span><span>${created}</span></div>
    <div class="row small"><span>Ödeme</span><span>${pay}</span></div>

    ${
      customerName || customerPhone
        ? `
          <div class="line"></div>
          ${customerName ? `<div class="row small"><span>Müşteri</span><span>${customerName}</span></div>` : ""}
          ${customerPhone ? `<div class="row small"><span>Telefon</span><span>${customerPhone}</span></div>` : ""}
        `
        : ""
    }

    <div class="line"></div>
    <div class="bold">Adres</div>
    <div class="small">${addr}</div>

    ${
      note
        ? `<div class="line"></div><div class="bold">Sipariş Notu</div><div class="small">${note}</div>`
        : ""
    }

    <div class="line"></div>
    <div class="row bold"><span>Ürün</span><span>Tutar</span></div>
    ${itemsHtml || `<div class="small">Ürün yok.</div>`}

    <div class="line"></div>
    <div class="row"><span>Ara Toplam</span><span>${formatMoney((o as any).subtotal || 0, currency)}</span></div>
    <div class="row"><span>Teslimat</span><span>${formatMoney((o as any).deliveryFee || 0, currency)}</span></div>
    <div class="row bold"><span>Toplam</span><span>${formatMoney((o as any).total || 0, currency)}</span></div>

    <div class="line"></div>
    <div class="center small">Rezvix</div>
  `;
}

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export const DeliveryOrdersPage: React.FC = () => {
  const qc = useQueryClient();
  const user = authStore.getUser();
  const fallbackMembershipRestaurantId = user?.restaurantMemberships?.[0]?.id ?? null;
  const rid = asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  const { region } = useRestaurantDesktopCurrency();
  const currency: "TRY" | "GBP" = region === "UK" || region === "GB" ? "GBP" : "TRY";

  const soundRef = React.useRef<HTMLAudioElement | null>(null);
  const prevByIdRef = React.useRef<Record<string, DeliveryOrderRow> | null>(null);

  const [selected, setSelected] = React.useState<DeliveryOrderRow | null>(null);

  React.useEffect(() => {
    soundRef.current = new Audio("/sounds/order-come.mp3");
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-delivery-orders", rid],
    queryFn: () => restaurantListDeliveryOrders(rid),
    enabled: !!rid,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const orders: DeliveryOrderRow[] = data?.items ?? [];

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
      if (!prev[id] && (nowMap[id] as any)?.status === "new") {
        shouldPlay = true;
        break;
      }
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
    onSuccess: () => {
      showToast("Sipariş onaylandı.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
      setSelected(null);
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "Onaylanamadı.", "error"),
  });

  const onTheWayMut = useMutation({
    mutationFn: async (orderId: string) => restaurantSetDeliveryOrderOnTheWay(rid, orderId),
    onSuccess: () => {
      showToast("Yola çıktı olarak işaretlendi.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
      setSelected(null);
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "Güncellenemedi.", "error"),
  });

  const deliveredMut = useMutation({
    mutationFn: async (orderId: string) => restaurantSetDeliveryOrderDelivered(rid, orderId),
    onSuccess: () => {
      showToast("Teslim edildi.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
      setSelected(null);
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "Güncellenemedi.", "error"),
  });

  const cancelMut = useMutation({
    mutationFn: async (orderId: string) => restaurantCancelDeliveryOrder(rid, orderId),
    onSuccess: () => {
      showToast("Sipariş iptal edildi.", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-delivery-orders", rid] });
      setSelected(null);
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "İptal edilemedi.", "error"),
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
      const st = ((o as any).status as Status) || "new";
      if (by[st]) by[st].push(o);
      else by.new.push(o);
    }
    return by;
  }, [orders]);

  const handleAcceptAndPrint = (o: DeliveryOrderRow) => {
    const w = openPrintWindow("Paket Sipariş");
    if (!w) {
      showToast("Tarayıcı yazdırma penceresini engelledi. Popup izni ver.", "error");
      return;
    }

    const html = buildPrintHtml(o, currency);
    writeAndPrint80mm(w, "Paket Sipariş", html);

    acceptMut.mutate(String(o._id));
  };

  const handleReject = (o: DeliveryOrderRow) => cancelMut.mutate(String(o._id));
  const handleOnTheWay = (o: DeliveryOrderRow) => onTheWayMut.mutate(String(o._id));
  const handleDelivered = (o: DeliveryOrderRow) => deliveredMut.mutate(String(o._id));

  return (
    <RestaurantDesktopLayout
      activeNav="delivery"
      title="Paket Sipariş"
      subtitle="Yeni siparişleri inceleyin, onaylayın ve durumlarını yönetin."
      summaryChips={[
        { label: "Yeni", value: `${groups.new.length}`, tone: groups.new.length ? "danger" : "neutral" },
        { label: "Onaylı", value: `${groups.accepted.length}`, tone: groups.accepted.length ? "warning" : "neutral" },
        { label: "Yolda", value: `${groups.on_the_way.length}`, tone: groups.on_the_way.length ? "success" : "neutral" },
      ]}
    >
      <style>{`
        @keyframes rezGlow {
          0% { box-shadow: 0 0 0 rgba(0,0,0,0); }
          50% { box-shadow: 0 0 0 4px rgba(180, 70, 70, 0.18), 0 10px 30px rgba(0,0,0,0.08); }
          100% { box-shadow: 0 0 0 rgba(0,0,0,0); }
        }
        .rez-delivery-card { cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
        .rez-delivery-card:hover { transform: translateY(-1px); }
        .rez-delivery-new {
          border-color: rgba(180, 70, 70, .55) !important;
          animation: rezGlow 1.4s ease-in-out infinite;
        }
        .rez-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.28);
          display: flex; justify-content: flex-end;
          z-index: 9999;
        }
        .rez-modal {
          width: min(520px, 92vw);
          height: 100%;
          background: var(--rez-card);
          border-left: 1px solid var(--rez-line);
          padding: 16px;
          overflow: auto;
        }
        .rez-modal-title { font-weight: 900; font-size: 16px; }
        .rez-kv { display:flex; justify-content:space-between; gap: 10px; font-size: 12px; opacity: .85; }
        .rez-hr { border-top: 1px solid var(--rez-line); margin: 12px 0; }
        .rez-item-row { display:flex; justify-content:space-between; gap: 10px; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed rgba(0,0,0,.08); }
        .rez-badge {
          display:inline-flex; align-items:center; gap:6px;
          padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 12px;
          background: rgba(0,0,0,.05);
        }
      `}</style>

      {isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__title">Siparişler yükleniyor…</div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__title">Siparişler yüklenemedi</div>
        </div>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">🛵</div>
          <div className="rezvix-empty__title">Paket sipariş yok</div>
          <div className="rezvix-empty__text">Yeni sipariş geldiğinde burada göreceksiniz.</div>
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Column title="Yeni" items={groups.new} currency={currency} onPick={setSelected} compactNew />
          <Column title="Onaylı" items={groups.accepted} currency={currency} onPick={setSelected} />
          <Column title="Yolda" items={groups.on_the_way} currency={currency} onPick={setSelected} />
        </div>
      )}

      {selected && (
        <div className="rez-modal-overlay" onClick={() => setSelected(null)} role="presentation">
          <div className="rez-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div className="rez-modal-title">
                Sipariş #{(selected as any).shortCode || String(selected._id).slice(-6)}
              </div>
              <button className="rezvix-btn" onClick={() => setSelected(null)}>Kapat</button>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="rez-badge">{paymentLabel((selected as any).paymentMethod)}</span>
              <span className="rez-badge">
                {(selected as any).status === "new"
                  ? "Yeni"
                  : (selected as any).status === "accepted"
                  ? "Onaylı"
                  : (selected as any).status === "on_the_way"
                  ? "Yolda"
                  : (selected as any).status === "delivered"
                  ? "Teslim"
                  : "İptal"}
              </span>
            </div>

            <div className="rez-hr" />

            <div className="rez-kv">
              <span>Tarih</span>
              <span>
                {(selected as any).createdAt
                  ? new Date((selected as any).createdAt).toLocaleString("tr-TR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}
              </span>
            </div>

            {/* ✅ Müşteri satırı */}
            {(safeStr((selected as any).customerName) || safeStr((selected as any).customerPhone)) ? (
              <div className="rez-kv" style={{ marginTop: 6 }}>
                <span>Müşteri</span>
                <span style={{ textAlign: "right", maxWidth: 320 }}>
                  {[
                    safeStr((selected as any).customerName),
                    safeStr((selected as any).customerPhone),
                  ].filter(Boolean).join(" • ")}
                </span>
              </div>
            ) : null}

            <div className="rez-kv" style={{ marginTop: 6 }}>
              <span>Adres</span>
              <span style={{ textAlign: "right", maxWidth: 320 }}>
                {safeStr((selected as any).addressText) || "—"}
              </span>
            </div>

            {safeStr((selected as any).customerNote) ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 6 }}>Sipariş Notu</div>
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  {safeStr((selected as any).customerNote)}
                </div>
              </div>
            ) : null}

            <div className="rez-hr" />

            <div style={{ fontWeight: 900, marginBottom: 8 }}>Ürünler</div>
            <div>
              {(selected as any).items?.length ? (
                (selected as any).items.map((it: any, idx: number) => {
                  const qty = Math.max(1, Number(it?.qty || 1));
                  const title = calcItemTitle(it);
                  const line = calcLineTotal(it);

                  const groups = Array.isArray(it?.selectedModifiers) ? it.selectedModifiers : [];

                  return (
                    <div className="rez-item-row" key={`${it.itemId || it.itemTitle || it.title}-${idx}`}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800 }}>
                          {qty}× {title}
                        </div>

                        {groups.length ? (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85, lineHeight: 1.35 }}>
                            {groups.map((g: any, gi: number) => {
                              const gTitle = safeStr(g?.groupTitle);
                              const opts = Array.isArray(g?.options) ? g.options : [];
                              const optTitles = opts.map((o: any) => safeStr(o?.optionTitle)).filter(Boolean);
                              if (!gTitle && optTitles.length === 0) return null;

                              return (
                                <div key={`${gTitle || "ops"}-${gi}`}>
                                  <span style={{ fontWeight: 800 }}>{gTitle || "Opsiyon"}:</span>{" "}
                                  <span>{optTitles.join(", ")}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {safeStr(it?.note) ? (
                          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                            Not: {safeStr(it.note)}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ fontWeight: 900 }}>
                        {formatMoney(line, currency)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 13, opacity: 0.8 }}>Ürün yok.</div>
              )}
            </div>

            <div className="rez-hr" />

            <div className="rez-kv"><span>Ara Toplam</span><span>{formatMoney((selected as any).subtotal || 0, currency)}</span></div>
            <div className="rez-kv" style={{ marginTop: 6 }}><span>Teslimat</span><span>{formatMoney((selected as any).deliveryFee || 0, currency)}</span></div>
            <div className="rez-kv" style={{ marginTop: 6, fontWeight: 900, opacity: 1 }}><span>Toplam</span><span>{formatMoney((selected as any).total || 0, currency)}</span></div>

            <div className="rez-hr" />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {((selected as any).status === "new") && (
                <>
                  <button
                    className="rezvix-btn rezvix-btn--primary"
                    disabled={acceptMut.isPending}
                    onClick={() => handleAcceptAndPrint(selected)}
                  >
                    {acceptMut.isPending ? "Onaylanıyor…" : "Onayla"}
                  </button>

                  <button
                    className="rezvix-btn rezvix-btn--danger"
                    disabled={cancelMut.isPending}
                    onClick={() => handleReject(selected)}
                  >
                    {cancelMut.isPending ? "İptal…" : "Reddet"}
                  </button>
                </>
              )}

              {((selected as any).status === "accepted") && (
                <>
                  <button
                    className="rezvix-btn rezvix-btn--primary"
                    disabled={onTheWayMut.isPending}
                    onClick={() => handleOnTheWay(selected)}
                  >
                    {onTheWayMut.isPending ? "Güncelleniyor…" : "Yola Çıktı"}
                  </button>

                  <button
                    className="rezvix-btn rezvix-btn--danger"
                    disabled={cancelMut.isPending}
                    onClick={() => handleReject(selected)}
                  >
                    {cancelMut.isPending ? "İptal…" : "İptal"}
                  </button>
                </>
              )}

              {((selected as any).status === "on_the_way") && (
                <>
                  <button
                    className="rezvix-btn rezvix-btn--primary"
                    disabled={deliveredMut.isPending}
                    onClick={() => handleDelivered(selected)}
                  >
                    {deliveredMut.isPending ? "Güncelleniyor…" : "Teslim Edildi"}
                  </button>

                  <button
                    className="rezvix-btn rezvix-btn--danger"
                    disabled={cancelMut.isPending}
                    onClick={() => handleReject(selected)}
                  >
                    {cancelMut.isPending ? "İptal…" : "İptal"}
                  </button>
                </>
              )}

              {((selected as any).status === "delivered" || (selected as any).status === "cancelled") && (
                <button className="rezvix-btn" onClick={() => setSelected(null)}>Kapat</button>
              )}
            </div>
          </div>
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};

function Column(props: {
  title: string;
  items: DeliveryOrderRow[];
  currency: "TRY" | "GBP";
  onPick: (o: DeliveryOrderRow) => void;
  compactNew?: boolean;
}) {
  const { title, items, currency, onPick, compactNew } = props;

  return (
    <div
      style={{
        background: "var(--rez-card)",
        border: "1px solid var(--rez-line)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        {title} ({items.length})
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((o) => {
          const st = ((o as any).status as Status) || "new";
          const isNew = st === "new";

          return (
            <div
              key={String(o._id)}
              className={cx("rez-delivery-card", isNew && "rez-delivery-new")}
              onClick={() => onPick(o)}
              style={{
                border: "1px solid var(--rez-line)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(255,255,255,.65)",
              }}
              role="button"
              tabIndex={0}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  #{safeStr((o as any).shortCode) || String(o._id).slice(-6)}
                </div>
                <div style={{ fontWeight: 900 }}>
                  {formatMoney(Number((o as any).total || 0), currency)}
                </div>
              </div>

              {!compactNew && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  {safeStr((o as any).addressText) || "-"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}