import React from "react";

/**
 * Shared CSS for the catalog accordion group headers + fade-slide-in reveal.
 * Injected once per page via <style>{CATEGORY_GROUP_STYLES}</style>.
 */
export const CATEGORY_GROUP_STYLES = `
  @keyframes catGroupFadeSlideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .cat-group-row-content { animation: catGroupFadeSlideIn .2s ease; }
  .cat-group-header:hover { background: var(--rezvix-bg-soft) !important; }
  .cat-group-chevron { display: inline-block; transition: transform .18s ease; }
`;

export interface CategoryGroupHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  depth: 0 | 1;
  onToggle: () => void;
  /** Number of table columns to span (for <tr>/<td> rendering). */
  colSpan: number;
}

/**
 * One row of the catalog accordion — used identically across OrgCatalog,
 * MarketChainProductsPage and MarketProductsPage so the "cetvel" language
 * (chevron, uppercase parent title, pill count badge, indent guide) matches
 * pixel-for-pixel on all three pages.
 *
 * Renders as a <tr> so it can be dropped directly into a <tbody>.
 */
export function CategoryGroupHeaderRow({
  title,
  count,
  collapsed,
  depth,
  onToggle,
  colSpan,
}: CategoryGroupHeaderProps): JSX.Element {
  const isParent = depth === 0;

  return (
    <tr
      className="cat-group-header"
      onClick={onToggle}
      style={{
        cursor: "pointer",
        background: "transparent",
        borderTop: "1px solid var(--rezvix-border-subtle)",
        transition: "background .12s ease",
      }}
    >
      <td
        colSpan={colSpan}
        style={{
          padding: 0,
          height: isParent ? 40 : 34,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            paddingLeft: isParent ? 14 : 20,
            paddingRight: 14,
            borderLeft: isParent ? "none" : "2px solid var(--rezvix-border-strong)",
            marginLeft: isParent ? 0 : 18,
            gap: 8,
          }}
        >
          <span
            className="cat-group-chevron"
            style={{
              width: 12,
              flexShrink: 0,
              color: "var(--rezvix-text-soft)",
              fontSize: 11,
              transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            }}
          >
            ▸
          </span>

          <span
            style={{
              fontWeight: isParent ? 700 : 500,
              fontSize: isParent ? 12.5 : 12,
              letterSpacing: isParent ? "0.06em" : "normal",
              textTransform: isParent ? "uppercase" : "none",
              color: isParent ? "var(--rezvix-text-main)" : "var(--rezvix-text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--rezvix-bg-soft)",
              color: "var(--rezvix-text-soft)",
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {count}
          </span>
        </div>
      </td>
    </tr>
  );
}

export interface ExpandCollapseAllProps {
  allCollapsed: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  expandLabel: string;
  collapseLabel: string;
}

/** Small, quiet "Tümünü aç / Tümünü kapat" text-link pair. */
export function ExpandCollapseAll({
  onExpandAll,
  onCollapseAll,
  expandLabel,
  collapseLabel,
}: ExpandCollapseAllProps): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
      <button
        type="button"
        onClick={onExpandAll}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--rezvix-text-soft)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {expandLabel}
      </button>
      <span style={{ color: "var(--rezvix-border-strong)", fontSize: 12 }}>·</span>
      <button
        type="button"
        onClick={onCollapseAll}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--rezvix-text-soft)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {collapseLabel}
      </button>
    </div>
  );
}
