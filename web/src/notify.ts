import toast from "solid-toast";

export const notify = {
  deleted: (sender: string, preview: string) =>
    toast.error(`${sender} DELETED: ${preview || "MESSAGE_CONTENT"}`, {
      duration: 5000,
      style: {
        background: "#121212",
        color: "#D71921",
        border: "1px solid rgba(215,25,33,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "8px",
      },
      iconTheme: { primary: "#D71921", secondary: "#121212" },
    }),

  info: (title: string, body = "") =>
    toast(body ? `${title} / ${body}` : title, {
      duration: 3000,
      style: {
        background: "#121212",
        color: "#EAEAEA",
        border: "1px solid rgba(255,255,255,0.1)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "8px",
      },
    }),

  success: (title: string, body = "") =>
    toast.success(body ? `${title} / ${body}` : title, {
      duration: 3000,
      style: {
        background: "#121212",
        color: "#10B981",
        border: "1px solid rgba(16,185,129,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "8px",
      },
      iconTheme: { primary: "#10B981", secondary: "#121212" },
    }),

  warning: (title: string, body = "") =>
    toast(body ? `${title} / ${body}` : title, {
      duration: 4000,
      icon: "!",
      style: {
        background: "#121212",
        color: "#fbbf24",
        border: "1px solid rgba(251,191,36,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "8px",
      },
    }),

  error: (title: string, body = "") =>
    toast.error(body ? `${title} / ${body}` : title, {
      duration: 4000,
      style: {
        background: "#121212",
        color: "#D71921",
        border: "1px solid rgba(215,25,33,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "8px",
      },
      iconTheme: { primary: "#D71921", secondary: "#121212" },
    }),
};
