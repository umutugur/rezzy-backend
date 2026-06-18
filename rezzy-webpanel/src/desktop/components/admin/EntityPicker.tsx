import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PickerItem } from "../../../api/adminPickers";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EntityPickerProps {
  fetcher: (q: string) => Promise<PickerItem[]>;
  value: string | string[] | null;
  onChange: (value: any, items?: PickerItem[]) => void;
  multiple?: boolean;
  placeholder?: string;
  resolveLabels?: (ids: string[]) => Promise<PickerItem[]>;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root: {
    position: "relative" as const,
    width: "100%",
    fontFamily: "inherit",
  },

  inputWrap: (focused: boolean) => ({
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: 5,
    minHeight: 38,
    padding: "4px 10px",
    background: "var(--rezvix-bg-elevated)",
    border: `1.5px solid ${
      focused ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)"
    }`,
    borderRadius: 10,
    cursor: "text",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxShadow: focused
      ? "0 0 0 3px var(--rezvix-primary-soft)"
      : "none",
  }),

  input: {
    flex: 1,
    minWidth: 120,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13.5,
    color: "var(--rezvix-text-main)",
    padding: "2px 0",
    lineHeight: 1.5,
  } as React.CSSProperties,

  placeholder: {
    color: "var(--rezvix-text-soft)",
    fontSize: 13.5,
    pointerEvents: "none" as const,
    userSelect: "none" as const,
  },

  chip: (removing: boolean = false) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 8px 2px 9px",
    background: "var(--rezvix-primary-soft)",
    border: "1px solid var(--rezvix-border-subtle)",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--rezvix-text-main)",
    maxWidth: 220,
    opacity: removing ? 0.45 : 1,
    transition: "opacity 0.15s",
  }),

  chipLabel: {
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
    maxWidth: 160,
  },

  chipRemove: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.08)",
    color: "var(--rezvix-text-muted)",
    cursor: "pointer",
    fontSize: 11,
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
    transition: "background 0.12s, color 0.12s",
  } as React.CSSProperties,

  clearBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.07)",
    color: "var(--rezvix-text-muted)",
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
    transition: "background 0.12s",
    marginLeft: "auto",
  } as React.CSSProperties,

  dropdown: {
    position: "absolute" as const,
    top: "calc(100% + 5px)",
    left: 0,
    right: 0,
    zIndex: 9999,
    background: "var(--rezvix-bg-elevated)",
    border: "1.5px solid var(--rezvix-border-strong)",
    borderRadius: 12,
    boxShadow: "0 8px 28px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.07)",
    overflow: "hidden",
    maxHeight: 280,
    overflowY: "auto" as const,
  },

  option: (active: boolean, selected: boolean) => ({
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
    padding: "9px 13px",
    cursor: "pointer",
    background: selected
      ? "var(--rezvix-primary-soft)"
      : active
      ? "var(--rezvix-bg-soft)"
      : "transparent",
    borderLeft: selected
      ? "3px solid var(--rezvix-primary)"
      : "3px solid transparent",
    transition: "background 0.1s",
  }),

  optionLabel: (selected: boolean) => ({
    fontSize: 13.5,
    fontWeight: selected ? 600 : 500,
    color: "var(--rezvix-text-main)",
    lineHeight: 1.3,
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
  }),

  optionSub: {
    fontSize: 11.5,
    color: "var(--rezvix-text-soft)",
    lineHeight: 1.3,
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
  },

  statusRow: {
    padding: "11px 14px",
    fontSize: 13,
    color: "var(--rezvix-text-soft)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  spinner: {
    width: 14,
    height: 14,
    border: "2px solid var(--rezvix-border-strong)",
    borderTopColor: "var(--rezvix-primary)",
    borderRadius: "50%",
    animation: "ep-spin 0.7s linear infinite",
    flexShrink: 0,
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EntityPicker({
  fetcher,
  value,
  onChange,
  multiple = false,
  placeholder = "Search…",
  resolveLabels,
}: EntityPickerProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [focused, setFocused] = useState(false);

  // id → label cache (populated from search results + resolveLabels)
  const cache = useRef<Map<string, PickerItem>>(new Map());

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Normalize value ───────────────────────────────────────────────────────
  const selectedIds: string[] = multiple
    ? Array.isArray(value)
      ? value
      : []
    : value
    ? [value as string]
    : [];

  // ── Resolve labels for preselected ids on mount ───────────────────────────
  useEffect(() => {
    if (!resolveLabels || selectedIds.length === 0) return;
    const missing = selectedIds.filter((id) => !cache.current.has(id));
    if (missing.length === 0) return;

    resolveLabels(missing)
      .then((items) => {
        items.forEach((item) => cache.current.set(item.id, item));
        // trigger re-render
        setResults((r) => [...r]);
      })
      .catch(() => {/* silent — fallback to id display */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Populate cache from search results ───────────────────────────────────
  const hydrateCache = (items: PickerItem[]) => {
    items.forEach((item) => cache.current.set(item.id, item));
  };

  // ── Debounced search ─────────────────────────────────────────────────────
  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const items = await fetcher(q);
          hydrateCache(items);
          setResults(items);
          setActiveIdx(-1);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [fetcher]
  );

  // ── Open dropdown and fetch on input focus ────────────────────────────────
  const handleFocus = () => {
    setFocused(true);
    if (!open) {
      setOpen(true);
      search(query);
    }
  };

  // ── Input change ─────────────────────────────────────────────────────────
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    search(q);
  };

  // ── Select item ──────────────────────────────────────────────────────────
  const selectItem = (item: PickerItem) => {
    cache.current.set(item.id, item);

    if (multiple) {
      const current = Array.isArray(value) ? value : [];
      if (current.includes(item.id)) return;
      const next = [...current, item.id];
      const nextItems = next
        .map((id) => cache.current.get(id))
        .filter(Boolean) as PickerItem[];
      onChange(next, nextItems);
      setQuery("");
      setResults([]);
      setOpen(false);
      inputRef.current?.focus();
    } else {
      onChange(item.id, [item]);
      setQuery("");
      setOpen(false);
      setFocused(false);
    }
  };

  // ── Remove chip ──────────────────────────────────────────────────────────
  const removeChip = (id: string) => {
    if (multiple) {
      const current = Array.isArray(value) ? value : [];
      const next = current.filter((v) => v !== id);
      const nextItems = next
        .map((nid) => cache.current.get(nid))
        .filter(Boolean) as PickerItem[];
      onChange(next, nextItems);
    } else {
      onChange(null);
    }
  };

  // ── Click-away ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        search(query);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        selectItem(results[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setFocused(false);
    } else if (e.key === "Backspace" && query === "") {
      if (multiple) {
        const current = Array.isArray(value) ? value : [];
        if (current.length > 0) {
          removeChip(current[current.length - 1]);
        }
      }
    }
  };

  // ── Chip label helper ─────────────────────────────────────────────────────
  const getLabel = (id: string) => {
    const item = cache.current.get(id);
    return item?.label ?? id;
  };

  // ── Single-mode: show chip when value selected and input not focused ───────
  const singleSelected = !multiple && value && typeof value === "string";

  // ── Whether to show placeholder text ─────────────────────────────────────
  const showPlaceholder =
    selectedIds.length === 0 && query === "";

  return (
    <>
      {/* Inject spin keyframe once */}
      <style>{`@keyframes ep-spin{to{transform:rotate(360deg)}}`}</style>

      <div ref={rootRef} style={S.root}>
        {/* ── Input wrap ──────────────────────────────────────────────── */}
        <div
          style={S.inputWrap(focused)}
          onClick={() => inputRef.current?.focus()}
        >
          {/* Chips (multiple mode) */}
          {multiple &&
            selectedIds.map((id) => (
              <span key={id} style={S.chip()}>
                <span style={S.chipLabel}>{getLabel(id)}</span>
                <button
                  type="button"
                  style={S.chipRemove}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(id);
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}

          {/* Single-mode chip */}
          {singleSelected && (
            <span style={S.chip()}>
              <span style={S.chipLabel}>{getLabel(value as string)}</span>
              <button
                type="button"
                style={S.chipRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(value as string);
                }}
                title="Clear"
              >
                ×
              </button>
            </span>
          )}

          {/* Text input — hidden in single-selected-not-focused state */}
          {(!singleSelected || focused) && (
            <input
              ref={inputRef}
              style={S.input}
              value={query}
              onChange={handleInput}
              onFocus={handleFocus}
              onBlur={() => {
                // slight delay so click on option registers first
                setTimeout(() => {
                  if (!rootRef.current?.contains(document.activeElement)) {
                    setFocused(false);
                  }
                }, 150);
              }}
              onKeyDown={handleKeyDown}
              placeholder={showPlaceholder ? placeholder : ""}
              autoComplete="off"
              spellCheck={false}
            />
          )}

          {/* Placeholder overlay when not focused and nothing typed */}
          {!singleSelected && selectedIds.length === 0 && query === "" && !focused && (
            <span
              style={{
                ...S.placeholder,
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              {placeholder}
            </span>
          )}

          {/* Dropdown arrow */}
          {!singleSelected && (
            <span
              style={{
                marginLeft: "auto",
                color: "var(--rezvix-text-soft)",
                fontSize: 11,
                paddingLeft: 4,
                flexShrink: 0,
                pointerEvents: "none",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              ▼
            </span>
          )}

          {/* Clear button for single-selected */}
          {singleSelected && !focused && (
            <button
              type="button"
              style={S.clearBtn}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              title="Clear selection"
            >
              ×
            </button>
          )}
        </div>

        {/* ── Dropdown ────────────────────────────────────────────────── */}
        {open && (
          <div style={S.dropdown}>
            {loading && (
              <div style={S.statusRow}>
                <span style={S.spinner} />
                <span>Searching…</span>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div style={S.statusRow}>
                <span style={{ opacity: 0.55, fontSize: 15 }}>◌</span>
                {query ? "No results found." : "Type to search…"}
              </div>
            )}

            {!loading &&
              results.map((item, idx) => {
                const isSelected = selectedIds.includes(item.id);
                const isActive = idx === activeIdx;

                return (
                  <div
                    key={item.id}
                    style={S.option(isActive, isSelected)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent input blur
                      selectItem(item);
                    }}
                  >
                    <div style={S.optionLabel(isSelected)}>
                      {item.label}
                      {isSelected && (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "var(--rezvix-primary)",
                            fontSize: 11,
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    {item.sub && (
                      <div style={S.optionSub}>{item.sub}</div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </>
  );
}
