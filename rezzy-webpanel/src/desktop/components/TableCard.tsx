import React from "react";

export type TableChannel = "WALK_IN" | "REZVIX" | "QR";
export type TableStatus = "IDLE" | "OPEN" | "ORDER_READY" | "PAYING" | "NEED_HELP";

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

/* Label */
function getStatusLabel(status: TableStatus): string {
  switch (status) {
    case "IDLE": return "Boş";
    case "OPEN": return "Dolu / Sipariş Var";
    case "ORDER_READY": return "Sipariş Hazır";
    case "PAYING": return "Hesap İstiyor";
    case "NEED_HELP": return "Garson Çağırıyor";
    default: return status;
  }
}

/* Küçük durum noktası */
function getStatusDotClass(status: TableStatus): string {
  if (status === "PAYING") return " rezvix-table-card__status-dot--warning";
  if (status === "NEED_HELP") return " rezvix-table-card__status-dot--danger";
  if (status === "ORDER_READY") return " rezvix-table-card__status-dot--ready";
  return "";
}

/* Kart arka plan theme */
function getStatusClass(status: TableStatus): string {
  switch (status) {
    case "IDLE": return " rezvix-table-card--idle";
    case "PAYING": return " rezvix-table-card--paying";
    case "NEED_HELP": return " rezvix-table-card--need-help";
    case "ORDER_READY": return " rezvix-table-card--order-ready";
    default: return "";
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
  name, location, status, channel, total, guestCount, sinceMinutes, onClick
}) => {
  const statusLabel = getStatusLabel(status);
  const statusDotClass = getStatusDotClass(status);
  const statusClass = getStatusClass(status);
  const channelClass = getChannelClass(channel);

  /* Öncelik sıralaması:
     NEED_HELP > PAYING > ORDER_READY > OPEN > IDLE 
  */
  let rootClass = "rezvix-table-card";

  if (status === "NEED_HELP" || status === "PAYING" || status === "ORDER_READY") {
    rootClass += statusClass;                    // acil durum renkleri
  } else {
    rootClass += channelClass;
    if (status === "IDLE") rootClass += statusClass;
  }

  const guestText = guestCount && guestCount > 0 ? `${guestCount} kişi` : "—";
  const sinceText = sinceMinutes!=null ? (sinceMinutes===0?"Şimdi":`+${sinceMinutes} dk`) : "Beklemede";

  return (
    <article className={rootClass} onClick={onClick}>
      <div className="rezvix-table-card__header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <div className="rezvix-table-card__title">{name}</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div className="rezvix-table-card__pill">{location}</div>

          {status==="NEED_HELP" && (
            <div style={{background:"#ff3b30",color:"#fff",borderRadius:999,padding:"2px 8px",fontSize:11,fontWeight:600,textTransform:"uppercase"}}>
              ACİL
            </div>
          )}
          {status==="ORDER_READY" && (
            <div style={{background:"#facc15",color:"#000",borderRadius:999,padding:"2px 8px",fontSize:11,fontWeight:700}}>
              HAZIR
            </div>
          )}
        </div>
      </div>

      <div className="rezvix-table-card__meta">
        <div className="rezvix-table-card__status">
          <span className={"rezvix-table-card__status-dot"+statusDotClass}/>
          <span>{statusLabel}</span>
        </div>
        <div>{guestText} · {sinceText}</div>
      </div>

      <div className="rezvix-table-card__footer">
        <div className="rezvix-table-card__total">
          {total!=null ? `${total.toLocaleString("tr-TR")}₺`:"—"}
        </div>
        {channel && (
          <div className="rezvix-table-card__channel">
            {channel==="REZVIX"?"⭐ Rezvix Rezervasyon":getChannelLabel(channel)}
          </div>
        )}
      </div>
    </article>
  );
};