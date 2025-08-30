"use client";

import { SessionProvider } from "next-auth/react";
import { EchoesProvider } from "@/state/echoes";
import { ToastProvider } from "@/components/Toast";
import { ProfileProvider } from "@/state/profile";
import { ConfirmProvider } from "@/components/Confirm";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <EchoesProvider>
        <ProfileProvider>
          <ToastProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </ToastProvider>
        </ProfileProvider>
      </EchoesProvider>
    </SessionProvider>
  );
}
