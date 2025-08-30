"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export default function Compose({ onPost, initialText = "" }: { onPost?: (text: string) => void; initialText?: string }) {
  const [text, setText] = useState(initialText);
  const { data: session } = useSession();
  const avatar = session?.user?.image || "https://api.dicebear.com/9.x/identicon/png?seed=echo";
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#compose") {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    setText(initialText);
    if (initialText) inputRef.current?.focus();
  }, [initialText]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onPost?.(trimmed);
    setText("");
  };

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
          onChange={(e) => setText(e.target.value)}
          placeholder="Echo Something?!"
          rows={3}
          className="w-full resize-none bg-transparent outline-none placeholder:text-black/50 dark:placeholder:text-white/50"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="text-sm text-white/50">140 characters max</div>
          <button onClick={submit} className="btn-primary px-4 py-2">Echo</button>
        </div>
      </div>
    </div>
  );
}
