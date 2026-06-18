import React from "react";

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({ label, hint, error, required, children }: FormFieldProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        marginBottom: 14,
      }}
    >
      {/* Label row */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--rezvix-text-muted)",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        {label}
        {required && (
          <span
            style={{
              color: "var(--rezvix-danger)",
              fontSize: 13,
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            *
          </span>
        )}
      </label>

      {/* Input slot */}
      <div style={{ width: "100%" }}>{children}</div>

      {/* Hint / Error */}
      {(hint || error) && (
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.4,
            color: error ? "var(--rezvix-danger)" : "var(--rezvix-text-soft)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {error ? (
            <>
              <span style={{ fontSize: 12, lineHeight: 1 }}>&#9888;</span>
              {error}
            </>
          ) : (
            hint
          )}
        </div>
      )}
    </div>
  );
}
