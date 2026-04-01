import { Show, For, createMemo, createSignal } from "solid-js";
import type { Message, Reaction } from "../../types";
import { avatarColor, formatTime, extractPhone, mediaUrl } from "../../utils";
import { FileIcon, DownloadIcon, TrashIcon, EyeIcon, ImageIcon, VideoIcon, MusicIcon, CheckIcon } from "../Icons";
import { notify } from "../../notify";

interface MessageBubbleProps {
  msg: Message;
  isGroup: boolean;
  onImageClick: (_src: string) => void;
  onQuoteClick: (_messageId: string) => void;
  findMessage: (_stanzaId: string) => Message | undefined;
  highlightQuery?: string;
}

function HighlightedText(props: { text: string; query?: string }) {
  const query = createMemo(() => props.query?.trim() || "");
  
  const parts = createMemo(() => {
    const q = query();
    if (!q) return [props.text];
    return props.text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  });
  
  return (
    <Show when={query()} fallback={<span>{props.text}</span>}>
      <span>
        <For each={parts()}>
          {(part) => (
            part.toLowerCase() === query().toLowerCase() 
              ? <mark class="bg-accent/40 text-inherit rounded-sm px-0.5 border-b-2 border-accent/60">{part}</mark> 
              : part
          )}
        </For>
      </span>
    </Show>
  );
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
export function MessageBubble(props: MessageBubbleProps) {
  const m = () => props.msg;
  const isMe = () => !!m().is_from_me;
  const time = () => formatTime(new Date(m().timestamp * 1000));
  const isDeleted = () => !!m().is_deleted;
  const isViewOnce = () => !!m().is_view_once;
  const phone = () => (m().sender_id ? extractPhone(m().sender_id!) : "");
  const [showHistory, setShowHistory] = createSignal(false);

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

  const formattedReply = () => {
    const data = replyData();
    if (!data) return null;
    const previewRaw = data.preview || "Message";
    const lower = previewRaw.toLowerCase();
    
    const hasPhoto = lower.includes("photo") || lower.includes("image");
    const hasVideo = lower.includes("video");
    const hasAudio = lower.includes("audio") || lower.includes("ptt");
    const hasSticker = lower.includes("sticker");
    const hasViewOnce = previewRaw.includes("👁️") || lower.includes("view once");
    
    let p = previewRaw.replace(/👁️/g, "").trim();
    p = p.replace(/\s*\(\s*view once\s*\)\s*/gi, "").trim();
    p = p.replace(/\s*view once\s*/gi, "").trim();
    p = p.replace(/\[?(image|video|audio|document|sticker)(Message)?\]?/gi, "").trim();
    p = p.replace(/^\(\)\s*/, "").replace(/^\[\]\s*/, "").trim();
    p = p.replace(/^[-\s]+|[|-\s]+$/g, "").trim();
    
    const finalLabel = p || (hasPhoto ? "Photo" : hasVideo ? "Video" : hasAudio ? "Audio" : hasSticker ? "Sticker" : "Message");
    
    return {
      sender: data.sender,
      hasPhoto: hasPhoto && !hasSticker,
      hasVideo,
      hasAudio,
      hasSticker,
      hasViewOnce,
      label: finalLabel,
      stanzaId: data.stanzaId,
    };
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
      return (msg.has_media && msg.type !== 'chat') ? (
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
              aria-label="Download image"
              class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-white/10 backdrop-blur-md outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-zinc-900"
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
            aria-label="Download video"
            class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-white/10 backdrop-blur-md outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-zinc-900"
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
          aria-label="Download file"
          class="ml-auto w-7 h-7 rounded-sm bg-white/10 flex items-center justify-center hover:bg-white/20 focus-visible:bg-accent focus-visible:text-white outline-none"
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

      <Show when={formattedReply()}>
        <div
          class="relative bg-zinc-900/60 rounded-lg p-2.5 pl-3.5 mb-2 text-[12px] text-zinc-400 overflow-hidden transition-all hover:bg-zinc-800/80 cursor-pointer group/reply border border-white/5 outline-none focus-visible:ring-1 ring-accent/50"
          onClick={handleQuoteClick}
          role="button"
          tabindex="0"
          aria-label={`Reply to ${formattedReply()?.sender || 'message'}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleQuoteClick();
            }
          }}
        >
          <div 
            class="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l-lg"
            classList={{ "bg-accent/50": isMe() }}
          />
          <Show when={formattedReply()?.sender}>
            <div
              class="text-[11px] font-bold text-accent-bright mb-0.5 uppercase tracking-wider opacity-90 group-hover/reply:opacity-100"
              classList={{ "text-accent": isMe() }}
            >
              {formattedReply()!.sender.split("@")[0]}
            </div>
          </Show>
          <div class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis opacity-80 group-hover/reply:opacity-100 transition-opacity">
            <Show when={formattedReply()!.hasPhoto}>
              <ImageIcon size={12} class="shrink-0 text-accent/70" />
            </Show>
            <Show when={formattedReply()!.hasVideo}>
              <VideoIcon size={12} class="shrink-0 text-accent/70" />
            </Show>
            <Show when={formattedReply()!.hasAudio}>
              <MusicIcon size={12} class="shrink-0 text-accent/70" />
            </Show>
            <Show when={formattedReply()!.hasSticker}>
              <ImageIcon size={12} class="shrink-0 text-accent/70 opacity-50" />
            </Show>
            <Show when={formattedReply()!.hasViewOnce}>
              <EyeIcon size={12} class="shrink-0 text-violet-400" />
            </Show>
            <span class="truncate">{formattedReply()!.label}</span>
          </div>
        </div>
      </Show>

      {renderMedia()}

      <Show when={bodyText()}>
        <div class="text-[14px] text-zinc-100 whitespace-pre-wrap leading-relaxed">
          <HighlightedText text={bodyText()} query={props.highlightQuery} />
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
        <Show when={m().edits?.length}>
          <button
            onClick={() => setShowHistory(!showHistory())}
            class="text-[9px] font-bold text-accent uppercase tracking-widest px-1.5 py-px bg-accent/10 rounded-full border border-accent/15 hover:bg-accent/20 transition-colors"
          >
            {showHistory() ? "Hide History" : `${m().edits!.length} edits`}
          </button>
        </Show>
      </div>

      <Show when={showHistory() && m().edits?.length}>
        <div class="mt-3 space-y-2.5 border-t border-white/5 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <For each={m().edits}>
            {(edit) => (
              <div class="bg-black/20 rounded-lg p-2.5 border border-white/5 relative group/edit overflow-hidden">
                <div class="absolute left-0 top-0 bottom-0 w-0.5 bg-zinc-700 opacity-30 group-hover/edit:opacity-100 transition-opacity" />
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                    Previous Version
                  </span>
                  <span class="text-[9px] font-mono text-zinc-600 opacity-80 tabular-nums">
                    {formatTime(new Date(edit.edited_at))}
                  </span>
                </div>
                <div class="text-[13px] text-zinc-400 line-through opacity-60 leading-relaxed italic wrap-break-word">
                  {edit.old_body}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function ImageGroup(props: {
  messages: Message[];
  isGroup: boolean;
  onImageClick: (_src: string) => void;
  onQuoteClick: (_messageId: string) => void;
  findMessage: (_stanzaId: string) => Message | undefined;
  highlightQuery?: string;
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

  const [isDownloading, setIsDownloading] = createSignal(false);
  function downloadAll() {
    if (isDownloading()) return;
    setIsDownloading(true);
    notify.info("Starting download...", `${imageCount()} photos`);
    
    imageMessages().forEach((msg, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = mediaUrl(msg.media_path!);
        link.download = msg.media_filename || `image_${index}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        if (index === imageMessages().length - 1) {
          setTimeout(() => setIsDownloading(false), 2000);
        }
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
                aria-label="Download photo"
                class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-white/5 backdrop-blur-sm z-10 outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-zinc-900"
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
          <HighlightedText text={first().body!} query={props.highlightQuery} />
        </div>
      </Show>

      <div class="flex justify-between items-center gap-1.5 mt-2">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-zinc-500 font-medium">
            {imageCount()} photos
          </span>
          <Show when={imageCount() > 1}>
            <button
              class="inline-flex items-center gap-1 bg-white/5 hover:bg-accent-muted border border-white/10 rounded-full px-2 py-0.5 text-[9px] font-bold text-zinc-400 hover:text-accent transition-all uppercase tracking-wide outline-none focus-visible:ring-1 ring-accent"
              onClick={downloadAll}
              aria-label={`Download all ${imageCount()} photos`}
              disabled={isDownloading()}
            >
              <Show when={isDownloading()} fallback={<DownloadIcon size={10} stroke-width={2.5} />}>
                <CheckIcon size={10} class="text-emerald-500 animate-in zoom-in duration-300" />
              </Show> 
              {isDownloading() ? "Downloaded" : "Album"}
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
