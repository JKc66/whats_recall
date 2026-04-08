import type { JSX } from "solid-js";
import toast from "solid-toast";

export interface NotificationSystem {
  deleted: (sender: string, preview: string) => string;
  info: (title: string, body?: string) => string;
  success: (title: string, body?: string) => string;
  warning: (title: string, body?: string) => string;
  error: (title: string, body?: string) => string;
}

/**
 * Icons retrieved via `bunx better-icons get lucide:<name>`.
 * Stroke weight normalized to 2.25px for Nothing aesthetic.
 */
const Icons = {
  Success: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12l2 2l4-4" />
    </svg>
  ),
  Error: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 16h.01M12 8v4m3.312-10a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z" />
    </svg>
  ),
  Info: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4m0-4h.01" />
    </svg>
  ),
  Warning: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01" />
    </svg>
  ),
  Delete: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Dismiss: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

/** Nothing Design strictly flat styling */
const nothingStyle = (borderColor = "var(--border-visible)") => ({
  duration: 4000,
  style: {
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: `1px solid ${borderColor}`,
    "border-radius": "4px",
    padding: "12px 16px",
    "box-shadow": "none",
    "max-width": "min(400px, calc(100vw - 32px))",
    width: "100%",
  },
});

/** Reusable toast body with dismiss X */
function normalizeToastText(s: string) {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ToastBody(props: {
  icon: () => JSX.Element;
  iconClass: string;
  title: string;
  tag: string;
  body?: string;
  toastId: string;
}) {
  const isRedundant = () => {
    const raw = props.body;
    if (raw == null || !String(raw).trim()) return true;
    const t = normalizeToastText(props.title);
    const b = normalizeToastText(String(raw));
    return t === b;
  };

  return (
    <div class="flex items-start gap-4 w-full">
      <div class={`mt-0.5 shrink-0 ${props.iconClass}`}>
        {props.icon()}
      </div>
      <div class="flex flex-col gap-1 min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-[13px] tracking-tight text-text-display uppercase font-mono truncate">{props.title}</span>
          <span class="text-[10px] text-text-disabled font-mono shrink-0">[{props.tag}]</span>
        </div>
        {!isRedundant() && <span class="text-[13px] text-text-secondary font-sans leading-snug">{props.body}</span>}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(props.toastId)}
        class="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center text-text-disabled hover:text-text-primary transition-colors cursor-pointer"
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
          iconClass="text-accent"
          title="DATA_WIPE"
          tag="REM"
          body={`${sender}: ${preview || "Content removed"}`}
          toastId={t.id}
        />
      ),
      nothingStyle("var(--accent-color)")
    );
    return id;
  },

  info: (title: string, body = "") => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Info />}
          iconClass="text-text-secondary"
          title={title.replace(/ /g, "_")}
          tag="INF"
          body={body}
          toastId={t.id}
        />
      ),
      nothingStyle("var(--border-visible)")
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
          iconClass="text-success"
          title={finalTitle}
          tag="OK"
          body={body}
          toastId={t.id}
        />
      ),
      nothingStyle("var(--color-success)")
    );
    return id;
  },

  warning: (title: string, body = "") => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Warning />}
          iconClass="text-warning"
          title={title.replace(/ /g, "_")}
          tag="WAR"
          body={body}
          toastId={t.id}
        />
      ),
      nothingStyle("var(--color-warning)")
    );
    return id;
  },

  error: (title: string, body = "") => {
    const id = toast(
      (t) => (
        <ToastBody
          icon={() => <Icons.Error />}
          iconClass="text-error"
          title={title.replace(/ /g, "_")}
          tag="ERR"
          body={body}
          toastId={t.id}
        />
      ),
      nothingStyle("var(--color-error)")
    );
    return id;
  },
};

export { sysNotify as notify };
