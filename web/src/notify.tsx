import toast from "solid-toast";

export interface NotificationSystem {
  deleted: (sender: string, preview: string) => string;
  info: (title: string, body?: string) => string;
  success: (title: string, body?: string) => string;
  warning: (title: string, body?: string) => string;
  error: (title: string, body?: string) => string;
}

/**
 * Lucide icons retrieved via `bunx better-icons get lucide:<name>`.
 * Stroke weight normalized to 2.25px for Nothing aesthetic.
 */
const Icons = {
  Success: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Error: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  Info: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Warning: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Delete: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  ),
  Dismiss: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

/** Shared toast card style — responsive sizing */
const iosStyle = (color = "var(--border-visible)") => ({
  duration: 4000,
  style: {
    background: "rgba(var(--bg-rgb, 18, 18, 18), 0.88)",
    "backdrop-filter": "blur(32px) saturate(190%)",
    "-webkit-backdrop-filter": "blur(32px) saturate(190%)",
    color: "var(--text-primary)",
    border: `1px solid ${color}`,
    "border-radius": "18px",
    padding: "12px 14px",
    "box-shadow": "0 8px 40px rgba(0, 0, 0, 0.35)",
    "max-width": "min(380px, calc(100vw - 32px))",
    width: "100%",
  },
});

/** Reusable toast body with dismiss X */
function ToastBody(props: {
  icon: () => any;
  iconClass: string;
  title: string;
  tag: string;
  body?: string;
  toastId: string;
}) {
  return (
    <div class="flex items-center gap-3 w-full">
      <div class={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${props.iconClass}`}>
        {props.icon()}
      </div>
      <div class="flex flex-col gap-0.5 min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-bold text-[12px] tracking-tight text-text-display uppercase font-mono truncate">{props.title}</span>
          <span class="text-[9px] text-text-disabled font-mono italic shrink-0">{props.tag}</span>
        </div>
        {props.body && <span class="text-[11px] text-text-secondary font-medium lowercase line-clamp-1">{props.body}</span>}
      </div>
      <button
        onClick={() => toast.dismiss(props.toastId)}
        class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-text-disabled hover:text-text-primary hover:bg-surface-raised/80 transition-colors cursor-pointer"
        aria-label="Dismiss notification"
      >
        <Icons.Dismiss />
      </button>
    </div>
  );
}

const sysNotify: NotificationSystem = {
  deleted: (sender: string, preview: string) => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Delete />}
          iconClass="bg-accent/15 border-accent/30 text-accent"
          title="REM_CONTENT"
          tag="NOW"
          body={`${sender}: ${preview || "STUB_DATA_REMOVED"}`}
          toastId={t.id}
        />
      ),
      iosStyle("rgba(215, 25, 33, 0.35)")
    );
    return id;
  },

  info: (title: string, body = "") => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Info />}
          iconClass="bg-surface-raised border-border-visible text-text-secondary"
          title={title.replace(/ /g, "_")}
          tag="INF"
          body={body}
          toastId={t.id}
        />
      ),
      iosStyle("rgba(255, 255, 255, 0.1)")
    );
    return id;
  },

  success: (title: string, body = "") => {
    let finalTitle = title.replace(/ /g, "_").toUpperCase();
    if (title.toLowerCase().includes("session") || title.toLowerCase().includes("connect")) {
      finalTitle = "SESSION_READY";
    } else if (title.toLowerCase().includes("logged in") || title.toLowerCase().includes("auth")) {
      finalTitle = "AUTH_GRANTED";
    }

    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Success />}
          iconClass="bg-success/15 border-success/30 text-success"
          title={finalTitle}
          tag="OK"
          body={body}
          toastId={t.id}
        />
      ),
      iosStyle("rgba(16, 185, 129, 0.35)")
    );
    return id;
  },

  warning: (title: string, body = "") => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Warning />}
          iconClass="bg-warning/15 border-warning/30 text-warning"
          title={title.replace(/ /g, "_")}
          tag="WAR"
          body={body}
          toastId={t.id}
        />
      ),
      iosStyle("rgba(212, 168, 67, 0.35)")
    );
    return id;
  },

  error: (title: string, body = "") => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Error />}
          iconClass="bg-error/15 border-error/30 text-error"
          title={title.replace(/ /g, "_")}
          tag="ERR"
          body={body}
          toastId={t.id}
        />
      ),
      iosStyle("rgba(215, 25, 33, 0.35)")
    );
    return id;
  },
};

export { sysNotify as notify };
