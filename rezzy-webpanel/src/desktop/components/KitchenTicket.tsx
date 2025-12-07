// src/desktop/components/KitchenTicket.tsx
import React from "react";

export type KitchenTicketStatus = "NEW" | "IN_PROGRESS" | "READY" | "SERVED";

export type KitchenTicketItem = {
  name: string;
  quantity: number;
};

export type KitchenTicketProps = {
  id: string;
  status: KitchenTicketStatus;
  tableLabel: string;
  source: "WALK_IN" | "QR" | "REZVIX";
  minutesAgo: number;
  items: KitchenTicketItem[];
  note?: string;

  // mutfak kolon geçişleri için callback’ler
  onStart?: (id: string) => void;      // NEW → IN_PROGRESS
  onReady?: (id: string) => void;      // IN_PROGRESS → READY
  onServe?: (id: string) => void;      // READY → SERVED
};

function statusLabel(status: KitchenTicketStatus) {
  switch (status) {
    case "NEW":
      return "Yeni sipariş";
    case "IN_PROGRESS":
      return "Hazırlanıyor";
    case "READY":
      return "Servise hazır";
    case "SERVED":
      return "Teslim edildi";
    default:
      return "";
  }
}

function sourceLabel(source: "WALK_IN" | "QR" | "REZVIX") {
  if (source === "QR") return "Qr Menü";
  if (source === "REZVIX") return "Rezvix";
  return "Lokal";
}

export const KitchenTicket: React.FC<KitchenTicketProps> = (props) => {
  const {
    id,
    status,
    tableLabel,
    source,
    minutesAgo,
    items,
    note,
    onStart,
    onReady,
    onServe,
  } = props;

  let actionLabel: string | null = null;
  let actionHandler: (() => void) | null = null;

  if (status === "NEW" && onStart) {
    actionLabel = "Hazırlamaya al";
    actionHandler = () => onStart(id);
  } else if (status === "IN_PROGRESS" && onReady) {
    actionLabel = "Hazır";
    actionHandler = () => onReady(id);
  } else if (status === "READY" && onServe) {
    actionLabel = "Teslim edildi";
    actionHandler = () => onServe(id);
  }

  return (
    <div className="rezvix-ticket">
      {/* Üst kısım: masa + meta */}
      <div className="rezvix-ticket__header">
        <div className="rezvix-ticket__title">{tableLabel}</div>
        <div className="rezvix-ticket__meta">
          <span className="rezvix-ticket__meta-pill">
            {sourceLabel(source)}
          </span>
          <span className="rezvix-ticket__meta-time">
            {minutesAgo >= 0 ? `+${minutesAgo} dk` : ""}
          </span>
        </div>
      </div>

      {/* Ürün listesi */}
      <div className="rezvix-ticket__body">
        {items.map((it, idx) => (
          <div key={idx} className="rezvix-ticket__item">
            <span>{it.name}</span>
            <span className="rezvix-ticket__item-qty">×{it.quantity}</span>
          </div>
        ))}
        {note && (
          <div className="rezvix-ticket__note">
            <span>{note}</span>
          </div>
        )}
      </div>

      {/* Alt kısım: status + action button */}
      <div className="rezvix-ticket__footer">
        <div className="rezvix-ticket__status">{statusLabel(status)}</div>

        {actionLabel && actionHandler && (
          <button
            type="button"
            onClick={actionHandler}
            className="rezvix-ticket__action-btn"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};