import React from "react";

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4">
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>}
      {children}
    </div>
  );
}

export function Stat({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {helper && <div className="text-xs text-gray-500 mt-1">{helper}</div>}
    </div>
  );
}
