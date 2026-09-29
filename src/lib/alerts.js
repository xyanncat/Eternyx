// Fan-out alerts to bot owners (env OWNER_IDS + per-guild configured owners).
import { env } from '../config.js';
import { getConfig } from '../storage/db.js';

export async function alertOwners(guild, embed) {
  const cfg = getConfig(guild.id);
  const ids = new Set([...env.OWNER_IDS, ...cfg.ownerIds]);
  for (const id of ids) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    await user?.send({ embeds: [embed] }).catch(() => {});
  }
}
