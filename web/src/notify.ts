import toast from "solid-toast";

export const notify = {
  deleted: (sender: string, preview: string) =>
    toast.error(`${sender} deleted a message: ${preview || "[Media]"}`, {
      duration: 5000,
      style: {
        background: "#1a1a2e",
        color: "#f87171",
        border: "1px solid rgba(248,113,113,0.2)",
        "font-size": "13px",
      },
      iconTheme: { primary: "#f87171", secondary: "#1a1a2e" },
    }),

  info: (title: string, body = "") =>
    toast(body ? `${title}: ${body}` : title, {
      duration: 3000,
      style: {
        background: "#1a1a2e",
        color: "#e4e4e9",
        border: "1px solid rgba(255,255,255,0.08)",
        "font-size": "13px",
      },
    }),

  success: (title: string, body = "") =>
    toast.success(body ? `${title}: ${body}` : title, {
      duration: 3000,
      style: {
        background: "#1a1a2e",
        color: "#34d399",
        border: "1px solid rgba(52,211,153,0.2)",
        "font-size": "13px",
      },
      iconTheme: { primary: "#34d399", secondary: "#1a1a2e" },
    }),

  warning: (title: string, body = "") =>
    toast(body ? `${title}: ${body}` : title, {
      duration: 4000,
      icon: "⚠",
      style: {
        background: "#1a1a2e",
        color: "#fbbf24",
        border: "1px solid rgba(251,191,36,0.2)",
        "font-size": "13px",
      },
    }),

  error: (title: string, body = "") =>
    toast.error(body ? `${title}: ${body}` : title, {
      duration: 4000,
      style: {
        background: "#1a1a2e",
        color: "#f87171",
        border: "1px solid rgba(248,113,113,0.2)",
        "font-size": "13px",
      },
      iconTheme: { primary: "#f87171", secondary: "#1a1a2e" },
    }),
};
