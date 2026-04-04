import { createSignal, Show, For } from "solid-js";
import { PlayIcon, PauseIcon, DownloadIcon } from "../Icons";

interface AudioPlayerProps {
  src: string;
  isMe: boolean;
  filename?: string;
}

export default function AudioPlayer(props: AudioPlayerProps) {
  let audioRef: HTMLAudioElement | undefined;
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);

  // Generate a semi-random waveform for visual flavor that stays consistent for the session
  const waveform = new Array(24).fill(0).map(() => 0.2 + Math.random() * 0.8);

  const togglePlay = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!audioRef) return;
    if (isPlaying()) {
      audioRef.pause();
    } else {
      audioRef.play().catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef) setCurrentTime(audioRef.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef) setDuration(audioRef.duration);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const seek = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!audioRef || !duration()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audioRef.currentTime = percent * duration();
  };

  return (
    <div 
      class="flex items-center gap-3 p-3 rounded-xl border transition-all min-w-0 w-full md:min-w-64 max-w-full"
      classList={{
        "bg-surface border-border": !props.isMe,
        "bg-accent/5 border-accent/10": props.isMe
      }}
    >
      <audio 
        ref={el => audioRef = el} 
        src={props.src} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        preload="metadata"
      />
      
      <button 
        onClick={togglePlay}
        class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 border border-border"
        classList={{
          "bg-surface-raised text-text-primary": !isPlaying(),
          "bg-accent text-white border-accent": isPlaying()
        }}
      >
        <Show when={isPlaying()} fallback={<PlayIcon size={18} />}>
           <PauseIcon size={18} />
        </Show>
      </button>

      <div class="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
        <div 
          class="flex items-center gap-[2px] h-6 cursor-pointer group min-w-0"
          onClick={seek}
        >
           <For each={waveform}>
             {(h, i) => (
               <div 
                 class="flex-1 rounded-full transition-all duration-300"
                 style={{ 
                   height: `${h * 100}%`,
                   opacity: (currentTime() / duration() || 0) > (i() / waveform.length) ? 1 : 0.4,
                   background: "var(--text-primary)"
                 }}
               />
             )}
           </For>
        </div>
        <div class="flex justify-between items-center text-[9px] font-mono text-text-secondary tracking-wider uppercase gap-2">
          <span class="shrink-0">{formatTime(currentTime())}</span>
          <span class="shrink-0">{formatTime(duration() || 0)}</span>
        </div>
      </div>

      <a 
        href={props.src} 
        download={props.filename || "audio"} 
        class="w-8 h-8 rounded-full border border-border flex items-center justify-center text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-all shrink-0 active:scale-90"
        title="Download"
      >
        <DownloadIcon size={14} />
      </a>
    </div>
  );
}
