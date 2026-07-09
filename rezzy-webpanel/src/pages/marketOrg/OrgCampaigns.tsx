import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import {
  listOrgCampaigns,
  joinOrgCampaign,
  leaveOrgCampaign,
  type OrgCampaignItem,
  type CampaignDiscountKind,
} from "../../api/marketOrgCampaigns";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";

const DISCOUNT_KIND_LABELS: Record<CampaignDiscountKind, string> = {
  percent: "Yüzde indirim",
  fixed: "Sabit tutar indirim",
  free_delivery: "Ücretsiz teslimat",
  fixed_price: "Sabit fiyat",
};

function formatDiscount(c: OrgCampaignItem["campaign"], t: (s: string) => string): string {
  const { discount, currency } = c;
  switch (discount.kind) {
    case "percent":
      return `%${discount.value}${discount.maxDiscount ? ` (${t("azami")} ${discount.maxDiscount}${currency || "₺"})` : ""}`;
    case "fixed":
      return `${discount.value}${currency || "₺"} ${t("indirim")}`;
    case "fixed_price":
      return `${discount.value}${currency || "₺"} ${t("sabit fiyat")}`;
    case "free_delivery":
      return t("Ücretsiz teslimat");
    default:
      return "";
  }
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

function NoOrgState({ t }: { t: (s: string) => string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.4 }}>🏢</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)", maxWidth: 360 }}>
        {t("Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.")}
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: (s: string) => string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        gap: 12,
        background: "var(--rezvix-bg-elevated)",
        border: "1px solid var(--rezvix-border-subtle)",
        borderRadius: 14,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.4 }}>🎯</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--rezvix-text-main)" }}>
        {t("Şu anda şubelerinize uygun opt-in kampanya yok.")}
      </div>
    </div>
  );
}

function BranchBadge({ joined, t }: { joined: boolean; t: (s: string) => string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 11.5,
        fontWeight: 600,
        background: joined ? "rgba(22,163,74,.10)" : "rgba(148,163,184,.14)",
        color: joined ? "var(--rezvix-success)" : "var(--rezvix-text-muted)",
        border: `1px solid ${joined ? "rgba(22,163,74,.24)" : "rgba(148,163,184,.28)"}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: joined ? "var(--rezvix-success)" : "var(--rezvix-text-soft, #94a3b8)",
        }}
      />
      {joined ? t("Katıldı") : t("Katılmadı")}
    </span>
  );
}

function CampaignCard({ item, orgId, t }: { item: OrgCampaignItem; orgId: string; t: (s: string) => string }) {
  const qc = useQueryClient();
  const { campaign, branches } = item;
  const notJoinedStoreIds = branches.filter((b) => !b.joined).map((b) => b.storeId);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["org-campaigns", orgId] });

  const joinMutation = useMutation({
    mutationFn: (storeIds?: string[]) => joinOrgCampaign(orgId, campaign._id, storeIds),
    onSuccess: () => {
      invalidate();
      showToast(t("Kampanyaya katılındı"), "success");
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? t("İşlem başarısız"), "error"),
  });

  const leaveMutation = useMutation({
    mutationFn: (storeIds?: string[]) => leaveOrgCampaign(orgId, campaign._id, storeIds),
    onSuccess: () => {
      invalidate();
      showToast(t("Kampanyadan çıkıldı"), "success");
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? t("İşlem başarısız"), "error"),
  });

  const busy = joinMutation.isPending || leaveMutation.isPending;

  return (
    <div
      style={{
        background: "var(--rezvix-bg-elevated)",
        border: "1px solid var(--rezvix-border-subtle)",
        borderRadius: 14,
        padding: 20,
        boxShadow: "0 1px 2px rgba(17,20,40,.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "var(--rezvix-primary-soft)",
                border: "1px solid rgba(123,44,44,.20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              🎯
            </div>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                {campaign.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--rezvix-text-muted)" }}>
                {DISCOUNT_KIND_LABELS[campaign.discount.kind]} · {formatDiscount(campaign, t)}
              </div>
            </div>
          </div>
          {campaign.description && (
            <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)", maxWidth: 520 }}>
              {campaign.description}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--rezvix-text-soft, #94a3b8)" }}>
            {t("Geçerlilik")}: {formatDate(campaign.validFrom)} – {formatDate(campaign.validTo)}
          </div>
        </div>

        <button
          type="button"
          disabled={busy || notJoinedStoreIds.length === 0}
          onClick={() => joinMutation.mutate(undefined)}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid var(--rezvix-primary)",
            background: notJoinedStoreIds.length === 0 ? "var(--rezvix-primary-soft)" : "var(--rezvix-primary)",
            color: notJoinedStoreIds.length === 0 ? "var(--rezvix-primary)" : "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy || notJoinedStoreIds.length === 0 ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {notJoinedStoreIds.length === 0 ? t("Tüm şubeler katıldı") : t("Tümünü Katıl")}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          borderTop: "1px solid var(--rezvix-border-subtle)",
          paddingTop: 12,
        }}
      >
        {branches.map((b) => (
          <div
            key={b.storeId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "6px 4px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13.5, color: "var(--rezvix-text-main)", fontWeight: 600 }}>
                {b.name}
              </span>
              <BranchBadge joined={b.joined} t={t} />
            </div>
            {b.joined ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => leaveMutation.mutate([b.storeId])}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--rezvix-border-strong)",
                  background: "transparent",
                  color: "var(--rezvix-danger)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {t("Ayrıl")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => joinMutation.mutate([b.storeId])}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--rezvix-primary)",
                  background: "transparent",
                  color: "var(--rezvix-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {t("Katıl")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrgCampaigns() {
  const { t } = useI18n();
  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["org-campaigns", orgId],
    queryFn: () => listOrgCampaigns(orgId!),
    enabled: !!orgId,
  });

  const items = data?.items ?? [];

  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader title={t("Kampanyalar")} subtitle={t("Şubeleriniz için uygun kampanyalar")} />
        <NoOrgState t={t} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <AdminPageHeader
        title={t("Kampanyalar")}
        subtitle={t("Şubelerinizin uygun olduğu opt-in kampanyalara katılın veya çıkın")}
      />

      {isLoading ? (
        <div style={{ color: "var(--rezvix-text-muted)", fontSize: 13, padding: "20px 4px" }}>
          {t("Yükleniyor...")}
        </div>
      ) : items.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => (
            <CampaignCard key={item.campaign._id} item={item} orgId={orgId} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
