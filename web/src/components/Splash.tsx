"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { safeCallbackPath } from "@/lib/safe-redirect";

export default function Splash() {
  const params = useSearchParams();
  const callbackUrl = safeCallbackPath(params.get("callbackUrl"));
  const signInFailed = params.has("error");
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md panel p-8 text-center">
        <div className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">
          Echo
        </div>
        <p className="text-white/70 mb-6">Sign in to start echoing.</p>
        {signInFailed ? (
          <p className="mb-4 rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">
            Sign-in failed. Please try again.
          </p>
        ) : null}
        <button onClick={() => signIn("github", { callbackUrl })} className="btn-primary inline-block">
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
