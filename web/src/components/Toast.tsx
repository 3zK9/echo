"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: string; message: string };

type ToastContextType = {
  show: (message: string, timeoutMs?: number) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, timeoutMs = 1800) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), timeoutMs);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 inset-x-0 pointer-events-none flex justify-center z-50">
        <div className="space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto rounded-full px-4 py-2 bg-black text-white dark:bg-white dark:text-black shadow-md text-sm"
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

