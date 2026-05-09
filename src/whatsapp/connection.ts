import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
    isJidGroup,
    WAMessage,
} from "@whiskeysockets/baileys";
import { existsSync, mkdirSync } from "fs";
import { rm } from "fs/promises";
import { join } from "path";
import pino from "pino";
import { log } from "../logger.js";
import { getDb, getDataDir } from "../db/database.js";
import { syncService } from "./sync.ts";
import { MessageProcessor } from "./processor.ts";
import { downloadProfilePic } from "./media.ts";
import { getChatName, extractJidId } from "./utils.ts";
import { BroadcastFn, PairingStatus } from "../types.ts";

const getAuthDir = () => join(getDataDir(), "baileys_auth");

export class WhatsAppConnection {
    private sock: any = null;
    public isReady = false;
    public isAuthenticated = false;
    private pairingData: PairingStatus = {
        type: null,
        data: null,
        connected: false,
        authenticated: false,
    };
    private reconnectAttempts = 0;
    private isInitializing = false;
    public myId: string | null = null;
    private processor: MessageProcessor | null = null;
    private lastPairingCodeRequest = 0;
    private pairingRequested = false;
    private notifyWhatsApp = false;

    constructor(private broadcast: BroadcastFn) {
        if (!existsSync(getAuthDir()))
            mkdirSync(getAuthDir(), { recursive: true });

        const s = getDb().getSettings();
        this.notifyWhatsApp = s.whatsapp_notify === "true";
        setInterval(() => {
            const s = getDb().getSettings();
            this.notifyWhatsApp = s.whatsapp_notify === "true";
        }, 60_000);
    }

    public async start() {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            if (this.sock) {
                log("CONN", "Closing existing socket");
                this.sock.ev.removeAllListeners("connection.update");
                this.sock.end();
                this.sock = null;
            }

            log("CONN", "Initializing Socket");
            const { state: authState, saveCreds } =
                await useMultiFileAuthState(getAuthDir());

            let version: [number, number, number];
            try {
                const result = await fetchLatestBaileysVersion();
                version = result.version as [number, number, number];
            } catch {
                version = [2, 3000, 1015901307];
            }

            const s = getDb().getSettings();
            const isRegistered = authState?.creds?.registered;
            const printQR =
                !isRegistered &&
                s.whatsapp_pairing_method === "qr" &&
                this.pairingRequested;

            this.sock = makeWASocket({
                auth: authState,
                version,
                printQRInTerminal: printQR,
                logger: pino({ level: "silent" }) as any,
                syncFullHistory: true,
                generateHighQualityLinkPreview: true,
                browser: ["Ubuntu", "Chrome", "20.0.0"],
            });

            this.processor = new MessageProcessor(this.sock, this.broadcast);
            this.sock.ev.on("creds.update", saveCreds);

            if (!isRegistered && !this.pairingRequested) {
                log("CONN", "Auth required - waiting for UI request");
                if (this.sock && this.sock.ev) {
                    this.sock.ev.removeAllListeners("connection.update");
                    this.sock.end();
                    this.sock = null;
                }
            } else if (
                s.whatsapp_phone &&
                (s.whatsapp_pairing_method === "code" ||
                    !s.whatsapp_pairing_method) &&
                !authState.creds.registered
            ) {
                const now = Date.now();
                if (now - this.lastPairingCodeRequest > 60000) {
                    setTimeout(async () => {
                        try {
                            if (
                                !this.sock ||
                                this.sock.authState.creds.registered
                            )
                                return;
                            const formattedPhone = s.whatsapp_phone!.replace(
                                /[^0-9]/g,
                                "",
                            );
                            const code =
                                await this.sock.requestPairingCode(
                                    formattedPhone,
                                );
                            this.lastPairingCodeRequest = Date.now();
                            const readableCode =
                                code?.match(/.{1,4}/g)?.join("-") || code;
                            this.pairingData = {
                                type: "code",
                                data: readableCode,
                                connected: false,
                                authenticated: false,
                            };
                            log("CONN", `Pairing code generated and sent to UI`);
                            this.broadcast("status", this.pairingData);
                        } catch (err: any) {
                            log(
                                "CONN",
                                `Failed to request pairing code: ${err.message}`,
                            );
                        }
                    }, 3000);
                }
            }
        } finally {
            this.isInitializing = false;
        }

        if (!this.sock) return;

        this.sock.ev.on("messaging-history.set", ({ chats, contacts }: any) => {
            syncService.syncContacts(contacts || []);
            syncService.syncChats(chats || []);
        });

        this.sock.ev.on("contacts.upsert", (newContacts: any[]) =>
            syncService.syncContacts(newContacts),
        );
        this.sock.ev.on(
            "contacts.set",
            ({ contacts }: any) =>
                contacts && syncService.syncContacts(contacts),
        );
        this.sock.ev.on(
            "chats.set",
            ({ chats }: any) => chats && syncService.syncChats(chats),
        );
        this.sock.ev.on("groups.upsert", (newGroups: any[]) =>
            syncService.syncChats(
                newGroups.map((g) => ({ id: g.id, name: g.subject })),
            ),
        );
        this.sock.ev.on("groups.update", (updates: any[]) =>
            syncService.syncChats(
                updates
                    .filter((u) => u.id && u.subject)
                    .map((u) => ({ id: u.id, name: u.subject })),
            ),
        );
        this.sock.ev.on("contacts.update", (updates: any[]) =>
            syncService.syncContacts(updates),
        );
        this.sock.ev.on("chats.upsert", (newChats: any[]) =>
            syncService.syncChats(newChats),
        );
        this.sock.ev.on("chats.update", (updates: any[]) =>
            syncService.syncChats(updates),
        );

        this.sock.ev.on("connection.update", async (update: any) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr && this.pairingRequested) {
                const s = getDb().getSettings();
                if (s.whatsapp_pairing_method === "qr") {
                    this.pairingData = {
                        type: "qr",
                        data: qr,
                        connected: false,
                        authenticated: false,
                    };
                    this.broadcast("status", this.pairingData);
                }
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.message || "Unknown";
                log("CONN", `Closed: ${reason} (${statusCode})`);
                this.isReady = false;
                this.isAuthenticated = false;
                this.pairingData = {
                    ...this.pairingData,
                    connected: false,
                    authenticated: false,
                };
                this.broadcast("status", {
                    connected: false,
                    authenticated: false,
                    reason,
                });

                if (statusCode === 440 || !this.sock) return;

                const isTerminal =
                    this.sock?.authState?.creds?.registered &&
                    [DisconnectReason.loggedOut, 401, 403, 411].includes(
                        statusCode,
                    );
                if (isTerminal) {
                    await rm(getAuthDir(), { recursive: true, force: true });
                    mkdirSync(getAuthDir(), { recursive: true });
                    syncService.chats.clear();
                    syncService.contacts.clear();
                    this.reconnectAttempts = 0;
                    this.lastPairingCodeRequest = 0;
                    setTimeout(() => this.start(), 5000);
                } else {
                    this.reconnectAttempts++;
                    const delay = Math.min(
                        3000 * Math.pow(2, this.reconnectAttempts - 1),
                        60000,
                    );
                    setTimeout(() => this.start(), delay);
                }
            } else if (connection === "open") {
                this.reconnectAttempts = 0;
                this.isReady = true;
                this.isAuthenticated = true;
                this.myId = jidNormalizedUser(this.sock.user.id);
                this.pairingData = {
                    type: null,
                    data: null,
                    connected: true,
                    authenticated: true,
                    id: this.myId,
                };
                log("CONN", `Connected: ${this.myId}`);
                this.broadcast("status", {
                    connected: true,
                    authenticated: true,
                    id: this.myId,
                });
            }
        });

        this.sock.ev.on(
            "messages.upsert",
            async ({
                messages,
                type,
            }: {
                messages: WAMessage[];
                type: string;
            }) => {
                if (type !== "notify" && type !== "append") return;
                for (const msg of messages) {
                    try {
                        if (this.processor)
                            await this.processor.handleMessage(msg);
                    } catch (e: any) {
                        log("CONN", `Msg error: ${e.message}`);
                    }
                }
            },
        );

        this.sock.ev.on("messages.update", async (events: any[]) => {
            for (const event of events) {
                if (this.processor)
                    await this.processor.handleMessageUpdate(event);
            }
        });
    }

    public async getWhatsAppChats(force = false) {
        if (!this.isReady || !this.sock) return [];
        try {
            // 1. Fast path: check DB cache first
            let allChats = force ? [] : getDb().getWaContacts();
            const monitored = new Set<string>(
                getDb()
                    .getMonitoredChats()
                    .map((m: any) => m.chat_id),
            );

            if (allChats.length === 0) {
                log("CONN", "Syncing chats...");
                if (force) getDb().clearWaContacts(); // Wipe stale cache on force refresh
                allChats = await syncService.getAggregatedChats({
                    ...this.sock,
                    monitored,
                });
            }

            if (this.sock?.signalRepository?.lidMapping) {
                await Promise.all(
                    Array.from(monitored).map(async (jid: any) => {
                        try {
                            if (jid.includes("@lid")) {
                                const pn =
                                    await this.sock.signalRepository.lidMapping.getPNForLID(
                                        jid,
                                    );
                                if (pn)
                                    monitored.add(
                                        pn.includes("@s.whatsapp.net")
                                            ? pn
                                            : pn + "@s.whatsapp.net",
                                    );
                            } else if (jid.includes("@s.whatsapp.net")) {
                                const lid =
                                    await this.sock.signalRepository.lidMapping.getLIDForPN(
                                        jid,
                                    );
                                if (lid)
                                    monitored.add(
                                        lid.includes("@lid")
                                            ? lid
                                            : lid + "@lid",
                                    );
                            }
                        } catch (_e) {
                            /* ignore mapping errors */
                        }
                    }),
                );
            }

            const profilePics = getDb().getChatProfilePics(
                allChats.map((c: any) => c.id),
            );
            const results = await Promise.all(
                allChats.map(async (c: any) => {
                    let name = getChatName(c.id, c.name);
                    const isMe =
                        this.myId &&
                        (c.id === this.myId ||
                            (c.id.includes("@lid") &&
                                c.id.includes(extractJidId(this.myId))));

                    if (isMe && (!name || name === extractJidId(c.id))) {
                        name = "YOU";
                    }

                    return {
                        id: c.id,
                        name,
                        category: c.category || "chat",
                        isGroup: c.isGroup || isJidGroup(c.id),
                        isMe,
                        isSaved: !!c.isSaved,
                        isBusiness: !!c.isBusiness,
                        timestamp: c.timestamp || 0,
                        isMonitored: monitored.has(c.id),
                        hasName: !!(
                            name &&
                            name !== extractJidId(c.id) &&
                            name !== "YOU"
                        ),
                        profilePic:
                            profilePics[c.id] ||
                            getDb().getChatProfilePic(c.id),
                        lid:
                            c.lids && c.lids.length > 0
                                ? c.lids[0]
                                : c.id.includes("@lid")
                                  ? extractJidId(c.id)
                                  : null,
                    };
                }),
            );

            // Background refresh for monitored chats
            results
                .filter((c) => c.isMonitored)
                .slice(0, 30)
                .forEach((c) => this.getProfilePic(c.id).catch(() => {}));

            log("CONN", `Found ${results.length} chats`);
            return results.sort((a, b) => b.timestamp - a.timestamp);
        } catch (e: any) {
            log("CONN", `Error getting chats: ${e.message}`);
            return [];
        }
    }

    public async getProfilePic(jid: string) {
        if (!jid || !this.sock) return null;
        const res = await downloadProfilePic(jid, this.sock);
        if (res?.isNew) {
            this.broadcast("profile_pic_updated", {
                chat_id: jid,
                profile_pic: res.filename,
            });
        }
        return res?.filename || null;
    }

    public async reset(requestPairing = true) {
        log("CONN", `Manual reset`);
        this.pairingRequested = requestPairing;
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners("connection.update");
                await this.sock.logout();
                this.sock.end();
            } catch (_e) {
                /* ignore shutdown errors */
            }
            this.sock = null;
        }
        await rm(getAuthDir(), { recursive: true, force: true });
        mkdirSync(getAuthDir(), { recursive: true });
        this.pairingData = {
            type: null,
            data: null,
            connected: false,
            authenticated: false,
        };
        this.isReady = this.isAuthenticated = false;
        syncService.chats.clear();
        syncService.contacts.clear();
        this.reconnectAttempts = this.lastPairingCodeRequest = 0;
        this.broadcast("status", {
            connected: false,
            authenticated: false,
            reason: "Manual reset",
        });
        setTimeout(() => !this.sock && this.start(), 2000);
    }

    public async deleteChatFully(chatId: string) {
        const ids = await syncService.getRelatedJids(chatId, this.sock);
        if (ids.length > 0) {
            getDb().deleteChatsAndMessages(ids);
            ids.forEach((id) => getDb().removeMonitoredChat(id));
        }
    }

    public getPairingData(): PairingStatus {
        return this.pairingData;
    }
}
