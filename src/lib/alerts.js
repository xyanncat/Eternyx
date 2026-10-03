// Fan-out security/tamper DMs.
// Recipients: when OWNER_IDS is set it pins the list EXACTLY (user requirement
// 2026-10-03 — only the bot's master gets DMs); otherwise configured guild
// owners + the server owner. Owner-only COMMAND rights are separate
// (lib/perms.js still treats the server owner + OWNER_IDS as owners).
import { env } from '../config.js';
import { getConfig } from '../storage/db.js';

export function alertRecipients(guild) {
  const cfg = getConfig(guild.id);
  const ids = env.OWNER_IDS.length > 0 ? env.OWNER_IDS : [...cfg.ownerIds, guild.ownerId];
  return [...new Set(ids.filter(Boolean))];
}

export async function alertOwners(guild, embed) {
  let sent = 0;
  for (const id of alertRecipients(guild)) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    if (!user) continue;
    const ok = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
    if (ok) sent += 1;
  }
  return sent;
}
