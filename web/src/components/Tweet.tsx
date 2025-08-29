"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ReplyIcon, RetweetIcon, HeartIcon, UploadIcon } from "@/components/icons";

export type Tweet = {
  id: string;
  name: string;
  handle: string;
  time: string;
  text: string;
  likes: number;
  retweets: number;
  liked?: boolean;
  retweeted?: boolean;
  avatarUrl?: string;
  originalId?: string;
  isRetweet?: boolean;
};

export default function TweetItem({
  t,
  onLike,
  onRetweet,
  onShare,
  retweetedByMe,
  likesCount,
  retweetsCount,
  likedByMe,
  onReply,
}: {
  t: Tweet;
  onLike?: (id: string) => void;
  onRetweet?: (id: string) => void;
  onShare?: (id: string) => void;
  retweetedByMe?: boolean;
  likesCount?: number;
  retweetsCount?: number;
  likedByMe?: boolean;
  onReply?: (id: string) => void;
}) {
  const { data: session } = useSession();
  const isMine = session?.user?.username && t.handle === session.user.username;

  const renderText = (input: string) => {
    const parts: React.ReactNode[] = [];
    const regex = /@([a-z0-9_]{1,15})/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input))) {
      const [full, handle] = match;
      if (match.index > lastIndex) {
        parts.push(input.slice(lastIndex, match.index));
      }
      parts.push(
        <Link
          key={`${handle}-${match.index}`}
          href={`/profile/${encodeURIComponent(handle)}`}
          className="text-sky-500 hover:underline"
        >
          {full}
        </Link>
      );
      lastIndex = match.index + full.length;
    }
    if (lastIndex < input.length) parts.push(input.slice(lastIndex));
    return parts;
  };
  return (
    <article id={`t-${t.id}`} className="flex gap-3 px-4 py-4 border-b border-white/10 hover:bg-white/5 transition">
      <div className="shrink-0">
        <Image
          src={
            t.avatarUrl ||
            `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent(t.handle)}`
          }
          alt="avatar"
          width={40}
          height={40}
          className="rounded-full bg-black/5 dark:bg-white/10"
        />
      </div>
      <div className="flex-1 min-w-0">
        {t.isRetweet && (
          <div className="-mt-1 mb-1 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <RetweetIcon className="w-4 h-4" />
            <span>{isMine ? "Retweeted by You" : "Retweeted"}</span>
          </div>
        )}
        <header className="flex items-center gap-2 text-sm">
          <span className="font-semibold truncate">{t.name}</span>
          <span className="text-black/50 dark:text-white/50 truncate">
            <Link href={`/profile/${encodeURIComponent(t.handle)}`} className="hover:underline">@{t.handle}</Link> · {t.time}
          </span>
        </header>
        <p className="mt-1 whitespace-pre-wrap break-words">{renderText(t.text)}</p>
        <div className="mt-3 flex items-center gap-6 text-black/60 dark:text-white/60 text-sm">
          <button type="button" onClick={() => onReply?.(t.id)} className="inline-flex items-center gap-2 hover:text-sky-500">
            <ReplyIcon className="w-5 h-5 rotate-180" />
            <span className="sr-only">Reply</span>
          </button>
          <button
            type="button"
            onClick={() => onRetweet?.(t.id)}
            className={`inline-flex items-center gap-2 hover:text-green-500 ${retweetedByMe ? "text-green-600" : ""}`}
            aria-pressed={!!retweetedByMe}
          >
            <RetweetIcon className="w-5 h-5" />
            {retweetsCount && retweetsCount > 0 ? retweetsCount : ""}
          </button>
          <button
            type="button"
            onClick={() => onLike?.(t.id)}
            className={`inline-flex items-center gap-2 hover:text-pink-500 ${likedByMe ? "text-pink-600" : ""}`}
            aria-pressed={!!likedByMe}
          >
            <HeartIcon className="w-5 h-5" />
            {likesCount && likesCount > 0 ? likesCount : ""}
          </button>
          <button type="button" onClick={() => onShare?.(t.id)} className="inline-flex items-center gap-2 hover:text-sky-500 ml-auto">
            <UploadIcon className="w-5 h-5" />
            <span className="sr-only">Share</span>
          </button>
        </div>
      </div>
    </article>
  );
}
