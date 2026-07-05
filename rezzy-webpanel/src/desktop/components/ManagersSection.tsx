import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import type { BranchManager } from "../../api/branchManagers";

export interface ManagersSectionProps {
  queryKey: string[];
  listManagers: () => Promise<BranchManager[]>;
  addManager: (body: { name?: string; email: string; password?: string }) => Promise<BranchManager>;
  removeManager: (userId: string) => Promise<void>;
  title?: string;
}

const inputSx: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelSx: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 4,
  display: "block",
};

export function ManagersSection({
  queryKey,
  listManagers,
  addManager,
  removeManager,
  title,
}: ManagersSectionProps) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const { data: managers, isLoading } = useQuery({
    queryKey,
    queryFn: listManagers,
  });

  const addMut = useMutation({
    mutationFn: () =>
      addManager({
        name: name.trim() || undefined,
        email: email.trim(),
        password: password.trim() || undefined,
      }),
    onSuccess: () => {
      showToast(t("Yönetici eklendi"), "success");
      setName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message ?? t("Yönetici eklenemedi"), "error"),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeManager(userId),
    onSuccess: () => {
      showToast(t("Yönetici kaldırıldı"), "success");
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message ?? t("Yönetici kaldırılamadı"), "error"),
  });

  const list = managers ?? [];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: "20px 24px",
        marginBottom: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#6b7280",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          {title ?? t("Yöneticiler")}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: showForm ? "#f3f4f6" : "#fff",
            color: "#374151",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showForm ? t("Vazgeç") : t("Yönetici ekle")}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) {
              showToast(t("E-posta zorunlu"), "error");
              return;
            }
            addMut.mutate();
          }}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr auto",
            gap: 10,
            alignItems: "end",
            marginBottom: 18,
            padding: "14px",
            borderRadius: 10,
            background: "#f9fafb",
            border: "1px solid #eef0f2",
          }}
        >
          <div>
            <label style={labelSx}>{t("Ad")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Ad Soyad")}
              style={inputSx}
            />
          </div>
          <div>
            <label style={labelSx}>{t("E-posta")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@rezvix.com"
              style={inputSx}
              required
            />
          </div>
          <div>
            <label style={labelSx}>{t("Şifre")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Yeni kullanıcı için zorunlu (min 6)")}
              style={inputSx}
            />
          </div>
          <button
            type="submit"
            disabled={addMut.isPending}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: addMut.isPending ? "#9ca3af" : "#4f46e5",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: addMut.isPending ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {addMut.isPending ? t("Ekleniyor…") : t("Ekle")}
          </button>
        </form>
      )}

      {isLoading ? (
        <div style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>
          {t("Yükleniyor…")}
        </div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic", padding: "8px 0" }}>
          {t("Henüz yönetici eklenmemiş")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {list.map((m, idx) => (
            <div
              key={m._id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: idx < list.length - 1 ? "1px solid #f1f5f9" : "none",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "#eef2ff",
                  color: "#4f46e5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>
                  {m.name || "-"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{m.email}</div>
              </div>

              {confirmDeleteId === m._id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => removeMut.mutate(m._id)}
                    disabled={removeMut.isPending}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t("Onayla")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {t("Vazgeç")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(m._id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("Sil")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
