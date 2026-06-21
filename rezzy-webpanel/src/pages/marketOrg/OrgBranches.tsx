import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { DataTable, type Column } from "../../desktop/components/admin/DataTable";
import { listOrgBranches } from "../../api/marketOrgCatalog";
import { useI18n } from "../../i18n";

type Branch = { _id: string; name: string; city?: string; isActive?: boolean };

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
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--rezvix-text-main)",
        }}
      >
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--rezvix-text-muted)",
          maxWidth: 360,
        }}
      >
        {t(
          "Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.",
        )}
      </div>
    </div>
  );
}

export default function OrgBranches() {
  const { t } = useI18n();

  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["org-branches", orgId],
    queryFn: () => listOrgBranches(orgId!),
    enabled: !!orgId,
  });

  const branches: Branch[] = data?.items ?? [];

  const columns: Column<Branch>[] = [
    {
      key: "name",
      header: t("Ad"),
      render: (b) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--rezvix-primary-soft)",
              border: "1px solid rgba(123,44,44,.20)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            🏪
          </div>
          <span
            style={{
              color: "var(--rezvix-text-main)",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {b.name}
          </span>
        </div>
      ),
    },
    {
      key: "city",
      header: t("Şehir"),
      render: (b) => (
        <span
          style={{
            color: b.city ? "var(--rezvix-text-muted)" : "var(--rezvix-text-soft)",
            fontSize: 13,
          }}
        >
          {b.city ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: t("Durum"),
      render: (b) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            padding: "4px 11px",
            fontSize: 12,
            fontWeight: 600,
            background:
              b.isActive !== false
                ? "rgba(22,163,74,.10)"
                : "rgba(220,38,38,.10)",
            color:
              b.isActive !== false
                ? "var(--rezvix-success)"
                : "var(--rezvix-danger)",
            border: `1px solid ${
              b.isActive !== false
                ? "rgba(22,163,74,.24)"
                : "rgba(220,38,38,.24)"
            }`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                b.isActive !== false
                  ? "var(--rezvix-success)"
                  : "var(--rezvix-danger)",
            }}
          />
          {b.isActive !== false ? t("Aktif") : t("Pasif")}
        </span>
      ),
    },
  ];

  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          title={t("Şubeler")}
          subtitle={t("Zincire bağlı şubelerin listesi")}
        />
        <NoOrgState t={t} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <AdminPageHeader
        title={t("Şubeler")}
        subtitle={t("Zincire bağlı şubelerin listesi")}
      />

      {/* Stats */}
      {!isLoading && branches.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {[
            {
              label: t("Toplam"),
              value: branches.length,
              color: "var(--rezvix-primary)",
              dot: "var(--rezvix-primary)",
            },
            {
              label: t("Aktif"),
              value: branches.filter((b) => b.isActive !== false).length,
              color: "var(--rezvix-success)",
              dot: "var(--rezvix-success)",
            },
            {
              label: t("Pasif"),
              value: branches.filter((b) => b.isActive === false).length,
              color: "var(--rezvix-danger)",
              dot: "var(--rezvix-danger)",
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: "var(--rezvix-bg-elevated)",
                border: "1px solid var(--rezvix-border-subtle)",
                boxShadow: "0 1px 2px rgba(17,20,40,.04)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: s.dot,
                  flexShrink: 0,
                }}
              />
              <span
                style={{ color: "var(--rezvix-text-muted)", fontSize: 12.5 }}
              >
                {s.label}
              </span>
              <span
                style={{ color: s.color, fontSize: 14, fontWeight: 700 }}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <DataTable<Branch>
        columns={columns}
        rows={branches}
        rowKey={(b) => b._id}
        loading={isLoading}
        emptyText={t("Şube bulunamadı.")}
      />
    </div>
  );
}
