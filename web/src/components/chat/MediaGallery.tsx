import { For, Show } from "solid-js";
import type { Message } from "../../types";
import { formatTime } from "../../utils";
import { PlayIcon, MusicIcon, FileIcon } from "../Icons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MediaGalleryProps {
  messages: Message[];
  onImageClick: (src: string) => void;
  onJumpToMessage: (id: string) => void;
}

export default function MediaGallery(props: MediaGalleryProps) {
  function mediaUrl(path: string) {
    return `${BASE}/api/media/${encodeURIComponent(path)}`;
  }

  return (
    <div class="flex-1 overflow-y-auto p-6 scrollbar-thin">
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center p-12 text-zinc-500 text-sm text-center h-full gap-1">
            No media found in this chat
          </div>
        }
      >
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <For each={props.messages}>
            {(msg) => {
              const src = mediaUrl(msg.media_path!);
              const type = msg.type;
              return (
                <div
                  class="group relative aspect-square bg-zinc-900 border border-white/5 rounded-lg overflow-hidden cursor-pointer"
                  classList={{ "opacity-60 grayscale": !!msg.is_deleted }}
                >
                  <Show when={type === "image" || type === "sticker"}>
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      onClick={() => props.onImageClick(src)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </Show>
                  <Show when={type === "video"}>
                    <div
                      class="w-full h-full relative"
                      onClick={() => props.onImageClick(src)}
                    >
                      <video
                        src={src}
                        preload="metadata"
                        class="w-full h-full object-cover"
                      />
                      <div class="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                        <PlayIcon size={24} fill="currentColor" stroke="none" />
                      </div>
                    </div>
                  </Show>
                  <Show when={type === "audio" || type === "ptt"}>
                    <div class="w-full h-full flex flex-col items-center justify-center bg-zinc-850 p-4 gap-2">
                      <div class="text-accent">
                        <MusicIcon size={28} stroke-width={1.5} />
                      </div>
                      <audio
                        src={src}
                        controls
                        preload="metadata"
                        class="w-full h-8 opacity-40 hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </Show>
                  <Show when={type === "document"}>
                    <div class="w-full h-full flex flex-col items-center justify-center bg-zinc-850 p-4 gap-2">
                      <div class="text-zinc-400">
                        <FileIcon size={28} stroke-width={1.5} />
                      </div>
                      <span class="text-[10px] font-mono text-zinc-500 truncate w-full text-center">
                        {msg.media_filename || "Document"}
                      </span>
                    </div>
                  </Show>

                  <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center pointer-events-none group-hover:pointer-events-auto">
                    <div class="mb-4">
                      <span class="text-[10px] font-mono text-zinc-300 tabular-nums">
                        {formatTime(new Date(msg.timestamp * 1000))}
                      </span>
                      <Show when={!!msg.is_deleted}>
                        <div class="mt-1 text-[9px] font-bold text-red-500 uppercase tracking-widest">
                          Deleted
                        </div>
                      </Show>
                    </div>
                    <button
                      class="px-3 py-1.5 bg-white/10 hover:bg-accent hover:text-white border border-white/10 rounded-md text-[11px] font-medium transition-all"
                      onClick={() => props.onJumpToMessage(msg.message_id)}
                    >
                      Jump to message
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
