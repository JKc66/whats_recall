import {
    getContentType,
    jidNormalizedUser,
    WAMessage,
    isJidGroup,
    proto,
} from "@whiskeysockets/baileys";
import { aesDecryptGCM, hkdf, hmacSign } from "@whiskeysockets/baileys/lib/Utils/crypto.js";
import { log } from "../logger.js";
import { getDb, getMediaDir } from "../db/database.js";
import { syncService } from "./sync.ts";
import { downloadMedia, downloadProfilePic } from "./media.ts";
import { join } from "path";
import { BroadcastFn, WhatsAppMessage } from "../types.ts";
import {
    getChatNameAsync,
    normalizeMessage,
    getMessageBody,
    enrichMentions,
} from "./utils.ts";
import { actionsQueue } from "./queue.ts";

function extractProtocolMessage(message: any): any {
    if (!message) return null;
    if (message.protocolMessage) return message.protocolMessage;
    if (message.ephemeralMessage?.message) return extractProtocolMessage(message.ephemeralMessage.message);
    if (message.documentWithCaptionMessage?.message) return extractProtocolMessage(message.documentWithCaptionMessage.message);
    return null;
}

function extractEditedMessage(message: any): any {
    if (!message) return null;
    if (message.editedMessage) return message.editedMessage;
    if (message.ephemeralMessage?.message) return extractEditedMessage(message.ephemeralMessage.message);
    if (message.documentWithCaptionMessage?.message) return extractEditedMessage(message.documentWithCaptionMessage.message);
    return null;
}

const MESSAGE_EDIT_SECRET_SCOPE = "Message Edit";

function isSecretMessageEdit(secretEncType: any): boolean {
    return (
        secretEncType === proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT ||
        secretEncType === "MESSAGE_EDIT"
    );
}

function toBytes(value: any): Uint8Array | null {
    if (!value) return null;
    if (value instanceof Uint8Array) return value;
    if (typeof value === "string") return Buffer.from(value, "base64");
    if (Array.isArray(value)) return Buffer.from(value);
    if (value.type === "Buffer" && Array.isArray(value.data)) {
        return Buffer.from(value.data);
    }
    return null;
}

function generateMessageSecretKey(
    originalMsgId: string,
    originalSender: string,
    modificationSender: string,
    originalMsgSecret: Uint8Array,
): Uint8Array {
    const sign = Buffer.concat([
        Buffer.from(originalMsgId, "utf8"),
        Buffer.from(originalSender, "utf8"),
        Buffer.from(modificationSender, "utf8"),
        Buffer.from(MESSAGE_EDIT_SECRET_SCOPE, "utf8"),
        new Uint8Array([1]),
    ]);
    const key0 = hmacSign(originalMsgSecret, new Uint8Array(32), "sha256");
    return hmacSign(sign, key0, "sha256");
}

function decryptEditedMessage(
    encPayload: Uint8Array,
    encIv: Uint8Array,
    secret: Uint8Array,
    originalMsgId: string,
    originalSender: string,
    modificationSender: string,
): any | null {
    try {
        const decKey = generateMessageSecretKey(
            originalMsgId,
            originalSender,
            modificationSender,
            secret,
        );
        const decrypted = aesDecryptGCM(encPayload, decKey, encIv, new Uint8Array(0));
        return proto.Message.decode(decrypted);
    } catch (err: any) {
        log("PROCESSOR", `Decryption of edit failed: ${err.message}`);
        return null;
    }
}

export class MessageProcessor {
    constructor(
        private sock: any,
        private broadcast: BroadcastFn,
    ) {}

    /**
     * Verifies if a chat is being monitored. Checks both Phone Number (PN)
     * and Linked Identifier (LID) to ensure consistent monitoring across JID types.
     */
    private async checkIsMonitored(jid: string): Promise<boolean> {
        if (!jid) return false;
        const ids = await syncService.getRelatedJids(jid, this.sock);
        return ids.some((id) => getDb().isMonitored(id));
    }

    /**
     * Resolves the actual sender JID, handling WhatsApp's LID/PN mapping fallbacks.
     * Uses participantAlt/remoteJidAlt if the primary ID is an LID to ensure we store the Phone Number sender.
     */
    private async resolveSender(
        msg: WAMessage,
        chatId: string,
        isGrp: boolean,
    ): Promise<string> {
        if (msg.key.fromMe) return jidNormalizedUser(this.sock.user.id);

        let senderId = isGrp ? msg.key.participant || chatId : chatId;

        // Fallback to PN-based IDs (participantAlt/remoteJidAlt) if the current ID is an LID
        if (
            isGrp &&
            (msg.key as any).participantAlt &&
            senderId.includes("@lid")
        ) {
            senderId = (msg.key as any).participantAlt;
        } else if (
            !isGrp &&
            (msg.key as any).remoteJidAlt &&
            senderId.includes("@lid")
        ) {
            senderId = (msg.key as any).remoteJidAlt;
        }

        senderId = await syncService.resolvePN(senderId, this.sock);
        return senderId;
    }

    private async handleRevoke(currentKey: any, revokedKey: any) {
        const chatId = currentKey.remoteJid;
        if (!(await this.checkIsMonitored(chatId))) return;

        const revokeId = currentKey.id;
        const origId = revokedKey?.id;

        let messageId = origId || revokeId;
        const cached =
            getDb().getMessage(messageId) ||
            getDb().getMessage(revokeId) ||
            (origId ? getDb().getMessageByOriginalId(origId) : null);
        if (cached) messageId = cached.message_id;

        getDb().markDeleted(messageId);
        if (origId && origId !== revokeId) getDb().markDeleted(revokeId);

        const deleted = getDb().getMessage(messageId);
        if (deleted) {
            const chat = getDb().getChat(deleted.chat_id);
            const chatName = chat?.name || deleted.chat_id;

            log(
                "PROCESSOR",
                `Deleted in ${chatName} by ${deleted.sender_name || "unknown"}`,
            );
            this.broadcast("message_deleted", {
                ...deleted,
                chatName,
                isGroup: chat?.is_group || 0,
                deleted_at: new Date().toISOString(),
            });

            const settings = getDb().getSettings();
            if (settings.whatsapp_notify === "true" && !deleted.is_from_me) {
                await this.sendDeletionNotification(deleted, chatName);
            }
        }
    }

    /**
     * Processes message update events, specifically looking for 'REVOKE' (deletion)
     * and 'MESSAGE_EDIT' protocol messages.
     */
    public async handleMessageUpdate(event: any) {
        const protocolMsg = extractProtocolMessage(event.update?.message);
        const editedMsg = extractEditedMessage(event.update?.message);

        if (protocolMsg) {
            // Normalize JID in the main event key
            const key = { ...event.key };
            if (key.remoteJid) key.remoteJid = jidNormalizedUser(key.remoteJid);
            if (key.participant)
                key.participant = jidNormalizedUser(key.participant);

            await this.handleProtocolMessage(key, protocolMsg);
        } else if (editedMsg) {
            // Normalize JID in the main event key
            const key = { ...event.key };
            if (key.remoteJid) key.remoteJid = jidNormalizedUser(key.remoteJid);
            if (key.participant)
                key.participant = jidNormalizedUser(key.participant);

            await this.handleEdit(key, editedMsg.message);
        }
    }

    /**
     * Centralized handler for protocol messages (Revoke/Edit).
     */
    private async handleProtocolMessage(key: any, protocolMsg: any) {
        const editKey = { ...protocolMsg.key };

        const myId = jidNormalizedUser(this.sock.user.id);
        const envelopeRemoteJid = jidNormalizedUser(key.remoteJid);

        // We MUST resolve to PN for comparison because received edits often use our LID
        const resolvedInternal = editKey.remoteJid
            ? await syncService.resolvePN(editKey.remoteJid, this.sock)
            : null;

        // If internal ID is missing or resolves to "me", it's a received edit.
        // We must use the envelope JID (the actual chat).
        if (!resolvedInternal || resolvedInternal === myId) {
            editKey.remoteJid = envelopeRemoteJid;
        } else {
            editKey.remoteJid = jidNormalizedUser(editKey.remoteJid!);
        }

        if (editKey.participant)
            editKey.participant = jidNormalizedUser(editKey.participant);

        if (protocolMsg.type === 0 || protocolMsg.type === "REVOKE") {
            await this.handleRevoke(key, editKey);
        } else if (
            protocolMsg.type === 14 ||
            protocolMsg.type === 16 ||
            protocolMsg.type === "MESSAGE_EDIT"
        ) {
            await this.handleEdit(editKey, protocolMsg.editedMessage);
        }
    }

    /**
     * Processes an edited message, updates the local database, and broadcasts the event.
     */
    private async handleEdit(key: any, editedMessage: any) {
        const messageId = key.id;
        const rawChatId = key.remoteJid;

        if (!messageId) {
            log("PROCESSOR", "Edit aborted: no msg ID");
            return;
        }
        if (!rawChatId) {
            log("PROCESSOR", `Edit aborted: no chat ID (${messageId})`);
            return;
        }

        const chatId = await syncService.resolvePN(rawChatId, this.sock);
        if (!(await this.checkIsMonitored(chatId))) {
            log("PROCESSOR", `Edit ignored: ${chatId} not monitored`);
            return;
        }

        const {
            content: editContent,
            type: mType,
            isViewOnce: _evt,
            contextInfo: editContext,
        } = normalizeMessage(editedMessage) as any;
        if (!editContent || !mType) {
            log("PROCESSOR", `Edit aborted: no content (${messageId})`);
            return;
        }

        let body = getMessageBody(editContent, mType);
        if (body && editContext?.mentionedJid?.length) {
            body = await enrichMentions(
                body,
                editContext.mentionedJid,
                this.sock,
            );
        }

        if (body !== undefined && body !== null) {
            const oldMsg = getDb().getMessage(messageId);
            const oldBody = oldMsg?.body;

            if (!oldMsg) {
                // If message doesn't exist yet (e.g. edit arrived before message or during sync),
                // create a stub so we can track future edits and show it in UI
                const isGrp = !!isJidGroup(chatId);

                let senderId: string;
                if (key.fromMe) {
                    senderId = jidNormalizedUser(this.sock.user.id);
                } else {
                    senderId = await syncService.resolvePN(
                        key.participant || (isGrp ? "" : rawChatId),
                        this.sock,
                    );
                }

                const senderName = await getChatNameAsync(
                    senderId,
                    null,
                    this.sock,
                );

                getDb().saveMessage({
                    message_id: messageId,
                    chat_id: chatId,
                    sender_id: senderId,
                    sender_name: senderName,
                    body: body,
                    type: "chat",
                    timestamp: Math.floor(Date.now() / 1000),
                    is_from_me: key.fromMe ? 1 : 0,
                });
            } else {
                getDb().updateMessageBody(messageId, body);

                if (
                    oldBody !== undefined &&
                    oldBody !== null &&
                    oldBody !== body
                ) {
                    getDb().addMessageEdit(messageId, oldBody, body);
                }
            }

            log("PROCESSOR", `Edited: ${messageId} in ${chatId}`);

            this.broadcast("message_edited", {
                message_id: messageId,
                chat_id: chatId,
                body: body,
                old_body: oldBody,
                updated_at: new Date().toISOString(),
            });
        }
    }

    public async handleMessage(msg: WAMessage) {
        const rawChatId = msg.key?.remoteJid;
        if (!rawChatId || rawChatId === "status@broadcast") return;

        // Normalize to Phone Number for single unified chat view
        const chatId = await syncService.resolvePN(rawChatId, this.sock);
        const isGrp = !!isJidGroup(chatId);

        // Process "View Once" stubs that contain metadata but no message body (standard Baileys behavior)
        if (!msg.message) {
            if ((msg.key as any)?.isViewOnce && chatId) {
                if (!(await this.checkIsMonitored(chatId))) return;

                log("PROCESSOR", `📸 View-once stub: ${chatId}`);
                const senderId = await this.resolveSender(msg, chatId, isGrp);
                const senderName = await getChatNameAsync(
                    senderId,
                    msg.pushName || null,
                    this.sock,
                );
                const chatName = await getChatNameAsync(
                    chatId,
                    null,
                    this.sock,
                );
                const lid = rawChatId.includes("@lid")
                    ? rawChatId
                    : await syncService.resolveLID(rawChatId, this.sock);

                getDb().upsertChat(chatId, chatName, isGrp, lid);

                const msgData = {
                    message_id: msg.key.id!,
                    chat_id: chatId,
                    sender_id: senderId,
                    sender_name: senderName,
                    body: "👁️ View-Once media",
                    type: "chat",
                    has_media: false,
                    media_type: undefined as string | undefined,
                    media_filename: undefined as string | undefined,
                    media_path: undefined as string | undefined,
                    media_sha256: undefined as string | undefined,
                    timestamp: msg.messageTimestamp as number,
                    is_from_me: msg.key.fromMe ? 1 : 0,
                    is_deleted: 0,
                    is_view_once: 1,
                    original_id: msg.key.id!,
                    quoted_stanza_id: null as string | null,
                    quoted_sender: null as string | null,
                    quoted_preview: null as string | null,
                };

                getDb().saveMessage(msgData);
                this.broadcast("new_message", {
                    ...msgData,
                    chat_name: chatName,
                    is_group: isGrp ? 1 : 0,
                    profile_pic: getDb().getChatProfilePic(chatId),
                });
            }
            return;
        }

        const mType = getContentType(msg.message) || "stub";

        // Automatically track and save metadata for any newly encountered chats
        if (!syncService.chats.has(chatId) && chatId) {
            syncService.chats.set(chatId, { id: chatId });
            syncService.save();
        }

        if (!(await this.checkIsMonitored(chatId))) return;

        log("PROCESSOR", `[${mType}] ${chatId}`);

        const normalized = normalizeMessage(msg.message);
        const isViewOnce = normalized.isViewOnce;
        const messageType = normalized.type || "stub";
        const content =
            normalized.content && normalized.type
                ? (normalized.content as any)[normalized.type]
                : null;
        const contextInfo = normalized.contextInfo;

        if (isViewOnce) {
            log("PROCESSOR", `📸 View-once [${messageType}]: ${chatId}`);
        }

        // Assign back the unwrapped message
        msg.message = normalized.content;

        if (!normalized.type) {
            if (isViewOnce) log("PROCESSOR", "View-once abort: no type");
            return;
        }

        if (messageType === "protocolMessage") {
            await this.handleProtocolMessage(msg.key, content);
            return;
        }

        if (messageType === "secretEncryptedMessage") {
            const secretMsg = content;
            if (secretMsg && isSecretMessageEdit(secretMsg.secretEncType)) {
                const targetKey = secretMsg.targetMessageKey;
                if (targetKey && targetKey.id) {
                    const oldMsg = getDb().getMessage(targetKey.id);
                    if (oldMsg && oldMsg.message_secret) {
                        const encPayload = toBytes(secretMsg.encPayload);
                        const encIv = toBytes(secretMsg.encIv);
                        if (!encPayload?.length || !encIv?.length) {
                            log("PROCESSOR", `Edit decryption skipped: encrypted payload missing (${targetKey.id})`);
                            return;
                        }

                        const secret = Buffer.from(oldMsg.message_secret, "base64");
                        const ownSender = jidNormalizedUser(
                            msg.key?.addressingMode === "lid" && this.sock.user?.lid
                                ? this.sock.user.lid
                                : this.sock.user.id,
                        );
                        const envelopeAuthorRaw = msg.key.fromMe
                            ? ownSender
                            : jidNormalizedUser(
                                  msg.key.participant ||
                                      msg.key.remoteJid ||
                                      rawChatId,
                              );
                        const originalSender = jidNormalizedUser(
                            targetKey.participant ||
                                (targetKey.fromMe
                                    ? envelopeAuthorRaw
                                    : targetKey.remoteJid || rawChatId),
                        );
                        const modificationSender = envelopeAuthorRaw;

                        const decrypted = decryptEditedMessage(
                            encPayload,
                            encIv,
                            secret,
                            targetKey.id,
                            originalSender,
                            modificationSender,
                        );
                        if (decrypted) {
                            log("PROCESSOR", `Decrypted edit for ${targetKey.id}`);
                            const editKey: any = { ...targetKey };
                            editKey.remoteJid = chatId;
                            if (editKey.participant) {
                                editKey.participant = await syncService.resolvePN(editKey.participant, this.sock);
                            }
                            log("PROCESSOR", `about to handleEdit: remoteJid=${editKey.remoteJid} participant=${editKey.participant} fromMe=${editKey.fromMe}`);
                            await this.handleEdit(editKey, decrypted);
                            log("PROCESSOR", `handleEdit completed for ${targetKey.id}`);
                        }
                    } else {
                        log("PROCESSOR", `Edit decryption skipped: original message secret not found in DB (${targetKey.id})`);
                    }
                }
            }
            return;
        }

        // Process incoming message reactions and sync them to the database
        if (messageType === "reactionMessage") {
            const reaction = content;
            const targetId = reaction.key?.id;
            if (!targetId) return;

            const emoji = reaction.text || "";
            const senderId = await this.resolveSender(msg, chatId, isGrp);
            const senderName = await getChatNameAsync(
                senderId,
                msg.pushName || null,
                this.sock,
            );

            getDb().addReaction(targetId, senderId, senderName, emoji);
            this.broadcast("message_reaction", {
                chat_id: chatId,
                message_id: targetId,
                sender_id: senderId,
                sender_name: senderName,
                emoji: emoji,
            });
            return;
        }

        const senderId = await this.resolveSender(msg, chatId, isGrp);
        const senderName = await getChatNameAsync(
            senderId,
            msg.pushName || null,
            this.sock,
        );
        const chatName = await getChatNameAsync(chatId, null, this.sock);
        const lid = rawChatId.includes("@lid")
            ? rawChatId
            : await syncService.resolveLID(rawChatId, this.sock);

        // Update contacts/chats with push name if we just discovered a better one
        if (msg.pushName && senderId) {
            const existing = syncService.contacts.get(senderId);
            if (
                !existing ||
                !existing.name ||
                /^[0-9+ ]+$/.test(existing.name)
            ) {
                syncService.contacts.set(senderId, {
                    ...(existing || {}),
                    id: senderId,
                    notify: msg.pushName,
                });
                syncService.save();
            }
        }

        getDb().upsertChat(chatId, chatName, isGrp, lid);

        // Asynchronously fetch and cache the profile picture if not already stored
        this.getProfilePicAsync(chatId);

        let body = getMessageBody(msg.message, messageType) || "";
        if (body && contextInfo?.mentionedJid?.length) {
            body = await enrichMentions(
                body,
                contextInfo.mentionedJid,
                this.sock,
            );
        }

        // Extract and process quoted message metadata (replies), including view-once content in replies
        let quotedStanzaId: string | null = null;
        let quotedSender: string | null = null;
        let quotedPreview: string | null = null;
        let quotedViewOnceMedia: any = null;

        if (contextInfo && contextInfo.quotedMessage) {
            quotedStanzaId = contextInfo.stanzaId || null;
            const rawQuotedSender = contextInfo.participant || null;
            if (rawQuotedSender) {
                const resolvedQuotedSender = await syncService.resolvePN(
                    rawQuotedSender,
                    this.sock,
                );
                quotedSender = await getChatNameAsync(
                    resolvedQuotedSender,
                    null,
                    this.sock,
                );
            }

            // Check if quoted message contains view-once media
            const quotedStr = JSON.stringify(contextInfo.quotedMessage);
            const quotedIsViewOnce =
                quotedStr.includes("viewOnce") ||
                quotedStr.includes("viewOnceMessage");

            const {
                content: qMsg,
                type: qMsgType,
                contextInfo: qContext,
            } = normalizeMessage(contextInfo.quotedMessage) as any;
            const qContent = qMsg && qMsgType ? (qMsg as any)[qMsgType] : null;

            let preview = getMessageBody(qMsg, qMsgType, true) || "Message";

            if (qContext?.mentionedJid?.length) {
                preview = await enrichMentions(
                    preview,
                    qContext.mentionedJid,
                    this.sock,
                );
            }

            if (quotedIsViewOnce || qContent?.viewOnce) {
                preview =
                    "👁️ View Once " +
                    (preview.startsWith("👁️") ? preview.slice(2) : preview);

                // Try to download the quoted view-once media
                const quotedMediaTypes = [
                    "imageMessage",
                    "videoMessage",
                    "audioMessage",
                    "stickerMessage",
                    "documentMessage",
                ];
                if (
                    qMsgType &&
                    quotedMediaTypes.includes(qMsgType) &&
                    qContent
                ) {
                    log("PROCESSOR", "Downloading quoted view-once...");
                    try {
                        const fakeMsg = {
                            message: qMsg,
                            key: {
                                remoteJid: chatId,
                                id: quotedStanzaId,
                                participant: rawQuotedSender,
                            },
                        } as any;
                        const res = await downloadMedia(
                            fakeMsg,
                            qMsgType.replace("Message", ""),
                            this.sock,
                        );
                        if (res) {
                            quotedViewOnceMedia = {
                                ...res,
                                type: qMsgType.replace("Message", ""),
                            };
                            log(
                                "PROCESSOR",
                                `✅ Quoted view-once: ${quotedViewOnceMedia.path}`,
                            );
                        }
                    } catch (e: any) {
                        log(
                            "PROCESSOR",
                            `❌ Quoted view-once failed: ${e.message}`,
                        );
                    }
                }
            }

            quotedPreview = preview ? preview.slice(0, 100) : null;
        }

        // Download and store media attachments (images, videos, documents, stickers)
        let mediaPath = null;
        let mediaSha256: string | null = null;
        const mediaTypesMap: Record<string, string> = {
            imageMessage: "image",
            videoMessage: "video",
            audioMessage: "audio",
            stickerMessage: "sticker",
            documentMessage: "document",
            ptvMessage: "ptv",
            lottieStickerMessage: "lottieSticker",
        };

        const hasMediaCandidate = !!mediaTypesMap[messageType];

        if (hasMediaCandidate) {
            // Map lottieStickerMessage to sticker for downloader compatibility if needed
            const downloadType =
                messageType === "lottieStickerMessage"
                    ? "sticker"
                    : messageType.replace("Message", "");
            const mediaResult = await downloadMedia(
                msg,
                downloadType,
                this.sock,
            );
            if (mediaResult) {
                mediaPath = mediaResult.path;
                mediaSha256 = mediaResult.sha256hex;
            }
        }

        // If replying to a view-once message, save the recovered media to the original message
        if (quotedViewOnceMedia && quotedStanzaId) {
            getDb().updateMessageMedia(
                quotedStanzaId,
                quotedViewOnceMedia.path,
                quotedViewOnceMedia.sha256hex,
                quotedViewOnceMedia.type || "image",
            );

            // Broadcast the updated view-once message so the frontend reflects the recovered media immediately
            const updatedMsg =
                getDb().getMessage(quotedStanzaId) ||
                getDb().getMessageByOriginalId(quotedStanzaId);
            if (updatedMsg) {
                this.broadcast("message_updated", {
                    message_id: updatedMsg.message_id,
                    chat_id: chatId,
                    has_media: 1,
                    media_path: quotedViewOnceMedia.path,
                    media_type: quotedViewOnceMedia.type || "image",
                    type: quotedViewOnceMedia.type || "image",
                });
            }
        }

        const messageId = msg.key.id!;
        const existingMsg = getDb().getMessage(messageId);
        const rawSecret = normalized.content?.messageContextInfo?.messageSecret;
        const messageSecret = rawSecret ? Buffer.from(rawSecret).toString("base64") : undefined;


        const msgData: WhatsAppMessage = {
            message_id: messageId,
            chat_id: chatId,
            sender_id: senderId,
            sender_name: senderName,
            body,
            type: mediaTypesMap[messageType] || "chat",
            has_media: !!mediaPath,
            media_type: mediaPath
                ? content.mimetype || messageType.replace("Message", "")
                : undefined,
            media_filename: mediaPath
                ? content.fileName || undefined
                : undefined,
            media_path: mediaPath || undefined,
            media_sha256: mediaSha256 || undefined,
            timestamp: msg.messageTimestamp as number,
            is_from_me: msg.key.fromMe ? 1 : 0,
            is_deleted: existingMsg?.is_deleted || 0,
            is_view_once: isViewOnce ? 1 : 0,
            original_id: msg.key.id!,
            quoted_stanza_id: quotedStanzaId || undefined,
            quoted_sender: quotedSender || undefined,
            quoted_preview: quotedPreview || undefined,
            message_secret: messageSecret,
        };

        if (existingMsg) {
            // If we have an existing stub (probably from handleEdit),
            // we need to merge the full message details but record an edit if the bodies differ.
            // Baileys 'upsert' often contains the EDITED body if it was edited before we saw it.

            if (existingMsg.body !== body && body) {
                // The incoming 'body' is likely the original, and existingMsg.body is the edit
                getDb().addMessageEdit(messageId, body, existingMsg.body!);
            }

            getDb().saveMessage(msgData); // This uses INSERT OR IGNORE, but we want to update metadata

            const dbObj = getDb();
            dbObj.raw
                .query(
                    `
        UPDATE messages SET
          sender_id = ?, sender_name = ?, type = ?, has_media = ?,
          media_type = ?, media_filename = ?, media_path = ?, media_sha256 = ?,
          timestamp = ?, is_view_once = ?, quoted_stanza_id = ?,
          quoted_sender = ?, quoted_preview = ?, message_secret = ?, updated_at = datetime('now')
        WHERE message_id = ?
      `,
                )
                .run(
                    msgData.sender_id,
                    msgData.sender_name,
                    msgData.type,
                    msgData.has_media ? 1 : 0,
                    msgData.media_type || null,
                    msgData.media_filename || null,
                    msgData.media_path || null,
                    msgData.media_sha256 || null,
                    msgData.timestamp,
                    msgData.is_view_once ? 1 : 0,
                    msgData.quoted_stanza_id || null,
                    msgData.quoted_sender || null,
                    msgData.quoted_preview || null,
                    msgData.message_secret || null,
                    messageId,
                );
        } else {
            getDb().saveMessage(msgData);
        }

        if (isViewOnce)
            log(
                "PROCESSOR",
                `💾 ${msgData.type} (view-once) from ${senderName} in ${chatName}`,
            );

        this.broadcast("new_message", {
            ...msgData,
            chat_name: chatName,
            is_group: isGrp ? 1 : 0,
            profile_pic: getDb().getChatProfilePic(chatId),
        });

        // Forward a private notification copy if a View-Once message is detected and notifications are enabled
        const settings = getDb().getSettings();
        if (
            isViewOnce &&
            settings.whatsapp_notify === "true" &&
            !msgData.is_from_me
        ) {
            await this.sendViewOnceNotification(msgData, chatName);
        }
    }

    /**
     * Sends a replica of a View-Once message to the monitored user's own chat.
     */
    private async sendViewOnceNotification(
        msg: WhatsAppMessage,
        chatName: string,
    ) {
        try {
            if (!this.sock) return;
            const myId = jidNormalizedUser(this.sock.user.id);

            const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
            const from = msg.sender_name || "Unknown";
            const mType = msg.type ? msg.type.toUpperCase() : "MEDIA";
            const source = from === chatName ? from : `${from} @ ${chatName}`;

            const text = `👁️ *VIEW_ONCE* [${source}] @ ${time} [${mType}]`;

            if (msg.has_media && msg.media_path) {
                const fullPath = join(getMediaDir(), msg.media_path);
                if (await Bun.file(fullPath).exists()) {
                    const content: any = { caption: text };
                    if (msg.type === "image") content.image = { url: fullPath };
                    else if (msg.type === "video")
                        content.video = { url: fullPath };
                    else
                        content.document = {
                            url: fullPath,
                            fileName: msg.media_filename || "media",
                        };

                    actionsQueue.enqueue(async () => {
                        await this.sock.sendMessage(myId, content);
                        log(
                            "PROCESSOR",
                            `📤 View-once notify: ${msg.message_id}`,
                        );
                    }, `VIEW_ONCE_NOTIFICATION [${msg.message_id}]`);
                }
            }
        } catch (err: any) {
            log("PROCESSOR", `Failed view-once notify: ${err.message}`);
        }
    }

    /**
     * Sends a notification with the content of a deleted message to the monitored user tray.
     */
    private async sendDeletionNotification(msg: any, chatName: string) {
        try {
            if (!this.sock) return;
            const myId = jidNormalizedUser(this.sock.user.id);

            const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
            const from = msg.sender_name || "Unknown";
            const mType =
                msg.type !== "chat" && msg.type
                    ? ` [${msg.type.toUpperCase()}]`
                    : "";
            const source = from === chatName ? from : `${from} @ ${chatName}`;

            const text = [
                `🗑️ *RECOVERED* [${source}] @ ${time}${mType}:`,
                msg.body
                    ? `> ${msg.body}`
                    : msg.has_media
                      ? ""
                      : "_[No Content]_",
            ]
                .filter((r: string) => r !== "")
                .join("\n");

            if (msg.has_media && msg.media_path) {
                const fullPath = join(getMediaDir(), msg.media_path);
                if (await Bun.file(fullPath).exists()) {
                    const mediaType = msg.type;
                    const content: any = { caption: text };

                    if (mediaType === "image")
                        content.image = { url: fullPath };
                    else if (mediaType === "video")
                        content.video = { url: fullPath };
                    else if (mediaType === "audio") {
                        content.audio = { url: fullPath };
                        content.mimetype = "audio/ogg; codecs=opus";
                        content.ptt = true;
                    } else if (mediaType === "sticker")
                        content.sticker = { url: fullPath };
                    else
                        content.document = {
                            url: fullPath,
                            fileName: msg.media_filename || "media",
                        };

                    actionsQueue.enqueue(async () => {
                        await this.sock.sendMessage(myId, content);
                        log(
                            "PROCESSOR",
                            `📤 Media deleted notify: ${msg.message_id}`,
                        );
                    }, `DELETION_NOTIFICATION_MEDIA [${msg.message_id}]`);
                    return;
                }
            }

            actionsQueue.enqueue(async () => {
                await this.sock.sendMessage(myId, { text });
                log("PROCESSOR", `📤 Text deleted notify: ${msg.message_id}`);
            }, `DELETION_NOTIFICATION_TEXT [${msg.message_id}]`);
        } catch (err: any) {
            log("PROCESSOR", `Failed deletion notify: ${err.message}`);
        }
    }

    /**
     * Fire-and-forget profile pic prefetch
     */
    private getProfilePicAsync(jid: string) {
        if (!jid || !this.sock) return;
        downloadProfilePic(jid, this.sock)
            .then((res) => {
                if (res?.isNew) {
                    this.broadcast("profile_pic_updated", {
                        chat_id: jid,
                        profile_pic: res.filename,
                    });
                }
            })
            .catch(() => {});
    }
}
