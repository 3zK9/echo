"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
};

type ConfirmContextType = {
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [options, setOptions] = useState<ConfirmOptions>({});
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((msg: string, opts?: ConfirmOptions) => {
    setMessage(msg);
    setOptions(opts || {});
    lastActiveRef.current = (document.activeElement as HTMLElement) || null;
    setOpen(true);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }, []);

  const close = useCallback((val: boolean) => {
    setOpen(false);
    if (resolver) resolver(val);
    setResolver(null);
    // Restore focus to the previously focused element
    if (lastActiveRef.current) {
      setTimeout(() => lastActiveRef.current?.focus(), 0);
      lastActiveRef.current = null;
    }
  }, [resolver]);

  // Focus management and keyboard handling
  useEffect(() => {
    if (!open) return;
    // Focus the primary action by default
    const toFocus = confirmRef.current || cancelRef.current;
    toFocus?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      } else if (e.key === "Tab") {
        // Simple focus trap between the two buttons
        const focusables: (HTMLElement | null)[] = [cancelRef.current, confirmRef.current];
        const elements = focusables.filter(Boolean) as HTMLElement[];
        if (elements.length === 0) return;
        const idx = elements.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey) {
          // back tab
          const next = idx <= 0 ? elements.length - 1 : idx - 1;
          e.preventDefault();
          elements[next]?.focus();
        } else {
          // forward tab
          const next = idx === -1 || idx >= elements.length - 1 ? 0 : idx + 1;
          e.preventDefault();
          elements[next]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => close(false)} />
          <div role="dialog" aria-modal="true" className="relative panel w-full max-w-sm p-5">
            {options.title && (
              <div className="text-lg font-semibold mb-1">{options.title}</div>
            )}
            <div className="text-sm text-white/80 mb-4">{options.description || message}</div>
            <div className="flex justify-end gap-2">
              <button
                ref={cancelRef}
                onClick={() => close(false)}
                className="px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 text-sm font-semibold"
              >
                {options.cancelText || "Cancel"}
              </button>
              <button
                ref={confirmRef}
                onClick={() => close(true)}
                className="btn-primary px-4 py-2"
              >
                {options.confirmText || "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
