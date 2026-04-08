import { initLogger, log as elog } from "evlog";
import { createFsDrain } from "evlog/fs";
import { inspect, styleText } from "util";

type Style = Parameters<typeof styleText>[0];

/** Stable hue per category (no giant map). SECURITY stays red for visibility. */
function categoryStyle(category: string): Style {
    if (category === "SECURITY") return "redBright";
    const palette: Style[] = [
        "cyan",
        "green",
        "yellow",
        "blue",
        "magenta",
        "greenBright",
        "cyanBright",
        "yellowBright",
    ];
    let h = 0;
    for (let i = 0; i < category.length; i++) {
        h = (h + category.charCodeAt(i)) % 65521;
    }
    return palette[h % palette.length]!;
}

function ansiOn(): boolean {
    if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
        return false;
    }
    if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") {
        return true;
    }
    if (process.env.pm_id !== undefined) {
        return true;
    }
    return process.stdout.isTTY === true;
}

/** Matches package name — used as `service` on every drained wide event (evlog / NDJSON). */
const SERVICE_NAME = "whatsapp-deleted-messages-monitor";

initLogger({
    env: {
        service: SERVICE_NAME,
        environment:
            process.env.NODE_ENV === "production"
                ? "production"
                : "development",
    },
    silent: true, // Console: custom compact line below; evlog still drains structured events
    drain: createFsDrain({
        dir: ".evlog/logs",
    }),
});

const lastLogs = new Map<string, number>();

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.getPrototypeOf(v) === Object.prototype
    );
}

/**
 * Map app categories + message text to evlog levels so drains can filter (error/warn/info).
 */
function pickElogLevel(
    category: string,
    message: string,
): "error" | "warn" | "info" {
    const m = message.toLowerCase();
    if (
        category === "SECURITY" ||
        m.includes("fatal") ||
        m.includes("critical")
    ) {
        return "error";
    }
    if (
        m.startsWith("failed ") ||
        m.includes(" failed:") ||
        m.includes("failed to") ||
        m.includes("unhandled") ||
        m.includes("error getting chats") ||
        /^error\b/.test(m)
    ) {
        return "warn";
    }
    return "info";
}

/**
 * Emit to evlog. The two-string form is evlog’s tagged API; the first argument is stored as `tag` in drained NDJSON.
 * Extra args become a wide event with `category`, `message`, and either `context` (single plain object) or `details`.
 */
function emitEvlog(category: string, message: string, args: unknown[]) {
    const level = pickElogLevel(category, message);
    const emit = elog[level] as typeof elog.info;

    if (args.length === 0) {
        emit(category, message);
        return;
    }

    emit({
        category,
        message,
        ...(args.length === 1 && isPlainObject(args[0])
            ? { context: args[0] }
            : { details: args }),
    });
}

export function log(category: string, message: string, ...args: any[]) {
    const isTest = process.env.NODE_ENV === "test";
    const isVerbose = process.env.VERBOSE === "true";

    // Basic deduplication: avoid repeating exact same message within 3 seconds unless verbose
    const logKey = `${category}:${message}`;
    const now = Date.now();
    if (
        !isVerbose &&
        lastLogs.has(logKey) &&
        now - lastLogs.get(logKey)! < 3000
    )
        return;
    lastLogs.set(logKey, now);

    if (!isTest || isVerbose) {
        const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
        const color = ansiOn();
        const cleanedArgs = args.map((arg) => {
            if (typeof arg === "object" && arg !== null) {
                const inspected = inspect(arg, {
                    depth: 1,
                    colors: color,
                    breakLength: Infinity,
                    compact: true,
                });
                return inspected.length > 400
                    ? inspected.slice(0, 400) + "... (truncated)"
                    : inspected;
            }
            return arg;
        });
        const timePart = `[${time}]`;
        const cat = `[${category}]`;
        const line = `${timePart} ${cat} ${message}`;
        console.log(
            color
                ? `${styleText("dim", timePart)} ${styleText(categoryStyle(category), cat)} ${message}`
                : line,
            ...cleanedArgs,
        );
    }

    emitEvlog(category, message, args);
}
