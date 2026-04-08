/**
 * Local ID portion of a WhatsApp JID (before @). Matches server and UI expectations for all suffixes (@s.whatsapp.net, @g.us, @lid, etc.).
 */
export function extractJidId(jid: string | null | undefined): string {
  if (!jid) return '';
  return jid.split('@')[0];
}
