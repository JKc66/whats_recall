import { Show } from "solid-js";
import { Message } from "../../types";
import { mediaUrl } from "../../utils";
import { DownloadIcon, FileIcon, GalleryBrokenIcon } from "../Icons";
import AudioPlayer from "./AudioPlayer";
import VideoNotePlayer from "./VideoNotePlayer";

interface MediaRendererProps {
  msg: Message;
  isMe: boolean;
  onImageClick: (src: string) => void;
}

export function MediaRenderer(props: MediaRendererProps) {
  const m = () => props.msg;
  const src = () => m().media_path ? mediaUrl(m().media_path!) : null;
  const type = () => m().type;
  const mt = () => (m().media_type || "").toLowerCase();

  return (
    <Show when={src()} fallback={
      <Show when={type() !== "chat"}>
        <div class="flex items-center gap-3 p-3 bg-surface-raised border border-border rounded-lg text-[10px] font-mono font-bold text-text-disabled uppercase tracking-widest my-1 min-w-50">
          <GalleryBrokenIcon size={18} class="text-accent/30" />
          {`[ ${type().toUpperCase().replace("MESSAGE", "")} ]`}
        </div>
      </Show>
    }>
      {(s) => (
        <Show when={type() === "ptv"} fallback={
          <Show when={type() === "image" || type().includes("sticker") || mt().startsWith("image/")} fallback={
            <Show when={type() === "video" || mt().startsWith("video/")} fallback={
              <Show when={type() === "audio" || type() === "ptt" || mt().startsWith("audio/")} fallback={
                <div class="flex items-center gap-3 p-3 bg-surface-raised rounded-lg text-caption border border-border-visible">
                  <FileIcon size={14} />
                  <div class="flex flex-col flex-1 overflow-hidden">
                    <a href={s()} target="_blank" rel="noopener" class="text-accent underline truncate">
                      {m().media_filename || "Download"}
                    </a>
                    <span class="text-metadata text-[8px] mt-0.5">ATTACHMENT_{type().toUpperCase()}</span>
                  </div>
                  <a href={s()} download={m().media_filename || "download"} aria-label="Download file" class="ml-auto w-8 h-8 rounded-full bg-border flex items-center justify-center hover:bg-accent hover:text-white transition-colors">
                    <DownloadIcon size={14} stroke-width={2.5} />
                  </a>
                </div>
              }>
                <div class="flex flex-col gap-2 my-1 max-w-80">
                  <AudioPlayer src={s()} isMe={props.isMe} filename={m().media_filename || "voice-note"} />
                </div>
              </Show>
            }>
              <div class="group relative rounded-lg overflow-hidden my-1 max-w-80 border border-border-visible bg-black">
                <video src={s()} controls preload="metadata" class="w-full max-h-75" />
                <a href={s()} download={m().media_filename || "download"} aria-label="Download video" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-[rgba(0,0,0,0.4)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 mobile-visible focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-border outline-none focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-black">
                  <DownloadIcon size={14} stroke-width={2.5} />
                </a>
              </div>
            </Show>
          }>
            <div class="group relative rounded-lg overflow-hidden my-1 max-w-80" classList={{ "bg-transparent max-w-[180px]": type().includes("sticker") || mt() === "image/webp" }}>
              <img src={s()} alt="Media" loading="lazy" class="w-full cursor-pointer hover:opacity-90 transition-opacity rounded-sm" onClick={() => props.onImageClick(s())} />
              <Show when={!type().includes("sticker") && mt() !== "image/webp"}>
                <a href={s()} download={m().media_filename || "download"} aria-label="Download" class="absolute top-2 right-2 w-8 h-8 rounded-full bg-[rgba(0,0,0,0.4)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 mobile-visible focus-visible:opacity-100 focus-visible:bg-accent transition-all hover:bg-accent border border-border">
                  <DownloadIcon size={14} stroke-width={2.5} />
                </a>
              </Show>
            </div>
          </Show>
        }>
          <VideoNotePlayer src={s()} />
        </Show>
      )}
    </Show>
  );
}
