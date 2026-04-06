import { Show, For, createMemo, createSignal } from "solid-js";
import type { Message } from "../../types";
import { avatarColor, formatTime, extractJidId, mediaUrl } from "../../utils";
import { 
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
import { HighlightedText, groupReactions } from "./ChatUtils";
import { MediaRenderer } from "./MediaRenderer";

interface MessageBubbleProps {
  msg: Message;
  isGroup: boolean;
  onImageClick: (_src: string) => void;
  onQuoteClick: (_messageId: string) => void;
  findMessage: (_stanzaId: string) => Message | undefined;
  highlightQuery?: string;
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
    return {
      sender: data.sender,
      hasPhoto: lower.includes("photo") || lower.includes("image"),
      hasVideo: lower.includes("video") || lower.includes("ptv"),
      hasAudio: lower.includes("audio") || lower.includes("ptt"),
      hasSticker: lower.includes("sticker"),
      hasViewOnce: previewRaw.includes("👁️") || lower.includes("view once"),
      label: previewRaw,
      stanzaId: data.stanzaId,
    };
  });

  function handleQuoteClick() {
    const reply = replyData();
    if (!reply?.stanzaId) return;
    const target = props.findMessage(reply.stanzaId);
    if (target) props.onQuoteClick(target.message_id);
  }

  return (
    <div
      class="max-w-[85%] p-3 px-4 rounded-lg relative mb-1.5 wrap-break-word animate-entrance"
      classList={{
        "self-start bg-[var(--bubble-other)] border border-border": !isMe(),
        "self-end bg-[var(--bubble-me)] border border-accent/20": isMe(),
        "opacity-60 bg-accent/5 border-dashed": isDeleted(),
        "mb-5": (m().reactions?.length || 0) > 0,
      }}
      data-msg-id={m().message_id}
    >
      <Show when={props.isGroup && !isMe()}>
        <div class="flex items-baseline gap-2 mb-0.5 max-w-full">
          <span class="text-[12px] font-semibold tracking-tight truncate min-w-0 shrink" style={{ color: avatarCol() }} dir="auto">
            {m().sender_name || phone() || "Unknown"}
          </span>
          <Show when={phone() && m().sender_name}>
            <span class="text-[9px] font-normal text-text-disabled font-mono shrink-0 tracking-wider">+{phone()}</span>
          </Show>
        </div>
      </Show>

      <Show when={!props.isGroup && !isMe() && !m().sender_name && phone()}>
        <div class="text-[12px] font-semibold mb-0.5 tracking-tight" style={{ color: phoneAvatarCol() }} dir="auto">
          +{phone()}
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
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), handleQuoteClick())}
        >
          <div class="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l-lg" classList={{ "bg-accent/50": isMe() }} />
          <Show when={formattedReply()?.sender}>
            <div class="text-metadata text-accent mb-0.5 opacity-90 group-hover/reply:opacity-100">{extractJidId(formattedReply()!.sender)}</div>
          </Show>
          <div class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis opacity-80 group-hover/reply:opacity-100 transition-opacity">
            <Show when={formattedReply()!.hasPhoto}><ImageIcon size={12} class="shrink-0 text-accent/70" /></Show>
            <Show when={formattedReply()!.hasVideo}><VideoIcon size={12} class="shrink-0 text-accent/70" /></Show>
            <Show when={formattedReply()!.hasAudio}><MusicIcon size={12} class="shrink-0 text-accent/70" /></Show>
            <Show when={formattedReply()!.hasSticker}><ImageIcon size={12} class="shrink-0 text-accent/70 opacity-50" /></Show>
            <Show when={formattedReply()!.hasViewOnce}><EyeIcon size={12} class="shrink-0 text-text-secondary" /></Show>
            <span class="truncate">{formattedReply()!.label}</span>
          </div>
        </div>
      </Show>

      <MediaRenderer msg={m()} isMe={isMe()} onImageClick={props.onImageClick} />

      <Show when={m().body}>
        <div class="text-body-sm text-text-primary whitespace-pre-wrap leading-relaxed">
          <HighlightedText text={m().body!} query={props.highlightQuery} />
        </div>
      </Show>

      <Show when={isViewOnce() && !m().body && !m().has_media}>
        <div class="flex items-center gap-2 p-2 bg-surface-raised rounded-lg text-xs text-text-secondary italic">
          <EyeIcon size={14} /> View-once {m().type || "message"}
        </div>
      </Show>

      <Show when={(m().reactions?.length || 0) > 0}>
        <div class="absolute -bottom-3.5 flex flex-wrap gap-1 z-10" classList={{ "right-2": !isMe(), "left-2": isMe() }}>
          <For each={groupedReactions()}>
            {(group) => (
              <span class="inline-flex items-center gap-1 bg-surface border border-border rounded-full px-1.5 py-0.5 hover:scale-110 transition-transform cursor-default" title={group.senders.join(", ")}>
                <span class="text-sm leading-none">{group.emoji}</span>
                <Show when={group.count > 1}>
                  <span class="text-[10px] font-mono font-bold text-text-primary bg-border-visible rounded-sm px-1 py-px leading-none scale-90 translate-x-[-2px]">{group.count}</span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </Show>

      <div class="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 mt-0.5">
        <span class="text-metadata opacity-60 tabular-nums whitespace-nowrap">{time()}</span>
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
            <button onClick={() => setShowHistory(!showHistory())} class="tag">{showHistory() ? "HIDE" : `${m().edits!.length} VERSIONS`}</button>
          </Show>
        </div>
      </div>

      <Show when={showHistory() && m().edits?.length}>
        <div class="mt-3 space-y-2.5 border-t border-border pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <For each={m().edits}>
            {(edit) => (
              <div class="bg-surface-raised rounded-lg p-2.5 border border-border relative group/edit overflow-hidden transition-all hover:bg-border">
                <div class="absolute left-0 top-0 bottom-0 w-0.5 bg-accent opacity-30 group-hover/edit:opacity-100 transition-opacity" />
                <div class="flex items-center justify-between mb-2"><span class="text-[9px] font-bold text-text-disabled uppercase tracking-widest">HISTORICAL_RECORD</span></div>
                <div class="flex items-end justify-between gap-4">
                  <div class="text-[13px] text-text-primary line-through opacity-60 leading-relaxed italic wrap-break-word">{edit.old_body}</div>
                  <span class="text-[9px] font-mono text-text-disabled opacity-60 tabular-nums pb-0.5 shrink-0">{formatTime(new Date(edit.edited_at))}</span>
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
  const time = createMemo(() => formatTime(new Date(props.messages[props.messages.length - 1].timestamp * 1000)));
  const phone = createMemo(() => first().sender_id ? extractJidId(first().sender_id!) : "");
  const avatarCol = createMemo(() => avatarColor(first().sender_name || phone()));
  const groupedReactions = createMemo(() => groupReactions(props.messages.flatMap((m) => m.reactions || [])));
  const imageMessages = createMemo(() => props.messages.filter((m) => m.has_media && m.media_path));
  const imageCount = () => imageMessages().length;
  const isStickerGroup = createMemo(() => imageMessages().every(m => (m.type || "").includes("sticker") || (m.media_type || "").toLowerCase() === "image/webp"));

  const [isDownloading, setIsDownloading] = createSignal(false);
  function downloadAll() {
    if (isDownloading()) return;
    setIsDownloading(true);
    notify.info("Starting download...", `${imageCount()} photos`);
    imageMessages().forEach((msg, idx) => setTimeout(() => {
      const link = document.createElement("a");
      link.href = mediaUrl(msg.media_path!);
      link.download = msg.media_filename || `image_${idx}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (idx === imageMessages().length - 1) setTimeout(() => setIsDownloading(false), 2000);
    }, idx * 200));
  }

  return (
    <div
      class="max-w-110 p-3 px-4 rounded-lg relative mb-1.5 animate-entrance"
      classList={{
        "self-start bg-[var(--bubble-other)] border border-border": !isMe(),
        "self-end bg-[var(--bubble-me)] border border-accent/20": isMe(),
        "mb-5": props.messages.some((m) => m.reactions && m.reactions.length > 0),
      }}
      data-msg-id={first().message_id}
    >
      <Show when={props.isGroup && !isMe()}>
        <div class="flex items-baseline gap-2 mb-1.5 max-w-full">
          <span class="text-[12px] font-semibold tracking-tight truncate min-w-0 shrink" style={{ color: avatarCol() }} dir="auto">
            {first().sender_name || phone() || "Unknown"}
          </span>
          <Show when={phone() && first().sender_name}>
            <span class="text-[9px] font-normal text-text-disabled font-mono shrink-0 tracking-wider">+{phone()}</span>
          </Show>
        </div>
      </Show>

      <div class="grid gap-0.5 rounded-lg overflow-hidden my-1" classList={{ "grid-cols-1": imageCount() === 1, "grid-cols-2": imageCount() > 1 }}>
        <For each={imageMessages()}>
          {(msg, idx) => (
            <div class="relative aspect-square cursor-pointer overflow-hidden group" classList={{ "opacity-60 grayscale": !!msg.is_deleted, "row-span-2 aspect-auto": imageCount() === 3 && idx() === 0 }}>
              <img src={mediaUrl(msg.media_path!)} alt="Image" loading="lazy" class="w-full h-full object-cover transition-opacity hover:opacity-90" onClick={() => props.onImageClick(mediaUrl(msg.media_path!))} />
              <Show when={!msg.type.includes("sticker") && (msg.media_type || "").toLowerCase() !== "image/webp"}>
                <a href={mediaUrl(msg.media_path!)} download={msg.media_filename || "download"} class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-accent border border-border z-10"><DownloadIcon size={12} stroke-width={2.5} /></a>
              </Show>
              <Show when={!!msg.is_deleted}><div class="absolute inset-0 flex items-center justify-center bg-black/60"><span class="tag tag-accent"><TrashIcon size={10} class="mr-1.5" /> DELETED</span></div></Show>
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
          <span class="text-metadata uppercase">{imageCount()} {isStickerGroup() ? "stickers" : "photos"}</span>
          <Show when={imageCount() > 1}>
            <button class="tag hover:border-accent hover:text-accent transition-all" onClick={() => !isStickerGroup() && downloadAll()} disabled={isDownloading() || isStickerGroup()}>
              {!isStickerGroup() && (isDownloading() ? <CheckIcon size={10} class="text-success mr-1.5" /> : <DownloadIcon size={10} stroke-width={2.5} class="mr-1.5" />)}
              {isDownloading() ? "DOWNLOADED" : "ALBUM"}
            </button>
          </Show>
        </div>
        <span class="text-metadata tabular-nums opacity-60 whitespace-nowrap">{time()}</span>
      </div>

      <Show when={props.messages.some((m) => m.reactions && m.reactions.length > 0)}>
        <div class="absolute -bottom-3.5 flex flex-wrap gap-1 z-10" classList={{ "right-2": !isMe(), "left-2": isMe() }}>
          <For each={groupedReactions()}>
            {(group) => (
              <span class="inline-flex items-center gap-1 bg-surface border border-border rounded-full px-1.5 py-0.5 hover:scale-110 transition-transform cursor-default" title={group.senders.join(", ")}>
                <span class="text-sm">{group.emoji}</span>
                <Show when={group.count > 1}><span class="text-[10px] font-mono font-bold text-text-secondary">{group.count}</span></Show>
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
