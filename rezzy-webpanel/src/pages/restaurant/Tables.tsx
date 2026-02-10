import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { authStore } from "../../store/auth";
import {
  api,
  restaurantGetLiveTables,
  restaurantGetTableDetail,
  restaurantCloseTableSession,
  restaurantResolveTableService,
  restaurantUpdateTablesLayout,
  type LiveTable,
} from "../../api/client";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { t as i18nT, useI18n } from "../../i18n";

const notifySound = new Audio("/sounds/notify.mp3");

type TableItem = { _id?: string; name: string; capacity: number; isActive?: boolean };

async function fetchTables(rid: string): Promise<TableItem[]> {
  const { data } = await api.get(`/restaurants/${rid}`);
  return data?.tables || [];
}

async function updateTables(rid: string, tables: TableItem[]) {
  const { data } = await api.put(`/restaurants/${rid}/tables`, { tables });
  return data;
}

function statusLabel(status: LiveTable["status"]): string {
  switch (status) {
    case "empty":
      return i18nT("Boş");
    case "occupied":
      return i18nT("Dolu");
    case "order_active":
      return i18nT("Sipariş Var");
    case "waiter_call":
      return i18nT("Garson Çağrısı");
    case "bill_request":
      return i18nT("Hesap İstendi");
    case "order_ready":
      return i18nT("Sipariş Hazır");
    default:
      return status;
  }
}

function statusColor(status: LiveTable["status"]): string {
  switch (status) {
    case "empty":
      return "bg-gray-200 border-gray-300";
    case "occupied":
      return "bg-amber-200 border-amber-400";
    case "order_active":
      return "bg-green-200 border-green-500";
    case "waiter_call":
      return "bg-blue-200 border-blue-500";
    case "bill_request":
      return "bg-red-200 border-red-500";
    case "order_ready":
      return "bg-yellow-200 border-yellow-500";
    default:
      return "bg-gray-200 border-gray-300";
  }
}

function statusIcon(status: LiveTable["status"]): JSX.Element {
  switch (status) {
    case "empty":
      return <span className="text-gray-400 text-xl">○</span>;
    case "occupied":
      return <span className="text-amber-400 text-xl">●</span>;
    case "order_active":
      return <span className="text-green-500 text-xl">🧾</span>;
    case "waiter_call":
      return <span className="text-blue-500 text-xl">🛎️</span>;
    case "bill_request":
      return <span className="text-red-500 text-xl">💳</span>;
    case "order_ready":
      return <span className="text-yellow-600 text-xl">🟡</span>;
    default:
      return <span className="text-gray-400 text-xl">○</span>;
  }
}

function formatTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function getFloors(tables: LiveTable[]): number[] {
  const set = new Set<number>();
  tables.forEach((t) => set.add(t.floor ?? 1));
  return Array.from(set).sort((a, b) => a - b);
}

function getTablePos(t: any) {
  // fallback to 0,0 if undefined
  return {
    x: typeof t.posX === "number" ? t.posX : 0,
    y: typeof t.posY === "number" ? t.posY : 0,
  };
}

function getTableStyle(status: LiveTable["status"], selected: boolean, alert: boolean) {
  let base =
    "relative flex flex-col items-center justify-center rounded-xl border-2 shadow-xl transition-all cursor-pointer select-none";
  let size = "w-40 h-44";
  let color = statusColor(status);
  let ring = selected
    ? "ring-4 ring-brand-500"
    : alert
    ? "ring-4 ring-rose-500 animate-pulse"
    : "";
  return [base, size, color, ring].join(" ");
}

// 80mm thermal printer content print helper
function printContent(title: string, html: string) {
  const printWindow = window.open("", "_blank", "width=400,height=800");

  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page {
            /* 80mm termal rulo */
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

function TableBox({
  table,
  selected,
  alert,
  onClick,
  isDragging,
  dragOverlay,
  ...props
}: {
  table: LiveTable;
  selected: boolean;
  alert: boolean;
  onClick?: () => void;
  isDragging?: boolean;
  dragOverlay?: boolean;
}) {
  let base =
    "relative flex flex-col items-center justify-between rounded-xl border-2 shadow-xl transition-all cursor-pointer select-none px-3 py-3";
  return (
    <div
      className={[
        getTableStyle(table.status, selected, alert),
        isDragging ? "opacity-60" : "",
        dragOverlay ? "z-50 scale-110 shadow-2xl" : "",
        // add new consistent padding
        base,
      ].join(" ")}
      style={{
        // For drag overlay
        pointerEvents: dragOverlay ? "none" : undefined,
      }}
      onClick={onClick}
      {...props}
    >
      <div className="flex flex-col items-center w-full h-full justify-between">
        <div className="flex flex-col items-center">
          <span className="text-3xl mb-1">🍽️</span>
          <span className="font-semibold text-base truncate max-w-[120px] text-center">
            {table.name || i18nT("İsimsiz")}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1 text-sm font-medium">
          <span title={i18nT("Kapasite")} className="text-gray-700">
            👥
          </span>
          <span>{table.capacity || 2}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {statusIcon(table.status)}
          <span className="text-xs font-medium">{statusLabel(table.status)}</span>
        </div>
        <div className="mt-1 text-xs font-semibold">
          ₺{table.totals?.grandTotal?.toFixed(2) ?? "0.00"}
        </div>
        {alert && (
          <div className="absolute top-2 right-2 bg-rose-600 text-white text-xs px-2 py-1 rounded-lg shadow font-bold animate-bounce">
            {i18nT("Yeni Sipariş!")}
          </div>
        )}
        {table.openServiceRequests > 0 && (
          <div className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-lg shadow font-bold">
            {i18nT("{count} çağrı", { count: table.openServiceRequests })}
          </div>
        )}
      </div>
    </div>
  );
}


function DraggableTableBox({
  table,
  selected,
  alert,
  onClick,
}: {
  table: LiveTable;
  selected: boolean;
  alert: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
  });

  const style: React.CSSProperties = {
    position: "absolute",
    left: table.posX ?? 40,
    top: table.posY ?? 40,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    zIndex: isDragging ? 100 : undefined,
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TableBox
        table={table}
        selected={selected}
        alert={alert}
        onClick={onClick}
        isDragging={isDragging}
      />
    </div>
  );
}

export default function TablesPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();
  const { t } = useI18n();

  // =======================
  // CANLI MASALAR
  // =======================
  const {
    data: liveData,
    isLoading: liveLoading,
    error: liveError,
  } = useQuery({
    queryKey: ["live-tables", rid],
    queryFn: () => restaurantGetLiveTables(rid),
    enabled: !!rid,
    refetchInterval: 2500,
  });

  const liveTables: LiveTable[] =
    (liveData?.tables || []).slice().sort((a, b) =>
      a.floor === b.floor
        ? a.name.localeCompare(b.name, "tr")
        : a.floor - b.floor
    );

  const prevLiveTablesRef = React.useRef<LiveTable[]>([]);
  const [alertTableIds, setAlertTableIds] = React.useState<string[]>([]);
  const [alertLabelTableIds, setAlertLabelTableIds] = React.useState<string[]>([]);
  const [selectedTableKey, setSelectedTableKey] = React.useState<string | null>(null);
  const [currentFloor, setCurrentFloor] = React.useState<number | null>(null);
  const [tablesLayout, setTablesLayout] = React.useState<Record<string, { posX: number; posY: number; floor: number }>>({});
  const [draggedTableId, setDraggedTableId] = React.useState<string | null>(null);

  // Table detail
  const {
    data: tableDetail,
    isLoading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ["table-detail", rid, selectedTableKey],
    queryFn: () => restaurantGetTableDetail(rid, selectedTableKey as string),
    enabled: !!rid && !!selectedTableKey,
  });

  const closeSessionMut = useMutation({
    mutationFn: () =>
      restaurantCloseTableSession(rid, selectedTableKey as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-tables", rid] });
      refetchDetail();
    },
  });

  const resolveServiceMut = useMutation({
    mutationFn: () =>
      restaurantResolveTableService(rid, selectedTableKey as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-tables", rid] });
      refetchDetail();
    },
  });

  const layoutMut = useMutation({
    mutationFn: (payload: Array<{ id: string; floor?: number; posX?: number; posY?: number }>) =>
      restaurantUpdateTablesLayout(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-tables", rid] }),
  });

  // 80mm yazıcı: Son sipariş ve tam adisyon yazdırma
  function handlePrintLastOrder(td: any) {
    if (!td || !Array.isArray(td.orders) || td.orders.length === 0) return;

    const restaurantName =
      td?.table?.restaurantName ||
      td?.table?.restaurant?.name ||
      td?.table?.name ||
      i18nT("Restoran");

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
                `<div class="row"><span>${it.qty}× ${it.title}</span><span>${(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}₺</span></div>`
            )
            .join("")
        : `<div class="small">${i18nT("Ürün yok.")}</div>`;

    const html = `
      <div class="center header-name">${restaurantName}</div>
      <div class="center header-sub">${i18nT("SON SİPARİŞ ÖZETİ")}</div>
      <div class="line"></div>
      <div class="row small"><span>${i18nT("Tarih")}</span><span>${dateStr}</span></div>
      <div class="row small"><span>${i18nT("Masa")}</span><span>${td.table?.name ?? "-"}</span></div>
      <div class="line"></div>
      <div class="row header-row"><span>${i18nT("Ürün")}</span><span>${i18nT("Tutar")}</span></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="row total"><span>${i18nT("Toplam")}</span><span>${Number(last.total || 0).toFixed(2)}₺</span></div>
      <div class="line"></div>
      <div class="center tiny">${i18nT("Bu fiş Rezvix masa yönetim sistemi ile oluşturulmuştur.")}</div>
    `;

    printContent(i18nT("Son Sipariş"), html);
  }

  function handlePrintFullBill(td: any) {
    if (!td) return;

    const restaurantName =
      td?.table?.restaurantName ||
      td?.table?.restaurant?.name ||
      td?.table?.name ||
      i18nT("Restoran");

    const nowStr = new Date().toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const orders = Array.isArray(td.orders) ? td.orders : [];

    const ordersHtml =
      orders.length === 0
        ? `<div class="small">${i18nT("Henüz sipariş yok.")}</div>`
        : orders
            .map((o: any, index: number) => {
              const timeStr = new Date(o.createdAt).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              });

              const itemsHtml =
                Array.isArray(o.items) && o.items.length > 0
                  ? o.items
                      .map(
                        (it: any) =>
                          `<div class="row small"><span>${it.qty}× ${it.title}</span><span>${(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}₺</span></div>`
                      )
                      .join("")
                  : `<div class="small">${i18nT("Ürün yok.")}</div>`;

              return `
                <div class="small">
                  <div class="line"></div>
                  <div class="row"><span>${i18nT("Sipariş {index}", { index: index + 1 })}</span><span>${timeStr}</span></div>
                  ${itemsHtml}
                  <div class="row total"><span>${i18nT("Ara Toplam")}</span><span>${Number(o.total || 0).toFixed(2)}₺</span></div>
                </div>
              `;
            })
            .join("");

    const card = Number(td.totals?.cardTotal || 0);
    const payAtVenue = Number(td.totals?.payAtVenueTotal || 0);
    const grand = Number(td.totals?.grandTotal || 0);

    const footer = `
      <div class="line"></div>
      <div class="row small"><span>${i18nT("Kart")}</span><span>${card.toFixed(2)}₺</span></div>
      <div class="row small"><span>${i18nT("Nakit / Mekanda")}</span><span>${payAtVenue.toFixed(2)}₺</span></div>
      <div class="row total"><span>${i18nT("Genel Toplam")}</span><span>${grand.toFixed(2)}₺</span></div>
      <div class="line"></div>
    `;

    const html = `
      <div class="center header-name">${restaurantName}</div>
      <div class="center header-sub">${i18nT("HESAP DÖKÜMÜ")}</div>
      <div class="line"></div>
      <div class="row small"><span>${i18nT("Tarih")}</span><span>${nowStr}</span></div>
      <div class="row small"><span>${i18nT("Masa")}</span><span>${td.table?.name ?? "-"}</span></div>
      ${ordersHtml}
      ${footer}
      <div class="center tiny">${i18nT("Rezervasyon ve masa yönetimi Rezvix ile sağlanmaktadır.")}</div>
    `;

    printContent(i18nT("Adisyon"), html);
  }

  // =======================
  // ESKİ MASA CRUD
  // =======================
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tables", rid],
    queryFn: () => fetchTables(rid),
    enabled: !!rid,
  });

  const [rows, setRows] = React.useState<TableItem[]>([]);
  React.useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: (payload: TableItem[]) => updateTables(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables", rid] }),
  });

  const addRow = () =>
    setRows((prev) => [...prev, { name: "", capacity: 2, isActive: true }]);
  const delRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  // =======================
  // MASA LAYOUT STATE
  // =======================
  // Sync layout state with backend positions
  React.useEffect(() => {
    if (!liveTables.length) return;
    setTablesLayout(prev => {
      const next = { ...prev };
      let changed = false;
      liveTables.forEach(t => {
        const id = String(t.id);
        if (!next[id]) {
          next[id] = {
            posX: typeof t.posX === "number" ? t.posX : 40 + Math.floor(Math.random() * 300),
            posY: typeof t.posY === "number" ? t.posY : 40 + Math.floor(Math.random() * 200),
            floor: t.floor ?? 1,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (currentFloor === null && liveTables.length > 0) {
      setCurrentFloor(liveTables[0].floor ?? 1);
    }
  }, [liveTables]);

  // =======================
  // DURUM DEĞİŞİKLİĞİ BİLDİRİMİ VE YENİ SİPARİŞ ALARMI
  // =======================
  React.useEffect(() => {
    const prev = prevLiveTablesRef.current;
    const curr = liveTables;

    const newlyAlerted: string[] = [];
    const newOrderActive: string[] = [];

    curr.forEach((t) => {
      const old = prev.find((p) => p.id === t.id);
      if (!old) return;

      const statusChanged = old.status !== t.status;
      const serviceIncreased =
        (t.openServiceRequests || 0) > (old.openServiceRequests || 0);
      const amountIncreased =
        (t.totals?.grandTotal ?? 0) > (old.totals?.grandTotal ?? 0);

      // Herhangi bir önemli değişiklikte ses + highlight
      if (statusChanged || serviceIncreased || amountIncreased) {
        if (
          t.status === "order_active" ||
          t.status === "waiter_call" ||
          t.status === "bill_request" ||
          serviceIncreased ||
          amountIncreased
        ) {
          newlyAlerted.push(String(t.id));
        }
      }

      // Özellikle yeni sipariş için (toplam tutar artmışsa)
      if (t.status === "order_active" && amountIncreased) {
        newOrderActive.push(String(t.id));
      }
    });

    if (newlyAlerted.length > 0) {
      try {
        notifySound.currentTime = 0;
        void notifySound.play();
      } catch {
        // sessizce geç
      }

      setAlertTableIds((prevIds) => {
        const set = new Set(prevIds);
        newlyAlerted.forEach((id) => set.add(id));
        return Array.from(set);
      });

      window.setTimeout(() => {
        setAlertTableIds((prevIds) =>
          prevIds.filter((id) => !newlyAlerted.includes(id))
        );
      }, 15000);
    }

    if (newOrderActive.length > 0) {
      setAlertLabelTableIds((prev) => {
        const set = new Set(prev);
        newOrderActive.forEach((id) => set.add(id));
        return Array.from(set);
      });

      window.setTimeout(() => {
        setAlertLabelTableIds((prev) =>
          prev.filter((id) => !newOrderActive.includes(id))
        );
      }, 15000);
    }

    prevLiveTablesRef.current = curr;
  }, [liveTables]);

  // =======================
  // DND-KIT SENSORS
  // =======================
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  // =======================
  // DND-KIT HANDLERS
  // =======================
  function handleDragStart(event: any) {
    setDraggedTableId(event.active.id);
  }
  function handleDragEnd(event: any) {
    setDraggedTableId(null);
    const { active, delta } = event;
    if (!active || !delta) return;
    const id = active.id;
    const t = liveTables.find((x) => String(x.id) === String(id));
    if (!t) return;
    // Update position in local state
    setTablesLayout((prev) => {
      const old = prev[id];
      // Clamp to canvas area
      const newX = Math.max(0, Math.min((old?.posX ?? 0) + delta.x, 680));
      const newY = Math.max(0, Math.min((old?.posY ?? 0) + delta.y, 420));
      return {
        ...prev,
        [id]: { ...old, posX: newX, posY: newY },
      };
    });
  }
  function handleDragCancel() {
    setDraggedTableId(null);
  }

  // =======================
  // LAYOUT KAYDETME
  // =======================
  function handleLayoutSave() {
    const payload = Object.entries(tablesLayout).map(([id, l]) => ({
      id,
      floor: l.floor,
      posX: l.posX,
      posY: l.posY,
    }));
    layoutMut.mutate(payload);
  }

  if (!rid) {
    return (
      <div className="flex flex-col px-6 py-6 gap-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { window.location.href = "/restaurant"; }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            ← {t("Panele Dön")}
          </button>
        </div>
        <div className="text-sm text-red-600">{t("Restoran ID bulunamadı.")}</div>
      </div>
    );
  }

  const selected =
    selectedTableKey &&
    liveTables.find((t) => String(t.id) === String(selectedTableKey));

  // Katlar
  const floors = getFloors(liveTables);
  const floorTables = liveTables.filter((t) => (currentFloor === null ? true : (t.floor ?? 1) === currentFloor));

  // Table position helpers
  function getPos(t: LiveTable) {
    return tablesLayout[t.id] || { posX: 40, posY: 40, floor: t.floor ?? 1 };
  }

  return (
    <div className="flex flex-col px-6 py-6 gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => { window.location.href = "/restaurant"; }}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          ← {t("Panele Dön")}
        </button>
        <h1 className="text-base font-semibold text-gray-900">{t("Canlı Masalar")}</h1>
      </div>
      <div className="flex flex-col gap-6">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("Canlı Masalar")}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                {t("Boş")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {t("Dolu")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {t("Sipariş Var")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {t("Garson Çağrısı")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t("Hesap İstendi")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-gray-600 font-medium">{t("Kat:")}</span>
            {floors.map((f) => (
              <button
                key={f}
                className={[
                  "rounded-lg px-3 py-1 text-sm font-semibold border transition",
                  currentFloor === f
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100",
                ].join(" ")}
                onClick={() => setCurrentFloor(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative w-full flex">
            <div
              className="relative bg-slate-100 border border-slate-200 rounded-xl"
              style={{
                width: 900,
                height: 520,
                minWidth: 900,
                minHeight: 520,
                overflow: "hidden",
              }}
            >
              {liveLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  {t("Canlı veriler yükleniyor…")}
                </div>
              )}
              {!liveLoading && (
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  {floorTables.map((t) => {
                    const pos = getPos(t);
                    return (
                      <DraggableTableBox
                        key={t.id}
                        table={{ ...t, posX: pos.posX, posY: pos.posY }}
                        selected={selectedTableKey === String(t.id)}
                        alert={alertLabelTableIds.includes(String(t.id))}
                        onClick={() => setSelectedTableKey(String(t.id))}
                      />
                    );
                  })}
                </DndContext>
              )}
              {floorTables.length === 0 && !liveLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  {t("Bu katta masa yok.")}
                </div>
              )}
            </div>
            {/* Sağ detay panel */}
            {selectedTableKey && (
              <div className="ml-6 w-[320px] max-w-xs flex-shrink-0 sticky top-4 self-start">
                <Card>
                  <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto pr-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold">
                        {t("Masa Detayı")}
                        {selected && (
                          <> — {selected.name} ({t("{count} kişilik", { count: selected.capacity || 2 })})</>
                        )}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedTableKey(null)}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        {t("Kapat")}
                      </button>
                    </div>
                    {detailLoading && (
                      <div className="text-sm text-gray-500">{t("Detay yükleniyor…")}</div>
                    )}
                    {detailError && (
                      <div className="text-sm text-red-600">
                        {t("Masa detayı getirilemedi.")}
                      </div>
                    )}
                    {tableDetail && (
                      <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap gap-3">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs">
                            {t("Durum:")}{" "}
                            <span className="ml-1 font-medium">
                              {statusLabel(tableDetail.table.status)}
                            </span>
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs">
                            {t("Kat:")} {tableDetail.table.floor ?? 1}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs">
                            {t("Adisyon:")}{" "}
                            {tableDetail.session ? t("Açık") : t("Yok")}
                          </span>
                        </div>
                        {tableDetail.totals && (
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between text-xs">
                              <span>{t("Kart")}</span>
                              <span className="font-semibold">
                                {tableDetail.totals.cardTotal.toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs">
                              <span>{t("Nakit / Mekanda")}</span>
                              <span className="font-semibold">
                                {tableDetail.totals.payAtVenueTotal.toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs">
                              <span className="font-semibold">{t("Toplam")}</span>
                              <span className="font-semibold">
                                {tableDetail.totals.grandTotal.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* Siparişler */}
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-700">
                            {t("Siparişler")}
                          </div>
                          {tableDetail.orders.length === 0 && (
                            <div className="text-xs text-gray-500">
                              {t("Henüz sipariş yok.")}
                            </div>
                          )}
                          {tableDetail.orders.map((o) => (
                            <div
                              key={o._id}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {new Date(o.createdAt).toLocaleTimeString(
                                    "tr-TR",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }
                                  )}
                                </span>
                                <span className="font-semibold">
                                  {o.total.toFixed(2)}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-gray-600">
                                {o.items
                                  .map(
                                    (it: any) =>
                                      `${it.qty}× ${it.title} (${it.price})`
                                  )
                                  .join(", ")}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Servis istekleri */}
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-700">
                            {t("Garson / Hesap İstekleri")}
                          </div>
                          {tableDetail.serviceRequests.length === 0 && (
                            <div className="text-xs text-gray-500">
                              {t("Açık servis isteği yok.")}
                            </div>
                          )}
                          {tableDetail.serviceRequests.map((r) => (
                            <div
                              key={r._id}
                              className="flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-1.5 text-xs"
                            >
                              <div>
                                <div className="font-medium">
                                  {r.type === "waiter"
                                    ? t("Garson çağrısı")
                                    : r.type === "bill"
                                    ? t("Hesap istendi")
                                    : t("Sipariş hazır")}
                                </div>
                                <div className="text-[11px] text-gray-600">
                                  {new Date(r.createdAt).toLocaleTimeString(
                                    "tr-TR",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col items-end gap-2 mt-2">
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
                          ? t("İşleniyor…")
                          : t("Çağrı / Hesap Çözüldü")}
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
                          ? t("Adisyon Kapatılıyor…")
                          : t("Adisyonu Kapat")}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={!tableDetail || !tableDetail.orders || tableDetail.orders.length === 0}
                        onClick={() => {
                          if (tableDetail) {
                            handlePrintLastOrder(tableDetail);
                          }
                        }}
                      >
                        {t("Son Siparişi Yazdır")}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={!tableDetail}
                        onClick={() => {
                          if (tableDetail) {
                            handlePrintFullBill(tableDetail);
                          }
                        }}
                      >
                        {t("Hesap Yazdır")}
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={handleLayoutSave}
              disabled={layoutMut.isPending}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {layoutMut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
            </button>
            {layoutMut.isSuccess && (
              <span className="text-green-700 text-sm">{t("Kaydedildi.")}</span>
            )}
            {layoutMut.isError && (
              <span className="text-red-700 text-sm">{t("Hata oluştu.")}</span>
            )}
          </div>
        </section>
        {/* ================= MASA TANIMLARI (eski liste, collapsible) ================= */}
        <section className="space-y-3">
          <details className="rounded-md border border-gray-200 bg-white open:shadow-lg">
            <summary className="p-4 text-lg font-semibold cursor-pointer select-none">
              {t("Masa Tanımları (Liste Görünümü)")}
            </summary>
            <div className="p-4">
              {isLoading && <div>{t("Yükleniyor…")}</div>}
              {error && (
                <div className="text-red-600 text-sm">{t("Veri getirilemedi")}</div>
              )}
              <Card>
                <div className="space-y-3">
                  {rows.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center"
                    >
                      <input
                        className="border rounded-lg px-3 py-2"
                        placeholder={t("Masa adı")}
                        value={row.name}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                      />
                      <input
                        type="number"
                        min={1}
                        className="border rounded-lg px-3 py-2"
                        placeholder={t("Kapasite")}
                        value={row.capacity}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, capacity: Number(e.target.value) || 0 }
                                : x
                            )
                          )
                        }
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">{t("Aktif")}</span>
                        <input
                          type="checkbox"
                          checked={row.isActive ?? true}
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
                        className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm"
                        onClick={() => delRow(idx)}
                      >
                        {t("Sil")}
                      </button>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <div className="text-sm text-gray-500">{t("Kayıt yok")}</div>
                  )}
                  <button
                    className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm"
                    onClick={addRow}
                  >
                    {t("Yeni Masa")}
                  </button>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => mut.mutate(rows)}
                    disabled={mut.isPending}
                    className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-brand-300"
                  >
                    {mut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
                  </button>
                  {mut.isSuccess && (
                    <span className="ml-3 text-sm text-green-700">
                      {t("Güncellendi.")}
                    </span>
                  )}
                  {mut.isError && (
                    <span className="ml-3 text-sm text-red-700">
                      {t("Hata oluştu.")}
                    </span>
                  )}
                </div>
              </Card>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
