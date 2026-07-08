import React from "react";
import { useI18n } from "../../../i18n";

// ── Public interfaces ────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (p: number) => void;
  };
  /**
   * When provided, replaces the default `rows.map(...)` body rendering with a
   * custom set of `<tr>` elements (e.g. grouped rows with section headers).
   * The header, search bar, loading/empty states, and pagination footer are
   * unaffected — only the data-row rendering is overridden.
   */
  renderBody?: (rows: T[]) => React.ReactNode;
}

// ── Internal sub-components ──────────────────────────────────────────────────

/**
 * Renders a single data row exactly like DataTable's default body rendering.
 * Exported so callers can build custom bodies (e.g. grouped rows) via
 * `renderBody` while keeping identical row styling/behavior.
 */
export function DataTableRow<T>({
  row,
  columns,
  rowKey,
  onRowClick,
  isLast,
}: {
  row: T;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLast?: boolean;
}): JSX.Element {
  return (
    <tr
      key={rowKey(row)}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      style={{
        cursor: onRowClick ? "pointer" : "default",
        borderBottom: isLast ? "none" : "1px solid var(--rezvix-border-subtle)",
        transition: "background 0.13s ease",
      }}
      onMouseEnter={(e) => {
        if (onRowClick) {
          (e.currentTarget as HTMLTableRowElement).style.background =
            "var(--rezvix-bg-soft)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "";
      }}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          style={{
            padding: "11px 14px",
            textAlign: col.align ?? "left",
            width: col.width,
            verticalAlign: "middle",
            fontSize: 13.5,
            color: "var(--rezvix-text-main)",
          }}
        >
          {col.render
            ? col.render(row)
            : String((row as Record<string, unknown>)[col.key] ?? "")}
        </td>
      ))}
    </tr>
  );
}

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} style={{ padding: "12px 14px" }}>
          <div
            style={{
              height: 14,
              borderRadius: 6,
              width: i === 0 ? "60%" : i % 2 === 0 ? "80%" : "45%",
              background: "linear-gradient(90deg,#eef0f4 25%,#f7f8fb 50%,#eef0f4 75%)",
              backgroundSize: "200% 100%",
              animation: "dtShimmer 1.3s infinite",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function DataTable<T,>(props: DataTableProps<T>): JSX.Element {
  const {
    columns,
    rows,
    rowKey,
    loading = false,
    error,
    emptyText,
    onRowClick,
    search,
    pagination,
    renderBody,
  } = props;

  const { t } = useI18n();

  const pageCount =
    pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;
  const pageStart =
    pagination ? pagination.page * pagination.pageSize + 1 : 1;
  const pageEnd =
    pagination
      ? Math.min((pagination.page + 1) * pagination.pageSize, pagination.total)
      : rows.length;

  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Shimmer keyframe injected once */}
      <style>{`
        @keyframes dtShimmer {
          from { background-position: 200% 0 }
          to   { background-position: -200% 0 }
        }
      `}</style>

      {/* Search bar */}
      {search && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              maxWidth: 360,
            }}
          >
            {/* Search icon */}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="var(--rezvix-text-soft)"
              strokeWidth="1.8"
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                width: 15,
                height: 15,
                pointerEvents: "none",
              }}
            >
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path strokeLinecap="round" d="M14 14l3 3" />
            </svg>
            <input
              type="text"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? t("Ara...")}
              style={{
                width: "100%",
                paddingLeft: 34,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 999,
                border: "1px solid var(--rezvix-border-strong)",
                background: "var(--rezvix-bg-elevated)",
                color: "var(--rezvix-text-main)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.16s ease, box-shadow 0.16s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary-soft)";
                e.currentTarget.style.boxShadow = "0 0 0 2px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </div>
      )}

      {/* Table wrapper */}
      <div
        style={{
          borderRadius: "var(--rezvix-radius-lg)",
          border: "1px solid var(--rezvix-border-subtle)",
          background: "var(--rezvix-bg-elevated)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {/* Error state */}
        {error ? (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 28 }}>&#9888;&#65039;</span>
            <span
              style={{
                fontSize: 13.5,
                color: "var(--rezvix-danger)",
                fontWeight: 500,
              }}
            >
              {error}
            </span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13.5,
                color: "var(--rezvix-text-main)",
              }}
            >
              {/* Sticky header */}
              <thead>
                <tr
                  style={{
                    background:
                      "linear-gradient(180deg, var(--rezvix-bg-soft) 0%, var(--rezvix-bg-elevated) 100%)",
                    borderBottom: "1px solid var(--rezvix-border-subtle)",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        padding: "11px 14px",
                        textAlign: col.align ?? "left",
                        width: col.width,
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        color: "var(--rezvix-text-soft)",
                        whiteSpace: "nowrap",
                        userSelect: "none",
                      }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  // Skeleton rows
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} colCount={columns.length} />
                  ))
                ) : isEmpty ? (
                  // Empty state
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ padding: "56px 20px", textAlign: "center" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 32, opacity: 0.45 }}>&#128203;</span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: "var(--rezvix-text-muted)",
                          }}
                        >
                          {emptyText ?? t("Kayıt yok")}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : renderBody ? (
                  renderBody(rows)
                ) : (
                  // Data rows
                  rows.map((row, rowIdx) => (
                    <DataTableRow
                      key={rowKey(row)}
                      row={row}
                      columns={columns}
                      rowKey={rowKey}
                      onRowClick={onRowClick}
                      isLast={rowIdx === rows.length - 1}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {pagination && !error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderTop: "1px solid var(--rezvix-border-subtle)",
              background: "var(--rezvix-bg-soft)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* Range text */}
            <span
              style={{
                fontSize: 12,
                color: "var(--rezvix-text-soft)",
              }}
            >
              {pagination.total > 0
                ? `${pageStart}–${pageEnd} / ${pagination.total}`
                : "0 / 0"}
            </span>

            {/* Prev / Next */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                disabled={pagination.page <= 0}
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--rezvix-border-strong)",
                  background: "var(--rezvix-bg-elevated)",
                  color:
                    pagination.page <= 0
                      ? "var(--rezvix-text-soft)"
                      : "var(--rezvix-text-main)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: pagination.page <= 0 ? "not-allowed" : "pointer",
                  opacity: pagination.page <= 0 ? 0.5 : 1,
                  transition: "background 0.15s ease, transform 0.1s ease",
                }}
              >
                {t("Önceki")}
              </button>

              {/* Page indicator pills — show up to 5 page buttons */}
              {pageCount > 1 && (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {Array.from({ length: Math.min(pageCount, 5) }).map((_, i) => {
                    // Compute which page number to show when pageCount > 5
                    let pg = i;
                    if (pageCount > 5) {
                      const half = 2;
                      let start = Math.max(0, pagination.page - half);
                      const end = Math.min(pageCount - 1, start + 4);
                      start = Math.max(0, end - 4);
                      pg = start + i;
                    }
                    const isActive = pg === pagination.page;
                    return (
                      <button
                        key={pg}
                        onClick={() => pagination.onPageChange(pg)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          border: isActive
                            ? "1px solid var(--rezvix-primary)"
                            : "1px solid var(--rezvix-border-subtle)",
                          background: isActive
                            ? "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))"
                            : "transparent",
                          color: isActive ? "#fff7f3" : "var(--rezvix-text-muted)",
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {pg + 1}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                disabled={pagination.page >= pageCount - 1}
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--rezvix-border-strong)",
                  background: "var(--rezvix-bg-elevated)",
                  color:
                    pagination.page >= pageCount - 1
                      ? "var(--rezvix-text-soft)"
                      : "var(--rezvix-text-main)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: pagination.page >= pageCount - 1 ? "not-allowed" : "pointer",
                  opacity: pagination.page >= pageCount - 1 ? 0.5 : 1,
                  transition: "background 0.15s ease, transform 0.1s ease",
                }}
              >
                {t("Sonraki")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
