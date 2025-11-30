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
  const statusLabel =
    status === "IDLE"
      ? "Boş"
      : status === "OPEN"
      ? "Açık"
      : status === "PAYING"
      ? "Hesap İstiyor"
      : "Garson Çağırıyor";

  const statusDotClass =
    status === "IDLE"
      ? ""
      : status === "OPEN"
      ? ""
      : status === "PAYING"
      ? " rezzy-table-card__status-dot--warning"
      : " rezzy-table-card__status-dot--danger";

    const channelLabel =
    channel === "WALK_IN"
      ? "Lokal"
      : channel === "REZZY"
      ? "Rezzy"
      : channel === "QR"
      ? "QR Menü"
      : "";

  const isIdle = status === "IDLE";

  const channelClass =
    channel === "REZZY"
      ? " rezzy-table-card--rezzy"
      : channel === "QR"
      ? " rezzy-table-card--qr"
      : "";

  return (
    <article
      className={
        "rezzy-table-card" +
        (isIdle ? " rezzy-table-card--idle" : "") +
        channelClass
      }
      onClick={onClick}
    >
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
          {guestCount ? `${guestCount} kişi` : "—"} ·{" "}
          {sinceMinutes ? `+${sinceMinutes} dk` : "Beklemede"}
        </div>
      </div>

      <div className="rezzy-table-card__footer">
        <div className="rezzy-table-card__total">
          {total != null ? `${total.toLocaleString("tr-TR")}₺` : "—"}
        </div>
       {channel && (
  <div className="rezzy-table-card__channel">
    {channel === "REZZY" ? "⭐ Rezzy Rezervasyon" : channelLabel}
  </div>
)}
      </div>
    </article>
  );
};