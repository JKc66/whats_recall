import { createSignal, onMount } from "solid-js";
import { PlayIcon, VolumeUpIcon, VolumeOffIcon, PauseIcon } from "../Icons";

interface VideoNotePlayerProps {
  src: string;
}

export default function VideoNotePlayer(props: VideoNotePlayerProps) {
  let videoRef: HTMLVideoElement | undefined;
  const [isMuted, setIsMuted] = createSignal(true);
  const [isPlaying, setIsPlaying] = createSignal(false);

  onMount(() => {
    if (videoRef) {
      videoRef.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Autoplay might be blocked if not muted
        setIsMuted(true);
        videoRef!.muted = true;
        videoRef!.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });
    }
  });

  const togglePlay = (e: MouseEvent) => {
    e.stopPropagation();
    if (videoRef) {
      if (videoRef.paused) {
        videoRef.play();
        setIsPlaying(true);
      } else {
        videoRef.pause();
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = (e: MouseEvent) => {
    e.stopPropagation();
    if (videoRef) {
      const newMuted = !isMuted();
      videoRef.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  return (
    <div 
      class="group relative aspect-square w-64 rounded-full overflow-hidden bg-black border-2 border-border-visible shadow-2xl my-2 cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
      onClick={togglePlay}
    >
      <video
        ref={el => videoRef = el}
        src={props.src}
        autoplay
        loop
        muted
        playsinline
        class="w-full h-full object-cover"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Controls Overlay */}
      <div 
        class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
        classList={{ "opacity-100": !isPlaying() }}
      >
        <div class="bg-black/60 backdrop-blur-md p-4 rounded-full border border-white/10 scale-90 group-hover:scale-100 transition-transform">
          {!isPlaying() ? (
            <PlayIcon size={32} class="text-white ml-1" />
          ) : (
            <PauseIcon size={32} class="text-white" />
          )}
        </div>
      </div>

      {/* Mute Toggle Button (Corner - Shifted in to avoid circle clipping) */}
      <button 
        class="absolute bottom-10 right-10 w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full border border-white/15 text-white z-10 hover:bg-black/80 transition-all hover:scale-110 active:scale-95 shadow-lg"
        onClick={toggleMute}
        title={isMuted() ? "Unmute" : "Mute"}
      >
        {isMuted() ? (
          <VolumeOffIcon size={20} class="opacity-60" />
        ) : (
          <VolumeUpIcon size={20} class="text-accent animate-pulse-slow" />
        )}
      </button>

      {/* Status Label (Minimalist - Shifted in) */}
      <div class="absolute top-10 left-1/2 -translate-x-1/2 pointer-events-none">
         <div 
          class="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[9px] font-mono font-bold text-white tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-all transform -translate-y-1 group-hover:translate-y-0"
          classList={{ "opacity-100 translate-y-0": !isPlaying() }}
        >
            {!isPlaying() ? "PAUSED" : isMuted() ? "TAP_TO_PAUSE" : "AUDIO_ON"}
         </div>
      </div>
    </div>
  );
}
