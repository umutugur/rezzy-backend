import React from "react";
import { useI18n } from "../i18n";

export default function Modal({
  open,
  onClose,
  children,
  title
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="modal-backdrop z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="modal-panel max-w-full w-[520px]" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">{title || t("Detay")}</h3>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
