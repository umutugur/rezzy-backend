import React from "react";

export interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 22,
        paddingBottom: 18,
        borderBottom: "1px solid var(--rezvix-border-subtle)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--rezvix-text-main)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--rezvix-text-muted)",
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
