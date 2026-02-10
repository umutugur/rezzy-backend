// src/desktop/components/KitchenTicket.tsx
import React from "react";
import { t as i18nT } from "../../i18n";

export type KitchenTicketStatus = "NEW" | "IN_PROGRESS" | "READY" | "SERVED";

export type KitchenTicketItem = {
  name: string;
  quantity: number;
};

export type KitchenTicketProps = {
  id: string;
  tableLabel: string;
  source: "WALK_IN" | "QR" | "REZVIX";
  minutesAgo: number;
  items: KitchenTicketItem[];
  note?: string;

  status: KitchenTicketStatus;
  onStart?: (id: string) => void;
  onReady?: (id: string) => void;
  onServe?: (id: string) => void;
};

function getSourceLabel(source: "WALK_IN" | "QR" | "REZVIX") {
  if (source === "WALK_IN") return i18nT("Lokal");
  if (source === "QR") return i18nT("QR Menü");
  return i18nT("Rezvix");
}

function getFooterTexts(status: KitchenTicketStatus): {
  primary: string;
  secondary?: string;
} {
  switch (status) {
    case "NEW":
      return { primary: i18nT("Yeni sipariş"), secondary: i18nT("Hazırlamaya alınabilir") };
    case "IN_PROGRESS":
      return { primary: i18nT("Hazırlanıyor"), secondary: i18nT("Servise hazır olacak") };
    case "READY":
      return { primary: i18nT("Servise hazır"), secondary: i18nT("Teslim edilmeyi bekliyor") };
    case "SERVED":
      return { primary: i18nT("Teslim edildi"), secondary: i18nT("Tamamlandı") };
    default:
      return { primary: "" };
  }
}

export const KitchenTicket: React.FC<KitchenTicketProps> = ({
  id,
  tableLabel,
  source,
  minutesAgo,
  items,
  note,
  status,
  onStart,
  onReady,
  onServe,
}) => {
  const footer = getFooterTexts(status);

  return (
    <article
      className={`rezvix-kitchen-ticket status-${status.toLowerCase()}`}
    >
      <header className="rezvix-kitchen-ticket__header">
        <div className="rezvix-kitchen-ticket__title">{tableLabel}</div>
        <div className="rezvix-kitchen-ticket__meta">
          {getSourceLabel(source)} · {i18nT("+{count} dk", { count: minutesAgo })}
        </div>
      </header>

      <ul className="rezvix-kitchen-ticket__items">
        {items.map((item, idx) => (
          <li key={idx} className="rezvix-kitchen-ticket__item">
            <span>{item.name}</span>
            <span className="qty">×{item.quantity}</span>
          </li>
        ))}
      </ul>

      {note && <div className="rezvix-kitchen-ticket__note">{note}</div>}

      <footer className="rezvix-kitchen-ticket__footer">
        <div className="info">
          <div className="title">{footer.primary}</div>
          {footer.secondary && <div className="sub">{footer.secondary}</div>}
        </div>

        <div className="actions">
          {status === "NEW" && (
            <button className="kbtn primary" onClick={() => onStart?.(id)}>
              {i18nT("Hazırlamaya al")}
            </button>
          )}

          {status === "IN_PROGRESS" && (
            <button className="kbtn warning" onClick={() => onReady?.(id)}>
              {i18nT("Hazır")}
            </button>
          )}

          {status === "READY" && (
            <button className="kbtn success" onClick={() => onServe?.(id)}>
              {i18nT("Teslim edildi")}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};
