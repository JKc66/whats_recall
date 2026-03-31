import toast from "solid-toast";

export const notify = {
  deleted: (sender: string, preview: string) =>
    toast.error(`${sender} DELETED: ${preview || "[MESSAGE]"}`, {
      duration: 5000,
      style: {
        background: "#0A0A0A",
        color: "#E61919",
        border: "1px solid rgba(230,25,25,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "0px",
      },
      iconTheme: { primary: "#E61919", secondary: "#0A0A0A" },
    }),

  info: (title: string, body = "") =>
    toast(body ? `${title} / ${body}` : title, {
      duration: 3000,
      style: {
        background: "#0A0A0A",
        color: "#EAEAEA",
        border: "1px solid rgba(255,255,255,0.1)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "0px",
      },
    }),

  success: (title: string, body = "") =>
    toast.success(body ? `${title} / ${body}` : title, {
      duration: 3000,
      style: {
        background: "#0A0A0A",
        color: "#4AF626",
        border: "1px solid rgba(74,246,38,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "0px",
      },
      iconTheme: { primary: "#4AF626", secondary: "#0A0A0A" },
    }),

  warning: (title: string, body = "") =>
    toast(body ? `${title} / ${body}` : title, {
      duration: 4000,
      icon: "!",
      style: {
        background: "#0A0A0A",
        color: "#fbbf24",
        border: "1px solid rgba(251,191,36,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "0px",
      },
    }),

  error: (title: string, body = "") =>
    toast.error(body ? `${title} / ${body}` : title, {
      duration: 4000,
      style: {
        background: "#0A0A0A",
        color: "#E61919",
        border: "1px solid rgba(230,25,25,0.2)",
        "font-size": "11px",
        "text-transform": "uppercase",
        "letter-spacing": "0.1em",
        "border-radius": "0px",
      },
      iconTheme: { primary: "#E61919", secondary: "#0A0A0A" },
    }),
};
