// Fixed brand image: every bot message OUTSIDE the log channel carries the
// Kafka artwork as its embed image (replies, announcements, panel, owner DMs).
// Log-channel audit embeds stay clean — sendAuditLog never calls applyBrand.
//
// Mechanics: Discord can't host a permanent embed-image URL (CDN links are
// signed + expire), so the PNG is shipped with the bot and attached to each
// send as `attachment://kafka.png`. Without an existing image on the embed,
// one is set; existing images are respected. Missing asset ⇒ plain embeds.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { ROOT } from '../config.js';
export const BRAND_FILE = path.join(ROOT, 'assets', 'kafka.png');
export const BRAND_NAME = 'kafka.png';

export function brandAttachment() {
  if (!existsSync(BRAND_FILE)) return null;
  return new AttachmentBuilder(BRAND_FILE, { name: BRAND_NAME });
}

// Non-mutating: returns a payload copy with branded embed copies + the file.
export function applyBrand(payload) {
  try {
    if (!payload || typeof payload !== 'object') return payload;
    const embeds = payload.embeds;
    if (!Array.isArray(embeds) || embeds.length === 0) return payload;
    const attachment = brandAttachment();
    if (!attachment) return payload;

    const branded = embeds.map((embed) => {
      const data = embed?.data ?? embed;
      if (!data || typeof embed?.setImage !== 'function') return embed;
      if (data.image?.url) return embed; // respect an existing image
      const copy = EmbedBuilder.from(embed);
      copy.setImage(`attachment://${BRAND_NAME}`);
      return copy;
    });

    const files = Array.isArray(payload.files) ? [...payload.files, attachment] : [attachment];
    return { ...payload, embeds: branded, files };
  } catch {
    return payload; // branding must never break a send
  }
}
