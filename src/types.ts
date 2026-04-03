export interface WhatsAppChat {
  chat_id: string;
  name?: string;
  lid?: string;
  is_group: boolean;
  profile_pic?: string;
  last_message_at?: string;
  last_seen_deleted_at?: number;
  created_at?: string;
  updated_at?: string;
  deleted_count?: number;
  total_deleted_count?: number;
  total_messages?: number;
  last_message_preview?: string;
  last_message_sender?: string;
}

export interface WhatsAppMessage {
  message_id: string;
  chat_id: string;
  sender_id?: string;
  sender_name?: string;
  body?: string;
  type: string;
  has_media: boolean;
  media_type?: string;
  media_filename?: string;
  media_path?: string;
  media_sha256?: string;
  timestamp: number;
  is_from_me: boolean | number;
  is_deleted: boolean | number;
  deleted_at?: string;
  is_view_once: boolean | number;
  original_id?: string;
  quoted_stanza_id?: string;
  quoted_sender?: string;
  quoted_preview?: string;
  created_at?: string;
  reactions?: WhatsAppReaction[];
  edits?: WhatsAppEdit[];
  updated_at?: string;
}

export interface WhatsAppEdit {
  old_body: string;
  new_body: string;
  edited_at: string;
}

export interface WhatsAppReaction {
  message_id: string;
  sender_id: string;
  sender_name?: string;
  emoji: string;
  timestamp?: string;
}

export interface AppSettings {
  whatsapp_phone?: string;
  whatsapp_notify?: 'true' | 'false';
  whatsapp_pairing_method?: 'qr' | 'code';
  [key: string]: string | undefined;
}

export interface PairingStatus {
  type: 'qr' | 'code' | null;
  data: string | null;
  connected: boolean;
  authenticated: boolean;
  id?: string;
  reason?: string;
}

export type BroadcastEvent = 'status' | 'new_message' | 'message_deleted' | 'message_reaction' | 'message_edited' | 'profile_pic_updated';

export type BroadcastFn = (event: BroadcastEvent, data: any) => void;
