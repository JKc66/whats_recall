import { initLogger, log as elog } from "evlog";
import { createFsDrain } from "evlog/fs";
import { inspect, styleText } from "util";

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
 * Emit to evlog using the public API: tagged `(category, message)` or a wide event object.
 * See: evlog tagged logs → `{ tag, message }` on the wire; objects merge as structured fields.
 */
function emitEvlog(category: string, message: string, args: unknown[]) {
    const level = pickElogLevel(category, message);
    const emit = elog[level] as typeof elog.info;

    if (args.length === 0) {
        emit(category, message);
        return;
    }

    if (args.length === 1 && isPlainObject(args[0])) {
        emit({
            category,
            message,
            context: args[0],
        });
        return;
    }

    emit({
        category,
        message,
        details: args,
    });
}

export function log(category: string, message: string, ...args: any[]) {
    const tag = String(category).trim().replace(/\s+/g, " ");
    const isTest = process.env.NODE_ENV === "test";
    const isVerbose = process.env.VERBOSE === "true";

    // Basic deduplication: avoid repeating exact same message within 3 seconds unless verbose
    const logKey = `${tag}:${message}`;
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
        const cat = `[${tag}]`;
        const plain = `[${time}] ${cat} ${message}`;
        const out = color
            ? `${styleText("dim", `[${time}]`)} ${styleText("cyan", cat)} ${message}`
            : plain;
        console.log(out, ...cleanedArgs);
    }

    emitEvlog(tag, message, args);
}
