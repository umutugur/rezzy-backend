// src/desktop/pages/RezvixOrdersPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { EmptyState } from "../components/EmptyState";
import { api, restaurantUpdateReservationStatus } from "../../api/client";
import { authStore } from "../../store/auth";
import { showToast } from "../../ui/Toast";
import { asId } from "../../lib/id"; // ✅ EKLENDİ

// ---- Türler (RestaurantReservationsPage ile aynı model) ----
type Row = {
  _id: string;
  dateTimeUTC: string;
  partySize: number;
  totalPrice?: number;
  depositAmount?: number;
  status:
    | "pending"
    | "confirmed"
    | "arrived"
    | "cancelled"
    | "no_show"
    | string;
  receiptUrl?: string;
  guestName?: string;
  displayName?: string;
  name?: string;
  user?: { name?: string; email?: string };
};

type Resp = { items: Row[]; total: number; page: number; limit: number };

// ---- Yardımcılar ----
const trStatus: Record<string, string> = {
  pending: "Bekleyen",
  confirmed: "Onaylı",
  arrived: "Geldi",
  no_show: "Gelmedi",
  cancelled: "İptal",
};

function fmtStatus(s: string) {
  return trStatus[s] ?? s;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function fetchRezvixOrders(rid: string): Promise<Resp> {
  const today = new Date();
  const params = {
    from: ymd(today),
    page: 1,
    limit: 50,
  };
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params,
  });
  return data as Resp;
}

export const RezvixOrdersPage: React.FC = () => {
  const user = authStore.getUser();

  // ✅ Önce legacy restaurantId, yoksa membership'ten ilk restoran
  const fallbackMembershipRestaurantId =
    user?.restaurantMemberships?.[0]?.id ?? null;

  const rid =
    asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: (resId: string) =>
      restaurantUpdateReservationStatus(resId, "confirmed"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["desktop-rezvix-orders", rid],
      });
      showToast("Rezervasyon onaylandı.", "success");
    },
    onError: () => {
      showToast("Rezervasyon onaylanamadı.", "error");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (resId: string) =>
      restaurantUpdateReservationStatus(resId, "cancelled"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["desktop-rezvix-orders", rid],
      });
      showToast("Rezervasyon iptal edildi.", "success");
    },
    onError: () => {
      showToast("Rezervasyon iptal edilemedi.", "error");
    },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["desktop-rezvix-orders", rid],
    queryFn: () => fetchRezvixOrders(rid),
    enabled: !!rid,
  });

  console.log("[RezvixOrdersPage:data]", data);

  const handleApprove = (id: string) => {
    if (!id || confirmMutation.isPending || cancelMutation.isPending) return;
    confirmMutation.mutate(id);
  };

  const handleCancel = (id: string) => {
    if (!id || confirmMutation.isPending || cancelMutation.isPending) return;
    cancelMutation.mutate(id);
  };

  const rows: Row[] = data?.items ?? [];

  const pending = rows.filter((r) => r.status === "pending");
  const active = rows.filter(
    (r) => r.status === "confirmed" || r.status === "arrived"
  );
  const problematic = rows.filter(
    (r) => r.status === "cancelled" || r.status === "no_show"
  );

  const totalOrders = rows.length;
  const activeCount = active.length;
  const pendingCount = pending.length;
  const todayTotalAmount = rows.reduce(
    (sum, r) => sum + (r.totalPrice ?? 0),
    0
  );

  const hasData = totalOrders > 0;

  const renderCard = (
    r: Row,
    bucket: "pending" | "active" | "problematic"
  ) => {
    const dt = new Date(r.dateTimeUTC);
    const when = dt.toLocaleString("tr-TR");

    const displayName =
      r.displayName ||
      r.guestName ||
      r.name ||
      r.user?.name ||
      r.user?.email ||
      "İsimsiz misafir";

    return (
      <article key={r._id} className="rezvix-kitchen-ticket">
        <div className="rezvix-kitchen-ticket__header">
          <div className="rezvix-kitchen-ticket__title">{displayName}</div>
          <div className="rezvix-kitchen-ticket__meta">{when}</div>
        </div>

        <ul className="rezvix-kitchen-ticket__items">
          <li className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">
              {r.partySize} kişi
            </span>
            <span className="rezvix-kitchen-ticket__qty">
              {fmtStatus(r.status)}
            </span>
          </li>
          <li className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">
              Beklenen harcama
            </span>
            <span className="rezvix-kitchen-ticket__qty">
              {r.totalPrice != null
                ? `${r.totalPrice.toLocaleString("tr-TR")}₺`
                : "—"}
            </span>
          </li>
          <li className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">Depozito</span>
            <span className="rezvix-kitchen-ticket__qty">
              {r.depositAmount != null
                ? `${r.depositAmount.toLocaleString("tr-TR")}₺`
                : "—"}
            </span>
          </li>
        </ul>

        <div
          className="rezvix-kitchen-ticket__footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>
            {r.user?.email || fmtStatus(r.status)}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {r.receiptUrl && (
              <button
                type="button"
                onClick={() => window.open(r.receiptUrl!, "_blank")}
                style={{
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 11,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "#ffffff",
                  cursor: "pointer",
                  color: "var(--rezvix-text-muted)",
                }}
              >
                Dekontu Gör
              </button>
            )}

            {bucket === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => handleCancel(r._id)}
                  disabled={
                    confirmMutation.isPending || cancelMutation.isPending
                  }
                  style={{
                    borderRadius: 999,
                    padding: "5px 12px",
                    fontSize: 11,
                    border: "1px solid var(--rezvix-border-subtle)",
                    background: "#ffffff",
                    cursor:
                      confirmMutation.isPending || cancelMutation.isPending
                        ? "default"
                        : "pointer",
                    color: "var(--rezvix-danger)",
                    opacity:
                      confirmMutation.isPending || cancelMutation.isPending
                        ? 0.6
                        : 1,
                  }}
                >
                  Reddet
                </button>

                <button
                  type="button"
                  onClick={() => handleApprove(r._id)}
                  disabled={
                    confirmMutation.isPending || cancelMutation.isPending
                  }
                  style={{
                    borderRadius: 999,
                    padding: "5px 14px",
                    fontSize: 11,
                    border: "none",
                    background: "var(--rezvix-success)",
                    color: "#ffffff",
                    cursor:
                      confirmMutation.isPending || cancelMutation.isPending
                        ? "default"
                        : "pointer",
                    boxShadow: "0 10px 20px rgba(0,0,0,0.25)",
                    opacity:
                      confirmMutation.isPending || cancelMutation.isPending
                        ? 0.7
                        : 1,
                  }}
                >
                  Onayla
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <RestaurantDesktopLayout
      activeNav="rezvix"
      title="Rezvix & QR Siparişleri"
      subtitle="Rezvix rezervasyonlarından ve QR menüden gelen siparişleri buradan yönetin."
      summaryChips={[
        {
          label: "Toplam sipariş",
          value: `${totalOrders} adet`,
          tone: "neutral",
        },
        {
          label: "Aktif",
          value: `${activeCount} adet`,
          tone: activeCount > 0 ? "success" : "neutral",
        },
        {
          label: "Bekleyen",
          value: `${pendingCount} adet`,
          tone: pendingCount > 0 ? "warning" : "neutral",
        },
      ]}
    >
      {isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⏳</div>
          <div className="rezvix-empty__title">Siparişler getiriliyor…</div>
          <div className="rezvix-empty__text">
            Rezvix ve QR siparişleri birkaç saniye içinde yüklenecek.
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⚠️</div>
          <div className="rezvix-empty__title">Siparişler yüklenemedi</div>
          <div className="rezvix-empty__text">
            Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı
            kontrol edin.
          </div>
        </div>
      )}

      {!isLoading && !isError && !hasData && (
        <EmptyState
          icon="📲"
          title="Henüz aktif Rezvix / QR siparişi yok"
          text="Rezvix rezervasyonları ve QR menü siparişleri burada listelenecek."
        />
      )}

      {!isLoading && !isError && hasData && (
        <div className="rezvix-board-layout">
          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">Bekleyen</div>
              <div className="rezvix-board-column__count">
                {pending.length}
              </div>
            </div>
            <div className="rezvix-board-column__body">
              {pending.map((r) => renderCard(r, "pending"))}
            </div>
          </div>

          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">Aktif</div>
              <div className="rezvix-board-column__count">
                {active.length}
              </div>
            </div>
            <div className="rezvix-board-column__body">
              {active.map((r) => renderCard(r, "active"))}
            </div>
          </div>

          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">Sorunlu</div>
              <div className="rezvix-board-column__count">
                {problematic.length}
              </div>
            </div>
            <div className="rezvix-board-column__body">
              {problematic.map((r) => renderCard(r, "problematic"))}
            </div>
          </div>
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};