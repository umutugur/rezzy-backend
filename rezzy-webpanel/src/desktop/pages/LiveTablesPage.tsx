// src/desktop/pages/LiveTablesPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { TableCard, TableStatus } from "../components/TableCard";
import {
  restaurantGetLiveTables,
  restaurantGetTableDetail,
  restaurantCloseTableSession,
  restaurantResolveTableService,
  restaurantListItems,
  restaurantListCategories,
  restaurantCreateWalkInOrder,
  type LiveTable,
} from "../../api/client";
import { authStore } from "../../store/auth";
import { showToast } from "../../ui/Toast";

// =============== Tipler ===============
type MockTableLike = {
  id: string;
  name: string;
  location: string;
  status: TableStatus;
  total?: number;
  sinceMinutes?: number;
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
};

type DraftOrderItem = {
  itemId: string;
  title: string;
  price: number;
  qty: number;
  note?: string;
};

// =============== Yardımcılar ===============
function mapStatus(status: LiveTable["status"]): TableStatus {
  switch (status) {
    case "empty":
      return "IDLE";
    case "waiter_call":
      return "NEED_HELP";
    case "bill_request":
      return "PAYING";
    case "occupied":
    case "order_active":
    default:
      return "OPEN";
  }
}

function formatLocation(t: LiveTable): string {
  if (typeof t.floor === "number") {
    return `Kat ${t.floor}`;
  }
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

function statusLabel(status: LiveTable["status"]): string {
  switch (status) {
    case "empty":
      return "Boş";
    case "occupied":
      return "Dolu";
    case "order_active":
      return "Sipariş Var";
    case "waiter_call":
      return "Garson Çağrısı";
    case "bill_request":
      return "Hesap İstendi";
    default:
      return status;
  }
}

function formatTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
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
          @page {
            size: 80mm auto;
            margin: 4mm 2mm;
          }
          body {
            font-family: "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 11px;
            margin: 0;
            padding: 0;
            width: 72mm;
          }
          .wrapper {
            padding: 4px 6px;
          }
          .center {
            text-align: center;
          }
          .small {
            font-size: 10px;
          }
          .line {
            border-top: 1px dashed #000;
            margin: 4px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
          }
          .total {
            font-weight: bold;
            margin-top: 4px;
          }
          .title {
            font-weight: bold;
            margin-bottom: 2px;
          }
          .header-name {
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }
          .header-sub {
            font-size: 10px;
            margin-bottom: 4px;
          }
          .tiny {
            font-size: 9px;
            opacity: 0.7;
            margin-top: 4px;
          }
          .header-row {
            font-weight: 600;
            font-size: 10px;
            margin-bottom: 2px;
          }
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
export const LiveTablesPage: React.FC = () => {
  const user = authStore.getUser();
  const rid = user?.restaurantId || "";
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

  // Canlı masalar
  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-live-tables", rid],
    queryFn: () => restaurantGetLiveTables(rid),
    enabled: !!rid,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const tables: LiveTable[] = data?.tables ?? [];

  // Değişiklik + ses
  React.useEffect(() => {
    if (!tables || tables.length === 0) {
      prevTablesRef.current = {};
      return;
    }

    const prev = prevTablesRef.current;
    const currentById: Record<string, LiveTable> = {};
    tables.forEach((t) => {
      currentById[t.id] = t;
    });

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
            curr.status === "bill_request"
          ) {
            triggeredTables.add(id);
          }
        }

        const prevReq = old.openServiceRequests || 0;
        const nextReq = curr.openServiceRequests || 0;
        if (nextReq > prevReq) {
          triggeredTables.add(id);
        }

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

      if (now - lastSelfTs > 3_000) {
        shouldPlay = true;
      }
    });

    if (shouldPlay && soundRef.current) {
      try {
        soundRef.current.currentTime = 0;
        soundRef.current.play().catch(() => {});
      } catch {}
    }

    prevTablesRef.current = currentById;
  }, [tables]);

  // Özetler
  const occupiedCount = tables.filter((t) => t.status !== "empty").length;
  const waiterCallCount = tables.filter((t) => t.status === "waiter_call").length;
  const billRequestCount = tables.filter((t) => t.status === "bill_request").length;

  const mapped: MockTableLike[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    location: formatLocation(t),
    status: mapStatus(t.status),
    total: t.totals?.grandTotal ?? undefined,
    sinceMinutes: minutesSince(t.lastOrderAt),
  }));

  const hasData = mapped.length > 0;

  // ================== MASA DETAYI ==================
  const {
    data: tableDetail,
    isLoading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ["desktop-table-detail", rid, selectedTableId],
    queryFn: () => restaurantGetTableDetail(rid, selectedTableId as string),
    enabled: !!rid && !!selectedTableId,
    refetchInterval: 5000,
  });

  const closeSessionMut = useMutation({
    mutationFn: () => restaurantCloseTableSession(rid, selectedTableId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant-live-tables", rid] });
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

  // ================== MENÜ (Walk-in modal için) ==================
  const {
    data: categoriesData,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: ["restaurant-menu-categories", rid],
    queryFn: () => restaurantListCategories(rid),
    enabled: !!rid && isOrderModalOpen,
  });

  const {
    data: menuItemsData,
    isLoading: menuLoading,
    error: menuError,
  } = useQuery({
    queryKey: ["restaurant-menu-items", rid],
    queryFn: () => restaurantListItems(rid),
    enabled: !!rid && isOrderModalOpen,
  });

  const categories: MenuCategory[] = Array.isArray(categoriesData)
    ? (categoriesData as MenuCategory[])
    : [];

  const menuItems: MenuItem[] = Array.isArray(menuItemsData)
    ? (menuItemsData as MenuItem[])
    : [];

  // İlk açılışta aktif kategori
  React.useEffect(() => {
    if (!isOrderModalOpen) return;
    if (activeCategoryId !== "all") return;
    if (categories.length === 0) return;

    const firstActive =
      categories.find((c) => c.isActive !== false) ?? categories[0];
    if (firstActive?._id) {
      setActiveCategoryId(firstActive._id);
    }
  }, [isOrderModalOpen, categories, activeCategoryId]);

  React.useEffect(() => {
    // Modal kapandığında taslağı temizle
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
      if (!rid || !selectedTableId) {
        throw new Error("Masa veya restoran bilgisi eksik.");
      }
      const items = Object.values(draftItems).filter((it) => it.qty > 0);
      if (items.length === 0) {
        throw new Error("En az bir ürün seçmelisiniz.");
      }

      return restaurantCreateWalkInOrder(rid, selectedTableId, {
        guestName: guestName.trim() || undefined,
        items,
      });
    },
    onSuccess: () => {
      if (selectedTableId) {
        selfWalkInRef.current[selectedTableId] = Date.now();
      }

      showToast("Yeni sipariş eklendi.", "success");
      setIsOrderModalOpen(false);
      setDraftItems({});
      setGuestName("");
      qc.invalidateQueries({ queryKey: ["restaurant-live-tables", rid] });
      refetchDetail();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Walk-in sipariş oluşturulamadı.";
      showToast(msg, "error");
    },
  });

  // Yazdırma helper’ları (webpanelden uyarlama)
  function handlePrintLastOrder(td: any) {
    if (!td || !Array.isArray(td.orders) || td.orders.length === 0) return;

    const restaurantName =
      td?.table?.restaurantName ||
      td?.table?.restaurant?.name ||
      td?.table?.name ||
      "Restoran";

    const last = td.orders[td.orders.length - 1];
    const dateStr = new Date(last.createdAt).toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const itemsHtml =
      Array.isArray(last.items) && last.items.length > 0
        ? last.items
            .map(
              (it: any) =>
                `<div class="row"><span>${it.qty}× ${it.title}</span><span>${(
                  Number(it.price || 0) * Number(it.qty || 1)
                ).toFixed(2)}₺</span></div>`
            )
            .join("")
        : `<div class="small">Ürün yok.</div>`;

    const html = `
      <div class="center header-name">${restaurantName}</div>
      <div class="center header-sub">SON SİPARİŞ ÖZETİ</div>
      <div class="line"></div>
      <div class="row small"><span>Tarih</span><span>${dateStr}</span></div>
      <div class="row small"><span>Masa</span><span>${
        td.table?.name ?? "-"
      }</span></div>
      <div class="line"></div>
      <div class="row header-row"><span>Ürün</span><span>Tutar</span></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="row total"><span>Toplam</span><span>${Number(
        last.total || 0
      ).toFixed(2)}₺</span></div>
      <div class="line"></div>
      <div class="center tiny">Bu fiş Rezzy masa yönetim sistemi ile oluşturulmuştur.</div>
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
              const timeStr = new Date(o.createdAt).toLocaleTimeString(
                "tr-TR",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                }
              );

              const itemsHtml =
                Array.isArray(o.items) && o.items.length > 0
                  ? o.items
                      .map(
                        (it: any) =>
                          `<div class="row small"><span>${it.qty}× ${
                            it.title
                          }</span><span>${(
                            Number(it.price || 0) * Number(it.qty || 1)
                          ).toFixed(2)}₺</span></div>`
                      )
                      .join("")
                  : `<div class="small">Ürün yok.</div>`;

              return `
                <div class="small">
                  <div class="line"></div>
                  <div class="row"><span>Sipariş ${
                    index + 1
                  }</span><span>${timeStr}</span></div>
                  ${itemsHtml}
                  <div class="row total"><span>Ara Toplam</span><span>${Number(
                    o.total || 0
                  ).toFixed(2)}₺</span></div>
                </div>
              `;
            })
            .join("");

    const card = Number(td.totals?.cardTotal || 0);
    const payAtVenue = Number(td.totals?.payAtVenueTotal || 0);
    const grand = Number(td.totals?.grandTotal || 0);

    const footer = `
      <div class="line"></div>
      <div class="row small"><span>Kart</span><span>${card.toFixed(
        2
      )}₺</span></div>
      <div class="row small"><span>Nakit / Mekanda</span><span>${payAtVenue.toFixed(
        2
      )}₺</span></div>
      <div class="row total"><span>Genel Toplam</span><span>${grand.toFixed(
        2
      )}₺</span></div>
      <div class="line"></div>
    `;

    const html = `
      <div class="center header-name">${restaurantName}</div>
      <div class="center header-sub">HESAP DÖKÜMÜ</div>
      <div class="line"></div>
      <div class="row small"><span>Tarih</span><span>${nowStr}</span></div>
      <div class="row small"><span>Masa</span><span>${
        td.table?.name ?? "-"
      }</span></div>
      ${ordersHtml}
      ${footer}
      <div class="center tiny">Rezervasyon ve masa yönetimi Rezzy ile sağlanmaktadır.</div>
    `;

    printContent("Adisyon", html);
  }

  const selectedTable = selectedTableId
    ? tables.find((t) => t.id === selectedTableId)
    : undefined;

  const selectedTableName = selectedTable?.name ?? "";

  const selectedItemCount = Object.values(draftItems).reduce(
    (sum, it) => sum + it.qty,
    0
  );

  const selectedTotal = Object.values(draftItems).reduce(
    (sum, it) => sum + it.qty * it.price,
    0
  );

  return (
    <RestaurantDesktopLayout
      activeNav="tables"
      title="Canlı Masalar"
      subtitle="Lokal adisyonlar, Rezzy ve QR siparişleri tek ekranda."
      summaryChips={[
        {
          label: "Dolu masa",
          value: `${occupiedCount} adet`,
          tone: "success",
        },
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
      {/* Sol: masa grid, Sağ: detay panel */}
      <div className="flex gap-4 items-start">
        {/* SOL TARAF */}
        <div className="flex-1">
          {isLoading && (
            <div className="rezzy-empty">
              <div className="rezzy-empty__icon">⏳</div>
              <div className="rezzy-empty__title">Masalar getiriliyor…</div>
              <div className="rezzy-empty__text">
                Canlı masa durumları birkaç saniye içinde yüklenecek.
              </div>
            </div>
          )}

          {isError && !isLoading && (
            <div className="rezzy-empty">
              <div className="rezzy-empty__icon">⚠️</div>
              <div className="rezzy-empty__title">Masalar yüklenemedi</div>
              <div className="rezzy-empty__text">
                Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse
                bağlantınızı kontrol edin.
              </div>
            </div>
          )}

          {!isLoading && !isError && !hasData && (
            <div className="rezzy-empty">
              <div className="rezzy-empty__icon">🪑</div>
              <div className="rezzy-empty__title">Tanımlı masa bulunamadı</div>
              <div className="rezzy-empty__text">
                Masa planı oluşturulduğunda, canlı masa durumu burada
                görünecek.
              </div>
            </div>
          )}

          {!isLoading && !isError && hasData && (
            <div className="rezzy-tables-grid">
              {mapped.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTableId(t.id)}
                  className="cursor-pointer"
                >
                  <TableCard
                    name={t.name}
                    location={t.location}
                    status={t.status}
                    total={t.total}
                    sinceMinutes={t.sinceMinutes}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SAĞ DETAY PANELİ */}
        {selectedTableId && (
          <div className="w-[340px] max-w-xs flex-shrink-0 bg-white rounded-2xl shadow-soft border border-gray-100 p-3 sticky top-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                Masa Detayı
                {selectedTable && (
                  <>
                    {" "}
                    — {selectedTable.name} ({selectedTable.capacity || 2}{" "}
                    kişilik)
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTableId(null)}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Kapat
              </button>
            </div>

            {detailLoading && (
              <div className="text-xs text-gray-500">Detay yükleniyor…</div>
            )}
            {detailError && (
              <div className="text-xs text-red-600">
                Masa detayı getirilemedi.
              </div>
            )}

            {tableDetail && (
              <div className="space-y-3 text-xs max-h-[420px] overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2 mb-1">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1">
                    Durum:
                    <span className="ml-1 font-medium">
                      {statusLabel(tableDetail.table.status)}
                    </span>
                  </span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1">
                    Kat: {tableDetail.table.floor ?? 1}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1">
                    Adisyon: {tableDetail.session ? "Açık" : "Yok"}
                  </span>
                </div>

                {tableDetail.totals && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span>Kart</span>
                      <span className="font-semibold">
                        {tableDetail.totals.cardTotal.toFixed(2)}₺
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Nakit / Mekanda</span>
                      <span className="font-semibold">
                        {tableDetail.totals.payAtVenueTotal.toFixed(2)}₺
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-semibold">Toplam</span>
                      <span className="font-semibold">
                        {tableDetail.totals.grandTotal.toFixed(2)}₺
                      </span>
                    </div>
                  </div>
                )}

                {/* Siparişler */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-gray-700">
                    Siparişler
                  </div>
                  {tableDetail.orders.length === 0 && (
                    <div className="text-[11px] text-gray-500">
                      Henüz sipariş yok.
                    </div>
                  )}
                  {tableDetail.orders.map((o: any) => (
                    <div
                      key={o._id}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {formatTime(o.createdAt)}
                        </span>
                        <span className="font-semibold">
                          {o.total.toFixed(2)}₺
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-600">
                        {o.items
                          .map(
                            (it: any) =>
                              `${it.qty}× ${it.title} (${it.price}₺)`
                          )
                          .join(", ")}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Servis istekleri */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-gray-700">
                    Garson / Hesap İstekleri
                  </div>
                  {tableDetail.serviceRequests.length === 0 && (
                    <div className="text-[11px] text-gray-500">
                      Açık servis isteği yok.
                    </div>
                  )}
                  {tableDetail.serviceRequests.map((r: any) => (
                    <div
                      key={r._id}
                      className="flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-1.5"
                    >
                      <div>
                        <div className="font-medium">
                          {r.type === "waiter"
                            ? "Garson çağrısı"
                            : "Hesap istendi"}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          {formatTime(r.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aksiyon butonları */}
            <div className="flex flex-col items-stretch gap-2 mt-3">
              {/* ✅ WALK-IN: Yeni Sipariş */}
              <button
                type="button"
                disabled={!selectedTableId}
                onClick={() => {
                  if (!selectedTableId) return;
                  setIsOrderModalOpen(true);
                }}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
              >
                Yeni Sipariş Ekle
                {selectedTableName ? ` — ${selectedTableName}` : ""}
              </button>

              <button
                type="button"
                disabled={
                  resolveServiceMut.isPending ||
                  !tableDetail ||
                  tableDetail.serviceRequests.length === 0
                }
                onClick={() => resolveServiceMut.mutate()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {resolveServiceMut.isPending
                  ? "İşleniyor…"
                  : "Çağrı / Hesap Çözüldü"}
              </button>

              <button
                type="button"
                disabled={
                  closeSessionMut.isPending ||
                  !tableDetail ||
                  !tableDetail.session
                }
                onClick={() => closeSessionMut.mutate()}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {closeSessionMut.isPending
                  ? "Adisyon Kapatılıyor…"
                  : "Adisyonu Kapat"}
              </button>

              <button
                type="button"
                className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={
                  !tableDetail ||
                  !tableDetail.orders ||
                  tableDetail.orders.length === 0
                }
                onClick={() => tableDetail && handlePrintLastOrder(tableDetail)}
              >
                Son Siparişi Yazdır
              </button>

              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!tableDetail}
                onClick={() => tableDetail && handlePrintFullBill(tableDetail)}
              >
                Hesap Yazdır
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ✅ WALK-IN MODAL (kategori → ürün, dokunmatik uyumlu) */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold">
                  Yeni Sipariş — {selectedTableName || "Seçili masa"}
                </h4>
                <p className="text-[11px] text-gray-500">
                  Dokunmatik ekran için uygun; ürünlere dokunarak adet
                  artırabilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(false)}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Kapat
              </button>
            </div>

            {/* Üst: müşteri / not */}
            <div className="space-y-2 mb-3">
              <label className="block text-[11px] font-medium text-gray-700">
                Müşteri / Not
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/70"
                placeholder="İsteğe bağlı; örn. 4 kişi, rezervasyonsuz masa"
              />
            </div>

            {/* Kategoriler */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-gray-700">
                  Kategoriler
                </span>
                {categoriesLoading && (
                  <span className="text-[10px] text-gray-400">
                    Yükleniyor…
                  </span>
                )}
                {categoriesError && (
                  <span className="text-[10px] text-red-500">
                    Kategoriler alınamadı.
                  </span>
                )}
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveCategoryId("all")}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] border ${
                    activeCategoryId === "all"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  Tümü
                </button>
                {categories.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => setActiveCategoryId(c._id)}
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] border ${
                      activeCategoryId === c._id
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Ürün listesi */}
            <div className="border border-gray-100 rounded-2xl max-h-72 overflow-y-auto mb-4 bg-gray-50/60">
              {menuLoading && (
                <div className="p-4 text-xs text-gray-500">
                  Menü yükleniyor…
                </div>
              )}
              {menuError && (
                <div className="p-4 text-xs text-red-600">
                  Menü listesi getirilemedi.
                </div>
              )}
              {!menuLoading &&
                !menuError &&
                visibleItems.length === 0 && (
                  <div className="p-4 text-xs text-gray-500">
                    Bu kategoride ürün yok.
                  </div>
                )}
              {!menuLoading && !menuError && visibleItems.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {visibleItems.map((mi) => {
                    const current = draftItems[mi._id]?.qty ?? 0;
                    return (
                      <button
                        key={mi._id}
                        type="button"
                        onClick={() => handleChangeQty(mi, 1)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-white/70 hover:bg-purple-50/80 text-left"
                      >
                        <div className="flex-1 mr-3">
                          <div className="text-xs font-medium text-gray-900">
                            {mi.title}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {mi.price.toFixed(2)}₺
                            {mi.isAvailable === false && (
                              <span className="ml-1 text-[10px] text-red-500">
                                (Mevcut değil)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeQty(mi, -1);
                            }}
                            className="h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center text-xs text-gray-700 bg-white hover:bg-gray-100"
                          >
                            −
                          </button>
                          <span className="min-w-[1.5rem] text-center text-xs font-semibold">
                            {current}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeQty(mi, 1);
                            }}
                            className="h-8 w-8 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center hover:bg-purple-700"
                          >
                            +
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Alt bar: özet + aksiyonlar */}
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-600">
                Seçili ürün:{" "}
                <span className="font-semibold">{selectedItemCount}</span> adet •{" "}
                Toplam{" "}
                <span className="font-semibold">
                  {selectedTotal.toFixed(2)}₺
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={createWalkInMut.isPending}
                  onClick={() => createWalkInMut.mutate()}
                  className="rounded-full bg-purple-600 px-5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
                >
                  {createWalkInMut.isPending
                    ? "Kaydediliyor…"
                    : "Siparişi Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};