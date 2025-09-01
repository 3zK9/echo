"use client";

import React, { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ReplyIcon, RetweetIcon, HeartIcon, UploadIcon, TrashIcon } from "@/components/icons";
import { prefetchProfile, prefetchProfileMetaToLocal } from "@/lib/prefetch";
import * as PrismNS from "prismjs";
// Core/common
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup"; // html/xml/svg
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
// Data / scripting
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
// General purpose
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-r";
import "prismjs/components/prism-ocaml";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-matlab";
import "prismjs/components/prism-objectivec";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-scala";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-php";
import "prismjs/components/prism-haskell";
import "prismjs/components/prism-lisp";
import "prismjs/components/prism-scheme";
import "prismjs/components/prism-elixir";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-shell-session";

const PrismLib: any = (PrismNS as any).default || PrismNS;

// Register common aliases so DOM-based highlighting recognizes our tags
const aliasMap: Record<string, string> = {
  js: "javascript", jsx: "jsx",
  ts: "typescript", tsx: "tsx",
  yml: "yaml", md: "markdown",
  html: "markup", xml: "markup", svg: "markup",
  sh: "bash", zsh: "bash", shell: "bash",
  py: "python", py3: "python", python3: "python",
  rb: "ruby", pl: "perl", ml: "ocaml",
  r: "r",
  "c++": "cpp", "c#": "csharp", cs: "csharp",
  objc: "objectivec", "objective-c": "objectivec", objectivec: "objectivec",
  "obj-c": "objectivec", "obj-c++": "objectivec", "objective-c++": "objectivec", "objc++": "objectivec", mm: "objectivec",
  octave: "matlab",
  ps: "powershell", ps1: "powershell",
  console: "shell-session",
  kt: "kotlin",
  rs: "rust",
  sbt: "scala",
};

try {
  const langs = PrismLib.languages as any;
  Object.entries(aliasMap).forEach(([alias, base]) => {
    const a = alias.toLowerCase();
    const b = base.toLowerCase();
    if (!langs[a] && langs[b]) langs[a] = langs[b];
  });
} catch {}

function highlight(code: string, lang?: string): string {
  const l = (lang || "").toLowerCase();
  const map: Record<string, string> = {
    // Core
    js: "javascript", javascript: "javascript", jsx: "jsx",
    ts: "typescript", typescript: "typescript", tsx: "tsx",
    json: "json", bash: "bash", sh: "bash",
    yaml: "yaml", yml: "yaml", md: "markdown", markdown: "markdown",
    html: "markup", xml: "markup", svg: "markup",
    css: "css",
    // Popular
    py: "python", python: "python", py3: "python", python3: "python", sql: "sql",
    rb: "ruby", ruby: "ruby",
    pl: "perl", perl: "perl",
    r: "r",
    ml: "ocaml", ocaml: "ocaml",
    java: "java",
    c: "c",
    'c++': "cpp", cpp: "cpp",
    'c#': "csharp", csharp: "csharp", cs: "csharp",
    go: "go",
    rs: "rust", rust: "rust",
    matlab: "matlab",
    octave: "matlab",
    objc: "objectivec", "objective-c": "objectivec", objectivec: "objectivec",
    "obj-c": "objectivec", "obj-c++": "objectivec", "objective-c++": "objectivec", "objc++": "objectivec", mm: "objectivec",
    scala: "scala",
    kt: "kotlin", kotlin: "kotlin",
    php: "php",
    hs: "haskell", haskell: "haskell",
    lisp: "lisp",
    racket: "scheme",
    elixir: "elixir", ex: "elixir", exs: "elixir",
    dart: "dart",
    lua: "lua",
    sbt: "scala",
    zsh: "bash", shell: "bash",
    powershell: "powershell", ps: "powershell", ps1: "powershell",
    "shell-session": "shell-session", console: "shell-session",
    swift: "swift",
  };
  const alias = map[l] || "javascript";
  const grammar = (PrismLib.languages as any)[alias] || PrismLib.languages.javascript;
  try {
    const html = PrismLib.highlight(code, grammar, alias);
    if (html && html.includes("token")) return html;
  } catch {
    // fallthrough to basic fallback
  }
  // Fallback minimal highlighter (very lightweight)
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let src = esc(code);
  if (alias === 'python') {
    src = src
      .replace(/(#.*)$/gm, '<span class="tok-cmt">$1<\/span>')
      .replace(/\b(def|class|if|elif|else|for|while|try|except|finally|raise|return|with|lambda|yield|pass|break|continue|and|or|not|in|is|import|from|as)\b/g, '<span class="tok-kw">$1<\/span>')
      .replace(/(['"])((?:\\.|(?!\1).)*)\1/g, '<span class="tok-str">$&<\/span>')
      .replace(/\b(True|False|None)\b/g, '<span class="tok-lit">$1<\/span>')
      .replace(/\b\d+(?:\.\d+)?\b/g, '<span class="tok-num">$&<\/span>');
    return src;
  }
  // default js-like
  src = src
    .replace(/\/(?:\*[^]*?\*\/|\/\/.*)/g, '<span class="tok-cmt">$&<\/span>')
    .replace(/\b(import|export|from|as|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|return|new|class|extends|super|this|function|const|let|var|typeof|instanceof|in|of|void|yield|async|await|delete)\b/g, '<span class="tok-kw">$1<\/span>')
    .replace(/(['\"])((?:\\.|(?!\1).)*)\1/g, '<span class="tok-str">$&<\/span>')
    .replace(/`(?:\\.|[^`])*`/g, '<span class="tok-str">$&<\/span>')
    .replace(/\b(?:true|false|null|undefined|NaN|Infinity)\b/g, '<span class="tok-lit">$&<\/span>')
    .replace(/0x[0-9a-fA-F]+|\b\d+(?:\.\d+)?\b/g, '<span class="tok-num">$&<\/span>');
  return src;
}

function renderMarkdownWithCode(input: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < input.length) {
    const start = input.indexOf("```", i);
    if (start === -1) {
      out.push(renderInlineText(input.slice(i)));
      break;
    }
    if (start > i) out.push(renderInlineText(input.slice(i, start)));
    // Parse language token
    let j = start + 3;
    while (j < input.length && /[A-Za-z0-9#+._-]/.test(input[j])) j++;
    const lang = input.slice(start + 3, j);
    if (input[j] === ' ') j++;
    let bodyStart = j;
    let end = -1;
    if (input[j] === '\n') {
      bodyStart = j + 1;
    }
    end = input.indexOf("```", bodyStart);
    if (end === -1) {
      // No closing fence; treat as text
      out.push(renderInlineText(input.slice(start)));
      break;
    }
    const body = input.slice(bodyStart, end).replace(/\n$/, "");
    const cls = `language-${(lang || "").toLowerCase() || "javascript"}`;
    const codeHtml = highlight(body, lang);
    out.push(
      <pre className={`code-block ${cls}`} key={`code-${start}`}>
        <code className={cls} dangerouslySetInnerHTML={{ __html: codeHtml }} />
      </pre>
    );
    i = end + 3;
  }
  return out;
}

function renderInlineText(input: string) {
  // Split by lines and apply mention links and inline code
  const lines = input.split(/\n/);
  return (
    <>
      {lines.map((line, i) => (
        <p key={`p-${i}`} className="whitespace-pre-wrap break-words">
          {renderMentionsAndInlineCode(line)}
        </p>
      ))}
    </>
  );
}

function renderMentionsAndInlineCode(input: string) {
  const parts: React.ReactNode[] = [];
  const codeRe = /`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = codeRe.exec(input))) {
    const [full, code] = match;
    if (match.index > last) parts.push(renderMentions(input.slice(last, match.index)));
    parts.push(<code key={`ic-${match.index}`} className="code-inline">{code}</code>);
    last = match.index + full.length;
  }
  if (last < input.length) parts.push(renderMentions(input.slice(last)));
  return parts;
}

function renderMentions(input: string) {
  const parts: React.ReactNode[] = [];
  const regex = /@([a-z0-9_]{1,15})/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input))) {
    const [full, handle] = match;
    if (match.index > lastIndex) parts.push(input.slice(lastIndex, match.index));
    parts.push(
      <Link
        key={`${handle}-${match.index}`}
        prefetch
        href={`/profile/${encodeURIComponent(handle)}`}
        onMouseEnter={() => { prefetchProfile(handle); prefetchProfileMetaToLocal(handle); }}
        className="text-sky-500 hover:underline"
      >
        {full}
      </Link>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < input.length) parts.push(input.slice(lastIndex));
  return parts;
}

export type Echo = {
  id: string;
  name: string;
  handle: string;
  time: string;
  text: string;
  likes: number;
  reposts: number;
  liked?: boolean;
  reposted?: boolean;
  avatarUrl?: string;
  originalId?: string;
  isRepost?: boolean;
  canDelete?: boolean;
};

function EchoItem({
  t,
  onLike,
  onRepost,
  onShare,
  repostedByMe,
  likesCount,
  repostsCount,
  likedByMe,
  onReply,
  onDelete,
}: {
  t: Echo;
  onLike?: (id: string) => void;
  onRepost?: (id: string) => void;
  onShare?: (id: string) => void;
  repostedByMe?: boolean;
  likesCount?: number;
  repostsCount?: number;
  likedByMe?: boolean;
  onReply?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { data: session } = useSession();
  const isMine = t.canDelete || (session?.user?.username && t.handle === session.user.username);

  const renderText = (input: string) => renderMarkdownWithCode(input);
  
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
        {(t.isRepost || repostedByMe) && (
          <div className="-mt-1 mb-1 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <RetweetIcon className="w-4 h-4" />
            <span>
              {t.isRepost
                ? (isMine ? "Reposted by You" : "Reposted")
                : "You reposted"}
            </span>
          </div>
        )}
        <header className="flex items-center gap-2 text-sm">
          <span className="font-semibold truncate">{t.name}</span>
          <span className="text-black/50 dark:text-white/50 truncate">
            <Link
              prefetch
              href={`/profile/${encodeURIComponent(t.handle)}`}
              onMouseEnter={() => { prefetchProfile(t.handle); prefetchProfileMetaToLocal(t.handle); }}
              className="text-sky-500 hover:underline"
            >
              @{t.handle}
            </Link> · {t.time}
          </span>
        </header>
        <div className="mt-1 space-y-2">{renderText(t.text)}</div>
        <div className="mt-3 flex items-center gap-6 text-black/60 dark:text-white/60 text-sm">
          <button type="button" onClick={() => onReply?.(t.id)} className="inline-flex items-center gap-2 hover:text-sky-500">
            <ReplyIcon className="w-5 h-5 rotate-180" />
            <span className="sr-only">Reply</span>
          </button>
          <button
            type="button"
            onClick={() => onRepost?.(t.id)}
            className={`inline-flex items-center gap-2 hover:text-green-500 ${repostedByMe ? "text-green-600" : ""}`}
            aria-pressed={!!repostedByMe}
          >
            <RetweetIcon className="w-5 h-5" />
            {repostsCount && repostsCount > 0 ? repostsCount : ""}
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
          {isMine && !t.isRepost && (
            <button type="button" onClick={() => onDelete?.(t.id)} className="inline-flex items-center gap-2 hover:text-red-500">
              <TrashIcon className="w-5 h-5" />
              <span className="sr-only">Delete</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default React.memo(EchoItem);
