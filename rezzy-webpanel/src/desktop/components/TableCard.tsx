import React from "react";

export type TableChannel = "WALK_IN" | "REZVIX" | "QR";
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
  if (status === "PAYING") return " rezvix-table-card__status-dot--warning";
  if (status === "NEED_HELP") return " rezvix-table-card__status-dot--danger";
  return "";
}

/** Kartın arka plan / border rengini statüye göre belirleyen class */
function getStatusClass(status: TableStatus): string {
  switch (status) {
    case "IDLE":
      return " rezvix-table-card--idle";
    case "PAYING":
      return " rezvix-table-card--paying";
    case "NEED_HELP":
      return " rezvix-table-card--need-help";
    default:
      return "";
  }
}

function getChannelLabel(channel?: TableChannel): string {
  if (channel === "WALK_IN") return "Lokal";
  if (channel === "REZVIX") return "Rezvix";
  if (channel === "QR") return "QR Menü";
  return "";
}

function getChannelClass(channel?: TableChannel): string {
  if (channel === "REZVIX") return " rezvix-table-card--rezvix";
  if (channel === "QR") return " rezvix-table-card--qr";
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

  // PAYING / NEED_HELP acil durum: status rengi öncelikli
  // Diğer durumlarda (IDLE / OPEN) channel rengi öncelikli
  let rootClass = "rezvix-table-card";

  if (status === "PAYING" || status === "NEED_HELP") {
    rootClass += statusClass;          // turuncu / kırmızı arkaplan
  } else {
    if (status === "IDLE") {
      rootClass += statusClass;        // istersen hafif gri/nötr stil
    }
    rootClass += channelClass;         // QR / Rezvix / Lokal renkleri
  }

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

  const showAlertBadge = status === "NEED_HELP";

  return (
    <article className={rootClass} onClick={onClick}>
      <div
        className="rezvix-table-card__header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <div className="rezvix-table-card__title">{name}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="rezvix-table-card__pill">{location}</div>
          {showAlertBadge && (
            <div
              style={{
                backgroundColor: "#ff3b30",
                color: "#ffffff",
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
              }}
            >
              UYARI
            </div>
          )}
        </div>
      </div>

      <div className="rezvix-table-card__meta">
        <div className="rezvix-table-card__status">
          <span
            className={"rezvix-table-card__status-dot" + statusDotClass}
          />
          <span>{statusLabel}</span>
        </div>
        <div>
          {guestText} · {sinceText}
        </div>
      </div>

      <div className="rezvix-table-card__footer">
        <div className="rezvix-table-card__total">
          {total != null ? `${total.toLocaleString("tr-TR")}₺` : "—"}
        </div>

        {channel && (
          <div className="rezvix-table-card__channel">
            {channel === "REZVIX"
              ? "⭐ Rezvix Rezervasyon"
              : channelLabel}
          </div>
        )}
      </div>
    </article>
  );
};