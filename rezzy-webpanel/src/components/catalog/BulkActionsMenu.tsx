import React, { useEffect, useRef, useState } from "react";

// ── Icons (inline SVG, currentColor, no external deps) ───────────────────────

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width={15} height={15}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.5V9M10 15.5V4M16 15.5v-6.5" />
      <path strokeLinecap="round" d="M3 17h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width={15} height={15}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 15.5V4.5M5.5 9 10 4.5 14.5 9" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width={15} height={15}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4.5v11M5.5 11 10 15.5 14.5 11" />
    </svg>
  );
}

export interface BulkActionsMenuItem {
  key: string;
  label: string;
  icon: "chart" | "arrow-up" | "arrow-down";
  onClick: () => void;
  title?: string;
}

export interface BulkActionsMenuProps {
  label: string;
  items: BulkActionsMenuItem[];
}

const ICONS: Record<BulkActionsMenuItem["icon"], React.FC> = {
  chart: ChartIcon,
  "arrow-up": ArrowUpIcon,
  "arrow-down": ArrowDownIcon,
};

/**
 * "⋯ Toplu İşlemler" dropdown — groups rarely-used bulk actions (CSV/Excel
 * import-export, bulk price update) behind a single outline button so the
 * page-title row stays limited to title + search + primary action.
 */
export function BulkActionsMenu({ label, items }: BulkActionsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <style>{`
        .bam-trigger:hover { background: var(--rezvix-bg-soft) !important; }
        .bam-item:hover { background: var(--rezvix-bg-soft) !important; }
        @keyframes bamMenuIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
      `}</style>

      <button
        type="button"
        className="bam-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid var(--rezvix-border-strong)",
          background: "transparent",
          color: "var(--rezvix-text-main)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13.5,
          whiteSpace: "nowrap",
          transition: "background .12s ease",
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>⋯</span>
        {label}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--rezvix-bg-elevated)",
            borderRadius: 10,
            border: "1px solid var(--rezvix-border-subtle)",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            padding: 6,
            zIndex: 60,
            animation: "bamMenuIn .14s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="bam-item"
                title={item.title}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "var(--rezvix-text-main)",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  textAlign: "left",
                  transition: "background .1s ease",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--rezvix-text-soft)",
                    flexShrink: 0,
                  }}
                >
                  <Icon />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
