import { createSignal, onMount } from "solid-js";
import { PlayIcon, MusicIcon } from "../Icons";

interface VideoNotePlayerProps {
  src: string;
}

export default function VideoNotePlayer(props: VideoNotePlayerProps) {
  let videoRef: HTMLVideoElement | undefined;
  const [isMuted, setIsMuted] = createSignal(true);

  onMount(() => {
    if (videoRef) {
      videoRef.play().catch(() => {
        // Autoplay might be blocked if not muted
        setIsMuted(true);
        videoRef!.muted = true;
        videoRef!.play();
      });
    }
  });

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
      onClick={toggleMute}
    >
      <video
        ref={el => videoRef = el}
        src={props.src}
        autoplay
        loop
        muted
        playsinline
        class="w-full h-full object-cover"
      />
      
      {/* Controls Overlay */}
      <div class="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity">
        <div class="bg-black/60 backdrop-blur-md p-3 rounded-full border border-white/10 scale-90 group-hover:scale-100 transition-transform">
          {isMuted() ? (
            <MusicIcon size={24} class="text-white opacity-60" />
          ) : (
            <PlayIcon size={24} class="text-white" />
          )}
        </div>
      </div>

      {/* Mute Indicator (Minimalist) */}
      <div class="absolute bottom-6 right-1/2 translate-x-1/2">
         <div class="px-2 py-1 bg-black/40 backdrop-blur-sm rounded-full border border-white/10 text-[8px] font-mono font-bold text-white tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
            {isMuted() ? "TAP_TO_UNMUTE" : "AUDIO_ENABLED"}
         </div>
      </div>
    </div>
  );
}
