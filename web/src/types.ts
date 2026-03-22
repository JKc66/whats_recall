export interface Chat {
  chat_id: string;
  name: string;
  is_group: number;
  last_message_at: string | null;
  deleted_count: number;
  total_deleted_count: number;
  total_messages: number;
  last_message_preview: string | null;
  last_message_sender: string | null;
  profile_pic: string | null;
}

export interface Message {
  message_id: string;
  chat_id: string;
  sender_id: string | null;
  sender_name: string | null;
  body: string | null;
  type: string;
  has_media: number;
  media_type: string | null;
  media_filename: string | null;
  media_path: string | null;
  timestamp: number;
  is_from_me: number;
  is_deleted: number;
  deleted_at: string | null;
  is_view_once: number;
}

export interface MonitoredChat {
  chat_id: string;
  name: string;
  is_group: number;
  added_at: string;
}

export interface WhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  timestamp: number;
  isMonitored: boolean;
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

export interface WsEvent {
  event: string;
  data: unknown;
}
