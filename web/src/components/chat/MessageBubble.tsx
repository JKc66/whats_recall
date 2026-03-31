import { Show, For } from "solid-js";
import type { Message, Reaction } from "../../types";
import { avatarColor, formatTime, extractPhone } from "../../utils";
import { FileIcon, DownloadIcon, TrashIcon, EyeIcon } from "../Icons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MessageBubbleProps {
  msg: Message;
  isGroup: boolean;
  onImageClick: (src: string) => void;
  onQuoteClick: (messageId: string) => void;
  findMessage: (stanzaId: string) => Message | undefined;
}

function groupReactions(reactions: Reaction[]) {
  const map = new Map<
    string,
    { emoji: string; count: number; senders: string[] }
  >();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.senders.push(r.sender_name || r.sender_id);
    } else {
      map.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        senders: [r.sender_name || r.sender_id],
      });
    }
  }
  return Array.from(map.values());
}

function mediaUrl(path: string) {
  return `${BASE}/api/media/${encodeURIComponent(path)}`;
}

export function MessageBubble(props: MessageBubbleProps) {
  const m = () => props.msg;
  const isMe = () => !!m().is_from_me;
  const time = () => formatTime(new Date(m().timestamp * 1000));
  const isDeleted = () => !!m().is_deleted;
  const isViewOnce = () => !!m().is_view_once;
  const phone = () => (m().sender_id ? extractPhone(m().sender_id!) : "");

  const replyData = () => {
    const msg = m();
    if (msg.quoted_stanza_id) {
      return {
        stanzaId: msg.quoted_stanza_id,
        preview: msg.quoted_preview || "",
        sender: msg.quoted_sender || "",
      };
    }
    if (msg.body?.startsWith("[Replying to: ")) {
      const newlineIndex = msg.body.indexOf("]\n\n");
      if (newlineIndex > -1) {
        return {
          stanzaId: null,
          preview: msg.body.slice(14, newlineIndex),
          sender: "",
        };
      }
    }
    return null;
  };

  const bodyText = () => {
    const msg = m();
    if (!msg.body) return "";
    if (msg.body.startsWith("[Replying to: ")) {
      const newlineIndex = msg.body.indexOf("]\n\n");
      if (newlineIndex > -1) return msg.body.slice(newlineIndex + 3);
    }
    return msg.body;
  };

  function handleQuoteClick() {
    const reply = replyData();
    if (!reply?.stanzaId) return;
    const target = props.findMessage(reply.stanzaId);
    if (target) props.onQuoteClick(target.message_id);
  }

  function renderMedia() {
    const msg = m();
    if (!msg.has_media || !msg.media_path) {
      return msg.has_media ? (
        <div class="flex items-center gap-2 p-3 bg-white/5 rounded-lg text-xs text-text-3 italic">
          <FileIcon size={14} /> {msg.type}
        </div>
      ) : null;
    }

    const src = mediaUrl(msg.media_path);
    const mt = (msg.media_type || "").toLowerCase();
    const type = msg.type;

    if (type === "image" || type === "sticker" || mt.startsWith("image/")) {
      return (
        <div
          class="group relative rounded-lg overflow-hidden my-1 max-w-[320px]"
          classList={{ "bg-transparent max-w-[180px]": type === "sticker" }}
        >
          <img
            src={src}
            alt={type === "sticker" ? "Sticker" : "Image"}
            loading="lazy"
            class="w-full cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => props.onImageClick(src)}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <Show when={type !== "sticker"}>
            <a
              href={src}
              download={msg.media_filename || "download"}
              class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-accent border border-white/10 backdrop-blur-md"
            >
              <DownloadIcon size={14} stroke-width={2.5} />
            </a>
          </Show>
        </div>
      );
    }

    if (type === "video" || mt.startsWith("video/")) {
      return (
        <div class="group relative rounded-lg overflow-hidden my-1 max-w-[320px]">
          <video
            src={src}
            controls
            preload="metadata"
            class="w-full max-h-75"
          />
          <a
            href={src}
            download={msg.media_filename || "download"}
            class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-accent border border-white/10 backdrop-blur-md"
          >
            <DownloadIcon size={14} stroke-width={2.5} />
          </a>
        </div>
      );
    }

    if (type === "audio" || type === "ptt" || mt.startsWith("audio/")) {
      return (
        <div class="flex flex-col gap-2 my-1 max-w-[320px]">
          <audio src={src} controls preload="metadata" class="w-full" />
        </div>
      );
    }

    return (
      <div class="flex items-center gap-3 p-3 bg-white/5 rounded-lg text-xs text-text-3">
        <FileIcon size={14} />
        <a
          href={src}
          target="_blank"
          rel="noopener"
          class="text-accent underline"
        >
          {msg.media_filename || "Download"}
        </a>
        <a
          href={src}
          download={msg.media_filename || "download"}
          class="ml-auto w-7 h-7 rounded-sm bg-white/10 flex items-center justify-center hover:bg-white/20"
        >
          <DownloadIcon size={14} stroke-width={2.5} />
        </a>
      </div>
    );
  }

  return (
    <div
      class="max-w-[72%] p-3 px-4 rounded-2xl relative mb-1.5 wrap-break-word shadow-sm transition-transform animate-in fade-in slide-in-from-bottom-1 duration-300"
      classList={{
        "self-start bg-zinc-850 border border-white/5 rounded-bl-sm": !isMe(),
        "self-end bg-accent/20 backdrop-blur-md border border-accent/20 rounded-br-sm shadow-[0_4px_15px_rgba(0,0,0,0.2)]":
          isMe(),
        "opacity-75 bg-red-dim/10 border-red-dim/20": isDeleted(),
        "border-l-2 border-l-violet-500": isViewOnce(),
        "mb-5": (m().reactions?.length || 0) > 0,
      }}
      data-msg-id={m().message_id}
    >
      <Show when={props.isGroup && !isMe()}>
        <div
          class="text-[12px] font-semibold mb-0.5 tracking-tight flex items-baseline gap-1.5"
          style={{ color: avatarColor(m().sender_name || phone()) }}
        >
          {m().sender_name || phone() || "Unknown"}
          <Show when={phone() && m().sender_name}>
            <span class="text-[10px] font-normal text-text-3 font-mono">
              {phone()}
            </span>
          </Show>
        </div>
      </Show>

      <Show when={!props.isGroup && !isMe() && !m().sender_name && phone()}>
        <div
          class="text-[12px] font-semibold mb-0.5 tracking-tight"
          style={{ color: avatarColor(phone()) }}
        >
          {phone()}
        </div>
      </Show>

      <Show when={isViewOnce()}>
        <div class="bg-violet-500/10 text-violet-400 text-[10.5px] font-semibold py-0.5 px-2 rounded-full mb-1 inline-flex items-center gap-1.5 border border-violet-500/20">
          <EyeIcon size={12} /> View once
        </div>
      </Show>

      <Show when={replyData()}>
        <div
          class="bg-black/10 border-l-3 border-l-accent rounded p-2 mb-1.5 text-[12.5px] text-zinc-400 overflow-hidden transition-all hover:bg-black/15 cursor-pointer"
          classList={{ "border-l-accent/50": isMe() }}
          onClick={handleQuoteClick}
        >
          <Show when={replyData()?.sender}>
            <div
              class="text-[11px] font-semibold text-accent-bright mb-px"
              classList={{ "text-accent": isMe() }}
            >
              {replyData()!.sender.split("@")[0]}
            </div>
          </Show>
          <div class="whitespace-nowrap overflow-hidden text-ellipsis opacity-85 italic">
            {replyData()!.preview || "Message"}
          </div>
        </div>
      </Show>

      {renderMedia()}

      <Show when={bodyText()}>
        <div class="text-[14px] text-zinc-100 whitespace-pre-wrap leading-relaxed">
          {bodyText()}
        </div>
      </Show>

      <Show when={isViewOnce() && !bodyText() && !m().has_media}>
        <div class="flex items-center gap-2 p-2 bg-white/5 rounded-lg text-xs text-text-3 italic">
          <EyeIcon size={14} /> View-once {m().type || "message"}
        </div>
      </Show>

      <Show when={(m().reactions?.length || 0) > 0}>
        <div
          class="absolute -bottom-3.5 flex flex-wrap gap-1 z-10"
          classList={{ "right-2": !isMe(), "left-2": isMe() }}
        >
          <For each={groupReactions(m().reactions!)}>
            {(group) => (
              <span
                class="inline-flex items-center gap-1 bg-zinc-800 border border-white/5 rounded-full px-1.5 py-0.5 shadow-md hover:scale-110 transition-transform cursor-default"
                title={group.senders.join(", ")}
              >
                <span class="text-sm">{group.emoji}</span>
                <Show when={group.count > 1}>
                  <span class="text-[10px] font-mono font-bold text-zinc-400">
                    {group.count}
                  </span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </Show>

      <div class="flex justify-end items-center gap-1.5 mt-0.5">
        <span class="text-[10px] font-mono text-zinc-500 font-medium tabular-nums opacity-60 tracking-tighter">
          {time()}
        </span>
        <Show when={isDeleted()}>
          <span class="text-[9px] font-bold text-red-500 uppercase tracking-widest px-1.5 py-px bg-red-500/10 rounded-full border border-red-500/15">
            deleted
          </span>
        </Show>
      </div>
    </div>
  );
}

export function ImageGroup(props: {
  messages: Message[];
  isGroup: boolean;
  onImageClick: (src: string) => void;
  onQuoteClick: (messageId: string) => void;
  findMessage: (stanzaId: string) => Message | undefined;
}) {
  const first = () => props.messages[0];
  const isMe = () => !!first().is_from_me;
  const time = () =>
    formatTime(
      new Date(props.messages[props.messages.length - 1].timestamp * 1000),
    );
  const phone = () =>
    first().sender_id ? extractPhone(first().sender_id!) : "";
  const imageMessages = () =>
    props.messages.filter((m) => m.has_media && m.media_path);
  const imageCount = () => imageMessages().length;

  function downloadAll() {
    imageMessages().forEach((msg, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = mediaUrl(msg.media_path!);
        link.download = msg.media_filename || `image_${index}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 200);
    });
  }

  const gridCols = () => {
    const n = imageCount();
    if (n === 1) return "grid-cols-1";
    if (n === 2) return "grid-cols-2";
    if (n === 3) return "grid-cols-2"; // 3 is handled by first child spanning rows
    return "grid-cols-2";
  };

  return (
    <div
      class="max-w-110 p-3 px-4 rounded-2xl relative mb-1.5 shadow-sm animate-in fade-in duration-300"
      classList={{
        "self-start bg-zinc-850 border border-white/5 rounded-bl-sm": !isMe(),
        "self-end bg-accent/20 backdrop-blur-md border border-accent/20 rounded-br-sm":
          isMe(),
        "mb-5": props.messages.some(
          (m) => m.reactions && m.reactions.length > 0,
        ),
      }}
      data-msg-id={first().message_id}
    >
      <Show when={props.isGroup && !isMe()}>
        <div
          class="text-[12px] font-semibold mb-1.5 tracking-tight"
          style={{ color: avatarColor(first().sender_name || phone()) }}
        >
          {first().sender_name || phone() || "Unknown"}
        </div>
      </Show>

      <div class={`grid gap-0.5 rounded-lg overflow-hidden my-1 ${gridCols()}`}>
        <For each={imageMessages()}>
          {(msg, idx) => (
            <div
              class="relative aspect-square cursor-pointer overflow-hidden group"
              classList={{
                "opacity-60 grayscale": !!msg.is_deleted,
                "row-span-2 aspect-auto": imageCount() === 3 && idx() === 0,
              }}
            >
              <img
                src={mediaUrl(msg.media_path!)}
                alt="Image"
                loading="lazy"
                class="w-full h-full object-cover transition-opacity hover:opacity-90"
                onClick={() => props.onImageClick(mediaUrl(msg.media_path!))}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <a
                href={mediaUrl(msg.media_path!)}
                download={msg.media_filename || "download"}
                class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-accent border border-white/5 backdrop-blur-sm z-10"
              >
                <DownloadIcon size={12} stroke-width={2.5} />
              </a>
              <Show when={!!msg.is_deleted}>
                <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span class="bg-black/60 px-2 py-1 rounded text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md border border-white/10">
                    <TrashIcon size={10} /> Deleted
                  </span>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      <Show when={first().body}>
        <div class="text-[14px] text-zinc-100 whitespace-pre-wrap leading-relaxed px-0.5 pt-1">
          {first().body}
        </div>
      </Show>

      <div class="flex justify-between items-center gap-1.5 mt-2">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-zinc-500 font-medium">
            {imageCount()} photos
          </span>
          <Show when={imageCount() > 1}>
            <button
              class="inline-flex items-center gap-1 bg-white/5 hover:bg-accent-muted border border-white/10 rounded-full px-2 py-0.5 text-[9px] font-bold text-zinc-400 hover:text-accent transition-all uppercase tracking-wide"
              onClick={downloadAll}
            >
              <DownloadIcon size={10} stroke-width={2.5} /> Album
            </button>
          </Show>
        </div>
        <span class="text-[10px] font-mono text-zinc-500 font-medium tabular-nums opacity-60">
          {time()}
        </span>
      </div>

      <Show
        when={props.messages.some((m) => m.reactions && m.reactions.length > 0)}
      >
        <div
          class="absolute -bottom-3.5 flex flex-wrap gap-1 z-10"
          classList={{ "right-2": !isMe(), "left-2": isMe() }}
        >
          <For
            each={groupReactions(
              props.messages.flatMap((m) => m.reactions || []),
            )}
          >
            {(group) => (
              <span
                class="inline-flex items-center gap-1 bg-zinc-800 border border-white/5 rounded-full px-1.5 py-0.5 shadow-md hover:scale-110 transition-transform cursor-default"
                title={group.senders.join(", ")}
              >
                <span class="text-sm">{group.emoji}</span>
                <Show when={group.count > 1}>
                  <span class="text-[10px] font-mono font-bold text-zinc-400">
                    {group.count}
                  </span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
