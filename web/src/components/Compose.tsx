"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

const MAX_LEN = 280;

export default function Compose({ onPost, initialText = "" }: { onPost?: (text: string) => void; initialText?: string }) {
  const [text, setText] = useState(initialText.slice(0, MAX_LEN));
  const { data: session } = useSession();
  const avatar = session?.user?.image || "https://api.dicebear.com/9.x/identicon/png?seed=echo";
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#compose") {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const next = initialText.slice(0, MAX_LEN);
    setText(next);
    if (next) inputRef.current?.focus();
  }, [initialText]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onPost?.(trimmed);
    setText("");
  };

  const nearLimit = text.length >= MAX_LEN - 40 && text.length < MAX_LEN;
  const atLimit = text.length >= MAX_LEN;
  const counterClass = atLimit
    ? "text-red-500 font-semibold"
    : nearLimit
      ? "text-amber-400"
      : "text-white/50";

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-white/10">
      <div className="shrink-0">
        <Image src={avatar} alt="avatar" width={40} height={40} className="rounded-full" />
      </div>
      <div className="flex-1">
        <textarea
          id="compose"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          placeholder="Echo Something?!"
          rows={3}
          maxLength={MAX_LEN}
          className="w-full resize-none bg-transparent outline-none placeholder:text-black/50 dark:placeholder:text-white/50"
        />
        <div className="flex items-center justify-between mt-2">
          <div className={`text-sm ${counterClass}`} aria-live="polite">{text.length}/{MAX_LEN}</div>
          <button onClick={submit} className="btn-primary px-4 py-2">Echo</button>
        </div>
      </div>
    </div>
  );
}
