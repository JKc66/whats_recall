export type MessageType =
  | "chat"
  | "image"
  | "video"
  | "audio"
  | "ptt"
  | "sticker"
  | "document"
  | "location"
  | "contact"
  | "revoked"
  | "unknown";

export interface Chat {
  chat_id: string;
  name: string;
  is_group: boolean | number;
  last_message_at: string | null;
  deleted_count: number;
  total_deleted_count: number;
  total_messages: number;
  last_message_preview: string | null;
  last_message_sender: string | null;
  profile_pic: string | null;
  lid: string | null;
}

export interface Reaction {
  sender_id: string;
  sender_name: string;
  emoji: string;
}

export interface MessageEdit {
  old_body: string;
  new_body: string;
  edited_at: string;
}

export interface Message {
  message_id: string;
  chat_id: string;
  sender_id: string | null;
  sender_name: string | null;
  body: string | null;
  type: MessageType | string;
  has_media: boolean | number;
  media_type: string | null;
  media_filename: string | null;
  media_path: string | null;
  timestamp: number;
  is_from_me: boolean | number;
  is_deleted: boolean | number;
  deleted_at: string | null;
  is_view_once: boolean | number;
  original_id: string | null;
  quoted_stanza_id: string | null;
  quoted_sender: string | null;
  quoted_preview: string | null;
  reactions?: Reaction[];
  edits?: MessageEdit[];
}

export interface MonitoredChat {
  chat_id: string;
  name: string;
  is_group: boolean | number;
  added_at: string;
  lid?: string | null;
}

export interface WhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  timestamp: number;
  isMonitored: boolean;
  profilePic?: string | null;
  lid?: string | null;
  profile_pic?: string | null; // Unified with profilePic
}

export interface Stats {
  connected: boolean;
  authenticated: boolean;
  myId: string | null;
  notifyEnabled: boolean;
  totalMessages: number;
  deletedMessages: number;
  totalChats: number;
}

export interface WsEvent<T = any> {
  event: string;
  data: T;
}

export interface AppSettings {
  [key: string]: string;
}

export interface PairingStatus {
  type: "qr" | "code" | null;
  data: string | null;
  connected: boolean;
  authenticated: boolean;
}
