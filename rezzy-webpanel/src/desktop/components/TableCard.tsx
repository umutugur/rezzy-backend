import React from "react";

export type TableChannel = "WALK_IN" | "REZZY" | "QR";
export type TableStatus = "IDLE" | "OPEN" | "PAYING" | "NEED_HELP";

export type TableCardProps = {
  name: string;
  location: string;
  status: TableStatus;
  channel?: TableChannel;
  total?: number;
  guestCount?: number;
  sinceMinutes?: number;
  onClick?: () => void;
};

function getStatusLabel(status: TableStatus): string {
  switch (status) {
    case "IDLE":
      return "Boş";
    case "OPEN":
      return "Dolu / Sipariş Var";
    case "PAYING":
      return "Hesap İstiyor";
    case "NEED_HELP":
      return "Garson Çağırıyor";
    default:
      return status;
  }
}

function getStatusDotClass(status: TableStatus): string {
  if (status === "PAYING") return " rezzy-table-card__status-dot--warning";
  if (status === "NEED_HELP") return " rezzy-table-card__status-dot--danger";
  return "";
}

/** Kartın arka plan / border rengini statüye göre belirleyen class */
function getStatusClass(status: TableStatus): string {
  switch (status) {
    case "IDLE":
      return " rezzy-table-card--idle";
    case "OPEN":
      return " rezzy-table-card--open";
    case "PAYING":
      return " rezzy-table-card--paying";
    case "NEED_HELP":
      return " rezzy-table-card--need-help";
    default:
      return "";
  }
}

function getChannelLabel(channel?: TableChannel): string {
  if (channel === "WALK_IN") return "Lokal";
  if (channel === "REZZY") return "Rezzy";
  if (channel === "QR") return "QR Menü";
  return "";
}

function getChannelClass(channel?: TableChannel): string {
  if (channel === "REZZY") return " rezzy-table-card--rezzy";
  if (channel === "QR") return " rezzy-table-card--qr";
  return "";
}

export const TableCard: React.FC<TableCardProps> = ({
  name,
  location,
  status,
  channel,
  total,
  guestCount,
  sinceMinutes,
  onClick,
}) => {
  const statusLabel = getStatusLabel(status);
  const statusDotClass = getStatusDotClass(status);
  const channelLabel = getChannelLabel(channel);
  const statusClass = getStatusClass(status);
  const channelClass = getChannelClass(channel);

  const rootClass =
    "rezzy-table-card" + statusClass + channelClass;

  const guestText =
    typeof guestCount === "number" && guestCount > 0
      ? `${guestCount} kişi`
      : "—";

  const sinceText =
    typeof sinceMinutes === "number"
      ? sinceMinutes === 0
        ? "Şimdi"
        : `+${sinceMinutes} dk`
      : "Beklemede";

  return (
    <article className={rootClass} onClick={onClick}>
      <div className="rezzy-table-card__header">
        <div className="rezzy-table-card__title">{name}</div>
        <div className="rezzy-table-card__pill">{location}</div>
      </div>

      <div className="rezzy-table-card__meta">
        <div className="rezzy-table-card__status">
          <span
            className={"rezzy-table-card__status-dot" + statusDotClass}
          />
          <span>{statusLabel}</span>
        </div>
        <div>
          {guestText} · {sinceText}
        </div>
      </div>

      <div className="rezzy-table-card__footer">
        <div className="rezzy-table-card__total">
          {total != null ? `${total.toLocaleString("tr-TR")}₺` : "—"}
        </div>

        {channel && (
          <div className="rezzy-table-card__channel">
            {channel === "REZZY"
              ? "⭐ Rezzy Rezervasyon"
              : channelLabel}
          </div>
        )}
      </div>
    </article>
  );
};