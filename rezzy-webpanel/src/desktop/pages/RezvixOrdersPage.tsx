// src/desktop/pages/RezvixOrdersPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout, useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";
import { EmptyState } from "../components/EmptyState";
import { api, restaurantUpdateReservationStatus } from "../../api/client";
import { authStore } from "../../store/auth";
import { showToast } from "../../ui/Toast";
import { asId } from "../../lib/id"; // ✅ EKLENDİ
import { useI18n, t as i18nT } from "../../i18n";

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
  pending: i18nT("Bekleyen"),
  confirmed: i18nT("Onaylı"),
  arrived: i18nT("Geldi"),
  no_show: i18nT("Gelmedi"),
  cancelled: i18nT("İptal"),
};

function fmtStatus(s: string) {
  return trStatus[s] ?? i18nT(s);
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isTodayLocal(isoUtc: string) {
  const d = new Date(isoUtc);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

async function fetchRezvixOrders(rid: string): Promise<Resp> {
  // We need ALL pending requests (not only today's) for the "Bekleyen" column.
  // We'll fetch without a date lower-bound and slice client-side for "today" buckets.
  const params = {
    page: 1,
    limit: 200,
  };

  const { data } = await api.get(`/restaurants/${rid}/reservations`, { params });
  return data as Resp;
}

export const RezvixOrdersPage: React.FC = () => {
  const { t } = useI18n();
  return (
    <RestaurantDesktopLayout
      activeNav="rezvix"
      title={t("Rezvix & QR Siparişleri")}
      subtitle={t("Rezvix rezervasyonlarından ve QR menüden gelen siparişleri buradan yönetin.")}
      summaryChips={[]}
    >
      <RezvixOrdersInner />
    </RestaurantDesktopLayout>
  );
};

const RezvixOrdersInner: React.FC = () => {
  const { t } = useI18n();
  const user = authStore.getUser();

  // ✅ Currency is resolved at layout level (restaurant.region preferred)
  const { currencySymbol, restaurantId: layoutRestaurantId } =
    useRestaurantDesktopCurrency();

  // ✅ Fallback: legacy restaurantId, otherwise first membership restaurant
  const fallbackMembershipRestaurantId =
    user?.restaurantMemberships?.[0]?.id ?? null;

  const rid =
    layoutRestaurantId ||
    asId(user?.restaurantId || fallbackMembershipRestaurantId) ||
    "";

  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: (resId: string) =>
      restaurantUpdateReservationStatus(resId, "confirmed"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["desktop-rezvix-orders", rid],
      });
      showToast(t("Rezervasyon onaylandı."), "success");
    },
    onError: () => {
      showToast(t("Rezervasyon onaylanamadı."), "error");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (resId: string) =>
      restaurantUpdateReservationStatus(resId, "cancelled"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["desktop-rezvix-orders", rid],
      });
      showToast(t("Rezervasyon iptal edildi."), "success");
    },
    onError: () => {
      showToast(t("Rezervasyon iptal edilemedi."), "error");
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

  // Buckets:
  // - Bekleyen: all pending requests (any date)
  // - Aktif: only today's confirmed/arrived
  // - Sorunlu: only today's cancelled/no_show
  const pending = rows.filter((r) => r.status === "pending");

  const active = rows.filter(
    (r) => isTodayLocal(r.dateTimeUTC) && (r.status === "confirmed" || r.status === "arrived")
  );

  const problematic = rows.filter(
    (r) => isTodayLocal(r.dateTimeUTC) && (r.status === "cancelled" || r.status === "no_show")
  );

  const totalOrders = rows.length;
  const activeCount = active.length;
  const pendingCount = pending.length;

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
      t("İsimsiz misafir");

    return (
      <article key={r._id} className="rezvix-kitchen-ticket">
        <div className="rezvix-kitchen-ticket__header">
          <div className="rezvix-kitchen-ticket__title">{displayName}</div>
          <div className="rezvix-kitchen-ticket__meta">{when}</div>
        </div>

        <ul className="rezvix-kitchen-ticket__items">
          <li className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">
              {t("{count} kişi", { count: r.partySize })}
            </span>
            <span className="rezvix-kitchen-ticket__qty">
              {fmtStatus(r.status)}
            </span>
          </li>
          <li className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">
              {t("Beklenen harcama")}
            </span>
            <span className="rezvix-kitchen-ticket__qty">
              {r.totalPrice != null
                ? `${r.totalPrice.toLocaleString("tr-TR")}${currencySymbol}`
                : t("—")}
            </span>
          </li>
          <li className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">{t("Depozito")}</span>
            <span className="rezvix-kitchen-ticket__qty">
              {r.depositAmount != null
                ? `${r.depositAmount.toLocaleString("tr-TR")}${currencySymbol}`
                : t("—")}
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
                {t("Dekontu Gör")}
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
                  {t("Reddet")}
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
                  {t("Onayla")}
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    );
  };

  // ✅ Layout summary chips now that counts are known
  // We cannot mutate the parent props, so we render the chips via the TopBar props above.
  // Therefore, keep the existing visual content here.

  return (
    <>
      {/* Summary chips block (mirrors TopBar chips to avoid prop threading) */}
      <div style={{ display: "none" }} data-summary-chips>
        {totalOrders}-{activeCount}-{pendingCount}
      </div>

      {isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⏳</div>
          <div className="rezvix-empty__title">{t("Siparişler getiriliyor…")}</div>
          <div className="rezvix-empty__text">
            {t("Rezvix ve QR siparişleri birkaç saniye içinde yüklenecek.")}
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⚠️</div>
          <div className="rezvix-empty__title">{t("Siparişler yüklenemedi")}</div>
          <div className="rezvix-empty__text">
            {t("Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı kontrol edin.")}
          </div>
        </div>
      )}

      {!isLoading && !isError && !hasData && (
        <EmptyState
          icon="📲"
          title={t("Henüz aktif Rezvix / QR siparişi yok")}
          text={t("Rezvix rezervasyonları ve QR menü siparişleri burada listelenecek.")}
        />
      )}

      {!isLoading && !isError && hasData && (
        <div className="rezvix-board-layout">
          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">{t("Bekleyen")}</div>
              <div className="rezvix-board-column__count">{pending.length}</div>
            </div>
            <div className="rezvix-board-column__body">
              {pending.map((r) => renderCard(r, "pending"))}
            </div>
          </div>

          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">{t("Aktif")}</div>
              <div className="rezvix-board-column__count">{active.length}</div>
            </div>
            <div className="rezvix-board-column__body">
              {active.map((r) => renderCard(r, "active"))}
            </div>
          </div>

          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">{t("Sorunlu")}</div>
              <div className="rezvix-board-column__count">{problematic.length}</div>
            </div>
            <div className="rezvix-board-column__body">
              {problematic.map((r) => renderCard(r, "problematic"))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
