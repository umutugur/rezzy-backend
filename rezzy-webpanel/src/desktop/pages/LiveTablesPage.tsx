// src/desktop/pages/LiveTablesPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout, useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";
import { TableCard, TableStatus, TableChannel } from "../components/TableCard";
import {
  restaurantGetLiveTables,
  restaurantGetTableDetail,
  restaurantCloseTableSession,
  restaurantResolveTableService,

  // ❌ LOKAL MENÜ (kalkıyor)
  // restaurantListItems,
  // restaurantListCategories,

  // ✅ RESOLVED MENÜ (tek kapı)
  restaurantGetResolvedMenu,

  restaurantCreateWalkInOrder,
  type LiveTable,
} from "../../api/client";
import { authStore } from "../../store/auth";
import { showToast } from "../../ui/Toast";
import { TableDetailModal } from "../components/TableDetailModal";
import { WalkInOrderModal } from "../components/WalkInOrderModal";
import { asId } from "../../lib/id";

// =============== Tipler ===============
type MockTableLike = {
  id: string;
  name: string;
  location: string;
  status: TableStatus;
  total?: number;
  sinceMinutes?: number;
  channel?: TableChannel;
};

type MenuCategory = {
  _id: string;
  title: string;
  order?: number;
  isActive?: boolean;
};

type MenuItem = {
  _id: string;
  title: string;
  price: number;
  isAvailable?: boolean;
  categoryId?: string;

  // ✅ Modifier support (used by WalkInOrderModal / ModifierPicker)
  modifierGroupIds?: string[] | null;
};

type DraftOrderItem = {
  itemId: string;
  title: string;
  price: number;
  qty: number;
  note?: string;
};

type CurrencyCode = "TRY" | "GBP";

// =============== Yardımcılar ===============
function mapStatusForTable(t: LiveTable): TableStatus {
  const hasOpenReq =
    (t as any).openServiceRequests != null
      ? Number((t as any).openServiceRequests) > 0
      : false;

  switch (t.status) {
    case "empty":
      return "IDLE";
    case "waiter_call":
      return "NEED_HELP";
    case "bill_request":
      return "PAYING";
    case "order_ready":
      return "ORDER_READY";
    case "occupied":
    case "order_active":
    default:
      if (hasOpenReq) return "NEED_HELP";
      return "OPEN";
  }
}

function formatLocation(t: LiveTable): string {
  if (typeof t.floor === "number") return `Kat ${t.floor}`;
  return "Salon";
}

function minutesSince(iso: string | null): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return undefined;
  return Math.round(diffMs / 60000);
}

function formatTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(amount: number, currency: CurrencyCode) {
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

// 80mm thermal printer için basit yazdırma helper’ı
function printContent(title: string, html: string) {
  const printWindow = window.open("", "_blank", "width=400,height=800");
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm 2mm; }
          body {
            font-family: "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 11px;
            margin: 0;
            padding: 0;
            width: 72mm;
          }
          .wrapper { padding: 4px 6px; }
          .center { text-align: center; }
          .small { font-size: 10px; }
          .line { border-top: 1px dashed #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .total { font-weight: bold; margin-top: 4px; }
          .title { font-weight: bold; margin-bottom: 2px; }
          .header-name { font-weight: 700; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 2px; }
          .header-sub { font-size: 10px; margin-bottom: 4px; }
          .tiny { font-size: 9px; opacity: 0.7; margin-top: 4px; }
          .header-row { font-weight: 600; font-size: 10px; margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          ${html}
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 150);
}

// =============== Component ===============
type LiveTablesInnerProps = {
  rid: string;
  tables: LiveTable[];
  mapped: MockTableLike[];
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
  occupiedCount: number;
  waiterCallCount: number;
  billRequestCount: number;
};

const LiveTablesInner: React.FC<LiveTablesInnerProps> = ({
  rid,
  tables,
  mapped,
  isLoading,
  isError,
  hasData,
  occupiedCount,
  waiterCallCount,
  billRequestCount,
}) => {
  const { region } = useRestaurantDesktopCurrency();

  // Default currency derived from the resolved restaurant region in layout context
  const defaultCurrency: CurrencyCode =
    region === "UK" || region === "GB" ? "GBP" : "TRY";

  const qc = useQueryClient();

  // 🔔 Ses & değişiklik takibi
  const soundRef = React.useRef<HTMLAudioElement | null>(null);
  const prevTablesRef = React.useRef<Record<string, LiveTable> | null>(null);

  // 🔕 Son yapılan WALK-IN siparişleri tutan ref (masa bazlı)
  const selfWalkInRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    soundRef.current = new Audio("/sounds/notify.mp3");
  }, []);

  // Seçili masa
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);

  // Walk-in modal state
  const [isOrderModalOpen, setIsOrderModalOpen] = React.useState(false);
  const [guestName, setGuestName] = React.useState("");
  const [draftItems, setDraftItems] = React.useState<Record<string, DraftOrderItem>>({});
  const [activeCategoryId, setActiveCategoryId] = React.useState<string | "all">("all");

  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);

  // Değişiklik + ses
  React.useEffect(() => {
    if (!tables || tables.length === 0) {
      prevTablesRef.current = {};
      return;
    }

    const prev = prevTablesRef.current;
    const currentById: Record<string, LiveTable> = {};
    tables.forEach((t) => (currentById[t.id] = t));

    if (!prev) {
      prevTablesRef.current = currentById;
      return;
    }

    const triggeredTables = new Set<string>();

    for (const id of Object.keys(currentById)) {
      const curr = currentById[id];
      const old = prev[id];

      if (!old) {
        if (curr.status !== "empty" || curr.hasActiveSession) {
          triggeredTables.add(id);
          continue;
        }
      } else {
        if (old.status !== curr.status) {
          if (
            curr.status === "order_active" ||
            curr.status === "waiter_call" ||
            curr.status === "bill_request" ||
            curr.status === "order_ready"
          ) {
            triggeredTables.add(id);
          }
        }

        const prevReq = (old as any).openServiceRequests || 0;
        const nextReq = (curr as any).openServiceRequests || 0;
        if (nextReq > prevReq) triggeredTables.add(id);

        const prevTotal = old.totals?.grandTotal ?? 0;
        const nextTotal = curr.totals?.grandTotal ?? 0;
        if (nextTotal > prevTotal && curr.status === "order_active") {
          triggeredTables.add(id);
        }
      }
    }

    // Eski self-walk-in kayıtlarını temizle (10 saniyeden eski)
    const now = Date.now();
    Object.keys(selfWalkInRef.current).forEach((tid) => {
      if (now - selfWalkInRef.current[tid] > 10_000) {
        delete selfWalkInRef.current[tid];
      }
    });

    let shouldPlay = false;
    triggeredTables.forEach((tid) => {
      if (shouldPlay) return;

      const lastSelfTs = selfWalkInRef.current[tid];
      if (!lastSelfTs) {
        shouldPlay = true;
        return;
      }
      if (now - lastSelfTs > 3_000) shouldPlay = true;
    });

    if (shouldPlay && soundRef.current) {
      try {
        soundRef.current.currentTime = 0;
        soundRef.current.play().catch(() => {});
      } catch {}
    }

    prevTablesRef.current = currentById;
  }, [tables]);

  // ================== MASA DETAYI ==================
  const {
    data: tableDetail,
    isLoading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ["desktop-table-detail", rid, selectedTableId],
    queryFn: () => restaurantGetTableDetail(rid, selectedTableId as string),
    enabled: !!rid && !!selectedTableId && isDetailModalOpen,
    refetchInterval: isDetailModalOpen ? 5000 : false,
  });

  // ✅ Currency kaynağı: session.currency (yoksa layout-region'dan türetilen default)
  const currency: CurrencyCode =
    (tableDetail as any)?.session?.currency === "GBP"
      ? "GBP"
      : (tableDetail as any)?.session?.currency === "TRY"
      ? "TRY"
      : defaultCurrency;

  const closeSessionMut = useMutation({
    mutationFn: () => restaurantCloseTableSession(rid, selectedTableId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant-live-tables", rid] });
      qc.invalidateQueries({ queryKey: ["kitchen-tickets", rid] });
      refetchDetail();
    },
  });

  const resolveServiceMut = useMutation({
    mutationFn: () => restaurantResolveTableService(rid, selectedTableId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant-live-tables", rid] });
      refetchDetail();
    },
  });

  // ================== ✅ RESOLVED MENÜ (Walk-in modal için) ==================
  const {
    data: resolvedMenuData,
    isLoading: resolvedMenuLoading,
    error: resolvedMenuError,
  } = useQuery({
    queryKey: ["desktop-resolved-menu", rid],
    queryFn: () => restaurantGetResolvedMenu(rid, { includeUnavailable: true }),
    enabled: !!rid && isOrderModalOpen,
  });

  // resolved → flat categories + items
  const categoriesWithItems: MenuCategory[] = React.useMemo(() => {
    const cats = (resolvedMenuData?.categories ?? []) as any[];
    if (!cats.length) return [];

    return cats
      .filter((c) => Array.isArray(c.items) && c.items.length > 0 && c.isActive !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => ({
        _id: String(c._id),
        title: String(c.title || ""),
        order: c.order ?? 0,
        isActive: c.isActive !== false,
      }));
  }, [resolvedMenuData]);

  const menuItems: MenuItem[] = React.useMemo(() => {
    const cats = (resolvedMenuData?.categories ?? []) as any[];
    const out: MenuItem[] = [];

    for (const c of cats) {
      if (c?.isActive === false) continue;
      const cid = String(c._id);
      const items = Array.isArray(c.items) ? c.items : [];
      for (const it of items) {
        const rawIds =
          (Array.isArray((it as any).modifierGroupIds)
            ? (it as any).modifierGroupIds
            : Array.isArray((it as any).modifierGroups)
            ? (it as any).modifierGroups
            : []) as any[];

        const modifierGroupIds = rawIds
          .map((x) => (typeof x === "string" ? x : x?._id))
          .map((x) => String(x || "").trim())
          .filter(Boolean);

        out.push({
          _id: String(it._id),
          title: String(it.title || ""),
          price: Number(it.price || 0),
          isAvailable: it.isAvailable !== false,
          categoryId: cid,
          modifierGroupIds: modifierGroupIds.length ? modifierGroupIds : null,
        });
      }
    }
    return out;
  }, [resolvedMenuData]);

  // İlk açılışta aktif kategori
  React.useEffect(() => {
    if (!isOrderModalOpen) return;
    if (activeCategoryId !== "all") return;
    if (categoriesWithItems.length === 0) return;

    const first = categoriesWithItems[0];
    if (first?._id) setActiveCategoryId(first._id);
  }, [isOrderModalOpen, categoriesWithItems, activeCategoryId]);

  React.useEffect(() => {
    if (!isOrderModalOpen) {
      setDraftItems({});
      setGuestName("");
      setActiveCategoryId("all");
    }
  }, [isOrderModalOpen]);

  function handleChangeQty(item: MenuItem, delta: number) {
    setDraftItems((prev) => {
      const current = prev[item._id]?.qty ?? 0;
      const nextQty = Math.max(0, current + delta);
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[item._id];
      } else {
        next[item._id] = {
          itemId: item._id,
          title: item.title,
          price: item.price,
          qty: nextQty,
        };
      }
      return next;
    });
  }

  const visibleItems =
    activeCategoryId === "all"
      ? menuItems
      : menuItems.filter((mi) => mi.categoryId === activeCategoryId);

  const createWalkInMut = useMutation({
    mutationFn: async () => {
      if (!rid || !selectedTableId) throw new Error("Masa veya restoran bilgisi eksik.");

      const items = Object.values(draftItems).filter((it) => it.qty > 0);
      if (items.length === 0) throw new Error("En az bir ürün seçmelisiniz.");

      return restaurantCreateWalkInOrder(rid, selectedTableId, {
        guestName: guestName.trim() || undefined,
        items,
      });
    },
    onSuccess: () => {
      if (selectedTableId) selfWalkInRef.current[selectedTableId] = Date.now();

      showToast("Yeni sipariş eklendi.", "success");
      setIsOrderModalOpen(false);
      setDraftItems({});
      setGuestName("");
      qc.invalidateQueries({ queryKey: ["restaurant-live-tables", rid] });
      refetchDetail();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || "Walk-in sipariş oluşturulamadı.";
      showToast(msg, "error");
    },
  });

  // Yazdırma helper’ları (currency düzeltildi)
  function handlePrintLastOrder(td: any) {
    if (!td || !Array.isArray(td.orders) || td.orders.length === 0) return;

    const restaurantName =
      td?.table?.restaurantName ||
      td?.table?.restaurant?.name ||
      td?.table?.name ||
      "Restoran";

    const cur: CurrencyCode =
      td?.session?.currency === "GBP"
        ? "GBP"
        : td?.session?.currency === "TRY"
        ? "TRY"
        : defaultCurrency;

    const last = td.orders[td.orders.length - 1];
    const dateStr = new Date(last.createdAt).toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const itemsHtml =
      Array.isArray(last.items) && last.items.length > 0
        ? last.items
            .map((it: any) => {
              const line = Number(it.price || 0) * Number(it.qty || 1);
              return `<div class="row"><span>${it.qty}× ${it.title}</span><span>${formatMoney(line, cur)}</span></div>`;
            })
            .join("")
        : `<div class="small">Ürün yok.</div>`;

    const html = `
      <div class="center header-name">${restaurantName}</div>
      <div class="center header-sub">SON SİPARİŞ ÖZETİ</div>
      <div class="line"></div>
      <div class="row small"><span>Tarih</span><span>${dateStr}</span></div>
      <div class="row small"><span>Masa</span><span>${td.table?.name ?? "-"}</span></div>
      <div class="line"></div>
      <div class="row header-row"><span>Ürün</span><span>Tutar</span></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="row total"><span>Toplam</span><span>${formatMoney(Number(last.total || 0), cur)}</span></div>
      <div class="line"></div>
      <div class="center tiny">Bu fiş Rezvix masa yönetim sistemi ile oluşturulmuştur.</div>
    `;

    printContent("Son Sipariş", html);
  }

  function handlePrintFullBill(td: any) {
    if (!td) return;

    const restaurantName =
      td?.table?.restaurantName ||
      td?.table?.restaurant?.name ||
      td?.table?.name ||
      "Restoran";

    const cur: CurrencyCode =
      td?.session?.currency === "GBP"
        ? "GBP"
        : td?.session?.currency === "TRY"
        ? "TRY"
        : defaultCurrency;

    const nowStr = new Date().toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const orders = Array.isArray(td.orders) ? td.orders : [];

    const ordersHtml =
      orders.length === 0
        ? `<div class="small">Henüz sipariş yok.</div>`
        : orders
            .map((o: any, index: number) => {
              const timeStr = new Date(o.createdAt).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              });

              const itemsHtml =
                Array.isArray(o.items) && o.items.length > 0
                  ? o.items
                      .map((it: any) => {
                        const line = Number(it.price || 0) * Number(it.qty || 1);
                        return `<div class="row small"><span>${it.qty}× ${it.title}</span><span>${formatMoney(line, cur)}</span></div>`;
                      })
                      .join("")
                  : `<div class="small">Ürün yok.</div>`;

              return `
                <div class="small">
                  <div class="line"></div>
                  <div class="row"><span>Sipariş ${index + 1}</span><span>${timeStr}</span></div>
                  ${itemsHtml}
                  <div class="row total"><span>Ara Toplam</span><span>${formatMoney(Number(o.total || 0), cur)}</span></div>
                </div>
              `;
            })
            .join("");

    const card = Number(td.totals?.cardTotal || 0);
    const payAtVenue = Number(td.totals?.payAtVenueTotal || 0);
    const grand = Number(td.totals?.grandTotal || 0);

    const footer = `
      <div class="line"></div>
      <div class="row small"><span>Kart</span><span>${formatMoney(card, cur)}</span></div>
      <div class="row small"><span>Nakit / Mekanda</span><span>${formatMoney(payAtVenue, cur)}</span></div>
      <div class="row total"><span>Genel Toplam</span><span>${formatMoney(grand, cur)}</span></div>
      <div class="line"></div>
    `;

    const html = `
      <div class="center header-name">${restaurantName}</div>
      <div class="center header-sub">HESAP DÖKÜMÜ</div>
      <div class="line"></div>
      <div class="row small"><span>Tarih</span><span>${nowStr}</span></div>
      <div class="row small"><span>Masa</span><span>${td.table?.name ?? "-"}</span></div>
      ${ordersHtml}
      ${footer}
      <div class="center tiny">Rezervasyon ve masa yönetimi Rezvix ile sağlanmaktadır.</div>
    `;

    printContent("Adisyon", html);
  }

  const selectedTable = selectedTableId
    ? tables.find((t) => t.id === selectedTableId)
    : undefined;

  const selectedTableName = selectedTable?.name ?? "";

  const selectedItemCount = Object.values(draftItems).reduce((sum, it) => sum + it.qty, 0);
  const selectedTotal = Object.values(draftItems).reduce((sum, it) => sum + it.qty * it.price, 0);

  return (
    <>
      <div className="flex gap-4 items-start">
        <div className="flex-1">
          {isLoading && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">⏳</div>
              <div className="rezvix-empty__title">Masalar getiriliyor…</div>
              <div className="rezvix-empty__text">Canlı masa durumları birkaç saniye içinde yüklenecek.</div>
            </div>
          )}

          {isError && !isLoading && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">⚠️</div>
              <div className="rezvix-empty__title">Masalar yüklenemedi</div>
              <div className="rezvix-empty__text">Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı kontrol edin.</div>
            </div>
          )}

          {!isLoading && !isError && !hasData && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">🪑</div>
              <div className="rezvix-empty__title">Tanımlı masa bulunamadı</div>
              <div className="rezvix-empty__text">Masa planı oluşturulduğunda, canlı masa durumu burada görünecek.</div>
            </div>
          )}

          {!isLoading && !isError && hasData && (
            <div className="rezvix-tables-grid">
              {mapped.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTableId(t.id);
                    setIsDetailModalOpen(true);
                  }}
                  className="cursor-pointer"
                >
                  <TableCard
                    name={t.name}
                    location={t.location}
                    status={t.status}
                    total={t.total}
                    sinceMinutes={t.sinceMinutes}
                    channel={t.channel}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TableDetailModal
        open={isDetailModalOpen && !!selectedTableId}
        table={selectedTable}
        tableDetail={tableDetail as any}
        isLoading={detailLoading}
        error={detailError}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedTableId(null);
        }}
        onOpenWalkInModal={() => {
          if (!selectedTableId) return;
          setIsOrderModalOpen(true);
        }}
        onResolveService={() => {
          if (!selectedTableId || !tableDetail) return;
          resolveServiceMut.mutate();
        }}
        resolveServicePending={resolveServiceMut.isPending}
        onCloseSession={() => {
          if (!selectedTableId || !(tableDetail as any)?.session) return;
          closeSessionMut.mutate();
        }}
        closeSessionPending={closeSessionMut.isPending}
        onPrintLastOrder={() => {
          if (!tableDetail) return;
          handlePrintLastOrder(tableDetail);
        }}
        onPrintFullBill={() => {
          if (!tableDetail) return;
          handlePrintFullBill(tableDetail);
        }}
      />

      <WalkInOrderModal
        open={isOrderModalOpen}
        tableName={selectedTableName || "Seçili masa"}
        guestName={guestName}
        onChangeGuestName={setGuestName}
        categoriesLoading={resolvedMenuLoading}
        categoriesError={!!resolvedMenuError}
        categories={categoriesWithItems}
        activeCategoryId={activeCategoryId}
        onChangeActiveCategoryId={(id) => setActiveCategoryId(id)}
        visibleItems={visibleItems}
        menuLoading={resolvedMenuLoading}
        menuError={!!resolvedMenuError}
        draftItems={draftItems}
        onChangeQty={handleChangeQty}
        selectedItemCount={selectedItemCount}
        selectedTotal={selectedTotal}
        currency={currency}
        onClose={() => setIsOrderModalOpen(false)}
        onSubmit={() => createWalkInMut.mutate()}
        submitPending={createWalkInMut.isPending}
      />
    </>
  );
};

export const LiveTablesPage: React.FC = () => {
  const user = authStore.getUser();

  const fallbackMembershipRestaurantId = user?.restaurantMemberships?.[0]?.id ?? null;
  const rid = asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  // Canlı masalar
  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-live-tables", rid],
    queryFn: () => restaurantGetLiveTables(rid),
    enabled: !!rid,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const tables: LiveTable[] = data?.tables ?? [];

  // Özetler
  const occupiedCount = tables.filter((t) => t.status !== "empty").length;
  const waiterCallCount = tables.filter((t) => t.status === "waiter_call").length;
  const billRequestCount = tables.filter((t) => t.status === "bill_request").length;

  const mapped: MockTableLike[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    location: formatLocation(t),
    status: mapStatusForTable(t),
    total: t.totals?.grandTotal ?? undefined,
    sinceMinutes: minutesSince(t.lastOrderAt),
    channel: t.channel as TableChannel | undefined,
  }));

  const hasData = mapped.length > 0;

  return (
    <RestaurantDesktopLayout
      activeNav="tables"
      title="Canlı Masalar"
      subtitle="Lokal adisyonlar, Rezvix ve QR siparişleri tek ekranda."
      summaryChips={[
        { label: "Dolu masa", value: `${occupiedCount} adet`, tone: "success" },
        {
          label: "Garson çağrısı",
          value: `${waiterCallCount} masa`,
          tone: waiterCallCount > 0 ? "danger" : "neutral",
        },
        {
          label: "Hesap isteyen",
          value: `${billRequestCount} masa`,
          tone: billRequestCount > 0 ? "warning" : "neutral",
        },
      ]}
    >
      <LiveTablesInner
        rid={rid}
        tables={tables}
        mapped={mapped}
        isLoading={isLoading}
        isError={isError}
        hasData={hasData}
        occupiedCount={occupiedCount}
        waiterCallCount={waiterCallCount}
        billRequestCount={billRequestCount}
      />
    </RestaurantDesktopLayout>
  );
};