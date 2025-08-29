"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function Splash() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md panel p-8 text-center">
        <div className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">
          Echo
        </div>
        <p className="text-white/70 mb-6">Sign in to start echoing.</p>
        <button onClick={() => signIn("github", { callbackUrl })} className="btn-primary inline-block">
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
