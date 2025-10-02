import React from "react";

type ToastMsg = { message: string; type?: "info" | "success" | "error" };

export function showToast(message: string, type: ToastMsg["type"] = "info") {
  window.dispatchEvent(new CustomEvent<ToastMsg>("toast:show", { detail: { message, type } }));
}

export default function ToastHost() {
  const [toasts, setToasts] = React.useState<Array<ToastMsg & { id: number }>>([]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ToastMsg>;
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, ...ce.detail }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    };
    window.addEventListener("toast:show", handler);
    return () => window.removeEventListener("toast:show", handler);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "rounded-xl px-4 py-2 shadow-soft text-sm " +
            (t.type === "success"
              ? "bg-green-600 text-white"
              : t.type === "error"
              ? "bg-red-600 text-white"
              : "bg-gray-900 text-white")
          }
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
