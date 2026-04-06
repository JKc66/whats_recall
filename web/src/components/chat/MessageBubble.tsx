import { Show, For, createMemo, createSignal } from "solid-js";
import type { Message, Reaction } from "../../types";
import { avatarColor, formatTime, extractJidId, mediaUrl } from "../../utils";
import { 
  FileIcon, 
  GalleryBrokenIcon,
  DownloadIcon, 
  TrashIcon, 
  EyeIcon, 
  ImageIcon, 
  VideoIcon, 
  MusicIcon, 
  CheckIcon,
  EditIcon
} from "../Icons";
import { notify } from "../../notify";
import AudioPlayer from "./AudioPlayer";
import VideoNotePlayer from "./VideoNotePlayer";

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
  const time = createMemo(() => formatTime(new Date(m().timestamp * 1000)));
  const isDeleted = () => !!m().is_deleted;
  const isViewOnce = () => !!m().is_view_once;
  const phone = createMemo(() => (m().sender_id ? extractJidId(m().sender_id!) : ""));
  const avatarCol = createMemo(() => avatarColor(m().sender_name || phone()));
  const phoneAvatarCol = createMemo(() => avatarColor(phone()));
  const groupedReactions = createMemo(() => groupReactions(m().reactions || []));
  const [showHistory, setShowHistory] = createSignal(false);

  const replyData = createMemo(() => {
    const msg = m();
    if (msg.quoted_stanza_id) {
      return {
        stanzaId: msg.quoted_stanza_id,
        preview: msg.quoted_preview || "",
        sender: msg.quoted_sender || "",
      };
    }
    return null;
  });

  const formattedReply = createMemo(() => {
    const data = replyData();
    if (!data) return null;
    const previewRaw = data.preview || "Message";
    const lower = previewRaw.toLowerCase();

    const hasPhoto = lower.includes("photo") || lower.includes("image");
    const hasVideo = lower.includes("video") || lower.includes("ptv");
    const hasAudio = lower.includes("audio") || lower.includes("ptt");
    const hasSticker = lower.includes("sticker");
    const hasViewOnce = previewRaw.includes("👁️") || lower.includes("view once");

    return {
      sender: data.sender,
      hasPhoto,
      hasVideo,
      hasAudio,
      hasSticker,
      hasViewOnce,
      label: previewRaw,
      stanzaId: data.stanzaId,
    };
  });

  const bodyText = createMemo(() => m().body || "");

  function handleQuoteClick() {
    const reply = replyData();
    if (!reply?.stanzaId) return;
    const target = props.findMessage(reply.stanzaId);
    if (target) props.onQuoteClick(target.message_id);
  }

  function renderMedia() {
    const msg = m();
    const type = msg.type;
    const isPtv = type === "ptv";
    const src = msg.media_path ? mediaUrl(msg.media_path) : null;
    const mt = (msg.media_type || "").toLowerCase();

    if (!src) {
      if (type === "chat") return null;
      return (
        <div class="flex items-center gap-3 p-3 bg-surface-raised border border-border rounded-lg text-[10px] font-mono font-bold text-text-disabled uppercase tracking-widest my-1 min-w-50">
          <GalleryBrokenIcon size={18} class="text-accent/30" />
          {`[ ${type.toUpperCase().replace("MESSAGE", "")} ]`}
        </div>
      );
    }

    if (isPtv) {
      return <VideoNotePlayer src={src} />;
    }

    if (
      type === "image" || 
      type === "sticker" || 
      type === "lottieSticker" || 
      mt.startsWith("image/")
    ) {
      const isSticker = type.includes("sticker") || mt === "image/webp";
      return (
        <div
          class="group relative rounded-lg overflow-hidden my-1 max-w-80"
          classList={{ "bg-transparent max-w-[180px]": isSticker }}
        >
          <img
            src={src}
            alt={isSticker ? "Sticker" : "Image"}
            loading="lazy"
            class="w-full cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-black rounded-sm"
            onClick={() => props.onImageClick(src)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onImageClick(src);
              }
            }}
            tabIndex={0}
            role="button"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <Show when={!isSticker}>
            <a
              href={src}
              download={msg.media_filename || "download"}
              aria-label="Download"
              class="absolute top-2 right-2 w-8 h-8 rounded-full bg-[rgba(0,0,0,0.4)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 mobile-visible focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-border outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-black"
            >
              <DownloadIcon size={14} stroke-width={2.5} />
            </a>
          </Show>
        </div>
      );
    }

    if (type === "video" || mt.startsWith("video/")) {
      return (
        <div class="group relative rounded-lg overflow-hidden my-1 max-w-80 border border-border-visible bg-black">
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
            class="absolute top-3 right-3 w-8 h-8 rounded-full bg-[rgba(0,0,0,0.4)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 mobile-visible focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-border outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-black"
          >
            <DownloadIcon size={14} stroke-width={2.5} />
          </a>
        </div>
      );
    }

    if (type === "audio" || type === "ptt" || mt.startsWith("audio/")) {
      return (
        <div class="flex flex-col gap-2 my-1 max-w-80">
          <AudioPlayer src={src} isMe={isMe()} filename={msg.media_filename || "voice-note"} />
        </div>
      );
    }

    return (
      <div class="flex items-center gap-3 p-3 bg-surface-raised rounded-lg text-caption border border-border-visible">
        <FileIcon size={14} />
        <div class="flex flex-col flex-1 overflow-hidden">
          <a
            href={src}
            target="_blank"
            rel="noopener"
            class="text-accent underline truncate"
          >
            {msg.media_filename || "Download"}
          </a>
          <span class="text-metadata text-[8px] mt-0.5">
            ATTACHMENT_{type.toUpperCase()}
          </span>
        </div>
        <a
          href={src}
          download={msg.media_filename || "download"}
          aria-label="Download file"
          class="ml-auto w-8 h-8 rounded-full bg-border flex items-center justify-center hover:bg-accent hover:text-white transition-colors"
        >
          <DownloadIcon size={14} stroke-width={2.5} />
        </a>
      </div>
    );
  }

  return (
    <div
      class="max-w-[85%] p-3 px-4 rounded-lg relative mb-1.5 wrap-break-word animate-entrance "
      classList={{
        "self-start bg-[var(--bubble-other)] border border-border": !isMe(),
        "self-end bg-[var(--bubble-me)] border border-accent/20": isMe(),
        "opacity-60 bg-accent/5 border-dashed": isDeleted(),
        "mb-5": (m().reactions?.length || 0) > 0,
      }}
      data-msg-id={m().message_id}
    >
      <Show when={props.isGroup && !isMe()}>
        <div
          class="text-[12px] font-semibold mb-0.5 tracking-tight flex items-baseline gap-1.5"
          style={{ color: avatarCol() }}
        >
          {m().sender_name || phone() || "Unknown"}
          <Show when={phone() && m().sender_name}>
            <span class="text-[10px] font-normal text-text-secondary font-mono">
              {phone()}
            </span>
          </Show>
        </div>
      </Show>

      <Show when={!props.isGroup && !isMe() && !m().sender_name && phone()}>
        <div
          class="text-[12px] font-semibold mb-0.5 tracking-tight"
          style={{ color: phoneAvatarCol() }}
        >
          {phone()}
        </div>
      </Show>

      <Show when={isViewOnce()}>
        <div class="bg-surface-raised text-text-primary text-[10.5px] font-semibold font-mono py-0.5 px-2 rounded-full mb-1 inline-flex items-center gap-1.5 border border-border">
          <EyeIcon size={12} /> VIEW_ONCE
        </div>
      </Show>

      <Show when={formattedReply()}>
        <div
          class="relative bg-surface rounded-lg p-2.5 pl-3.5 mb-2 text-caption overflow-hidden transition-all hover:bg-surface-raised cursor-pointer group/reply border border-border outline-none focus-visible:ring-1 ring-accent/50"
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
              class="text-metadata text-accent mb-0.5 opacity-90 group-hover/reply:opacity-100"
              classList={{ "text-accent": isMe() }}
            >
              {extractJidId(formattedReply()!.sender)}
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
              <EyeIcon size={12} class="shrink-0 text-text-secondary" />
            </Show>
            <span class="truncate">{formattedReply()!.label}</span>
          </div>
        </div>
      </Show>

      {renderMedia()}

      <Show when={bodyText()}>
        <div class="text-body-sm text-text-primary whitespace-pre-wrap leading-relaxed">
          <HighlightedText text={bodyText()} query={props.highlightQuery} />
        </div>
      </Show>

      <Show when={isViewOnce() && !bodyText() && !m().has_media}>
        <div class="flex items-center gap-2 p-2 bg-surface-raised rounded-lg text-xs text-text-secondary italic">
          <EyeIcon size={14} /> View-once {m().type || "message"}
        </div>
      </Show>

      <Show when={(m().reactions?.length || 0) > 0}>
        <div
          class="absolute -bottom-3.5 flex flex-wrap gap-1 z-10"
          classList={{ "right-2": !isMe(), "left-2": isMe() }}
        >
          <For each={groupedReactions()}>
            {(group) => (
              <span
                class="inline-flex items-center gap-1 bg-surface border border-border rounded-full px-1.5 py-0.5  hover:scale-110 transition-transform cursor-default"
                title={group.senders.join(", ")}
              >
                <span class="text-sm leading-none">{group.emoji}</span>
                <Show when={group.count > 1}>
                  <span class="text-[10px] font-mono font-bold text-text-primary bg-border-visible rounded-sm px-1 py-px leading-none scale-90 translate-x-[-2px]">
                    {group.count}
                  </span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </Show>

      <div class="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 mt-0.5">
        <span class="text-metadata opacity-60 tabular-nums whitespace-nowrap">
          {time()}
        </span>
        <div class="flex items-center gap-1.5 ml-auto">
          <Show when={isDeleted() || m().edits?.length}>
            <span class="text-metadata whitespace-nowrap flex items-center gap-1 opacity-80">
              [ <span class="flex items-center gap-1.5 text-accent">
                {isDeleted() ? <TrashIcon size={12} /> : ""}
                {isDeleted() && m().edits?.length ? <span class="text-metadata text-border-visible">|</span> : ""}
                {m().edits?.length ? <EditIcon size={12} /> : ""}
              </span> ]
            </span>
          </Show>
          <Show when={m().edits?.length}>
            <button
              onClick={() => setShowHistory(!showHistory())}
              class="tag"
            >
              {showHistory() ? "HIDE" : `${m().edits!.length} VERSIONS`}
            </button>
          </Show>
        </div>
      </div>

      <Show when={showHistory() && m().edits?.length}>
        <div class="mt-3 space-y-2.5 border-t border-border pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <For each={m().edits}>
            {(edit) => (
              <div class="bg-surface-raised rounded-lg p-2.5 border border-border relative group/edit overflow-hidden transition-all hover:bg-border">
                <div class="absolute left-0 top-0 bottom-0 w-0.5 bg-accent opacity-30 group-hover/edit:opacity-100 transition-opacity" />
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[9px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1">
                    HISTORICAL_RECORD
                  </span>
                </div>
                <div class="flex items-end justify-between gap-4">
                  <div class="text-[13px] text-text-primary line-through opacity-60 leading-relaxed italic wrap-break-word">
                    {edit.old_body}
                  </div>
                  <span class="text-[9px] font-mono text-text-disabled opacity-60 tabular-nums pb-0.5 shrink-0">
                    {formatTime(new Date(edit.edited_at))}
                  </span>
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
  const time = createMemo(() =>
    formatTime(
      new Date(props.messages[props.messages.length - 1].timestamp * 1000),
    )
  );
  const phone = createMemo(() =>
    first().sender_id ? extractJidId(first().sender_id!) : ""
  );
  const avatarCol = createMemo(() => avatarColor(first().sender_name || phone()));
  const groupedReactions = createMemo(() =>
    groupReactions(props.messages.flatMap((m) => m.reactions || []))
  );
  const imageMessages = createMemo(() =>
    props.messages.filter((m) => m.has_media && m.media_path)
  );
  const imageCount = () => imageMessages().length;
  const isStickerGroup = createMemo(() => 
    imageMessages().every(m => (m.type || "").includes("sticker") || (m.media_type || "").toLowerCase() === "image/webp")
  );

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
    if (n === 3) return "grid-cols-2"; 
    return "grid-cols-2";
  };

  return (
    <div
      class="max-w-110 p-3 px-4 rounded-2xl relative mb-1.5  animate-in fade-in duration-300"
      classList={{
        "self-start bg-surface border border-border rounded-bl-sm": !isMe(),
        "self-end bg-accent/20  border border-accent/20 rounded-br-sm":
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
          style={{ color: avatarCol() }}
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
                class="w-full h-full object-cover transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ring-accent"
                onClick={() => props.onImageClick(mediaUrl(msg.media_path!))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onImageClick(mediaUrl(msg.media_path!));
                  }
                }}
                tabIndex={0}
                role="button"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <Show when={!msg.type.includes("sticker") && (msg.media_type || "").toLowerCase() !== "image/webp"}>
                <a
                  href={mediaUrl(msg.media_path!)}
                  download={msg.media_filename || "download"}
                  aria-label="Download photo"
                  class="absolute top-2 right-2 w-7 h-7 rounded-full bg-[rgba(0,0,0,0.4)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 mobile-visible focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-border  z-10 outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-black"
                >
                  <DownloadIcon size={12} stroke-width={2.5} />
                </a>
              </Show>
              <Show when={!!msg.is_deleted}>
                <div class="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span class="tag tag-accent border-accent text-accent">
                    <TrashIcon size={10} class="mr-1.5" /> DELETED
                  </span>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      <Show when={first().body}>
        <div class="text-body-sm text-text-primary whitespace-pre-wrap leading-relaxed px-0.5 pt-1">
          <HighlightedText text={first().body!} query={props.highlightQuery} />
        </div>
      </Show>

      <div class="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mt-2">
        <div class="flex items-center gap-1.5 whitespace-nowrap">
          <span class="text-metadata uppercase">
            {imageCount()} {isStickerGroup() ? "stickers" : "photos"}
          </span>
          <Show when={imageCount() > 1}>
            <button
              class="tag hover:border-accent hover:text-accent transition-all cursor-pointer"
              classList={{ "opacity-50 cursor-default pointer-events-none": isStickerGroup() }}
              onClick={() => !isStickerGroup() && downloadAll()}
              aria-label={isStickerGroup() ? "Sticker album" : `Download all ${imageCount()} photos`}
              disabled={isDownloading() || isStickerGroup()}
            >
              <Show when={!isStickerGroup()}>
                <Show when={isDownloading()} fallback={<DownloadIcon size={10} stroke-width={2.5} class="mr-1.5" />}>
                  <CheckIcon size={10} class="text-success animate-in zoom-in duration-300 mr-1.5" />
                </Show>
              </Show>
              {isDownloading() ? "DOWNLOADED" : "ALBUM"}
            </button>
          </Show>
        </div>
        <span class="text-metadata tabular-nums opacity-60 whitespace-nowrap">
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
          <For each={groupedReactions()}>
            {(group) => (
              <span
                class="inline-flex items-center gap-1 bg-surface border border-border rounded-full px-1.5 py-0.5  hover:scale-110 transition-transform cursor-default"
                title={group.senders.join(", ")}
              >
                <span class="text-sm">{group.emoji}</span>
                <Show when={group.count > 1}>
                  <span class="text-[10px] font-mono font-bold text-text-secondary">
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
