import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../config.js';
import { buildEmbed, errorEmbed, EPHEMERAL } from '../../lib/embeds.js';
import { backupTo } from '../../storage/db.js';

export const meta = { ownerOnly: true, cooldown: 30 };

export const data = new SlashCommandBuilder()
  .setName('dbbackup')
  .setDescription('Back up the case database right now (owner only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const dir = path.join(ROOT, 'backups');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);

  try {
    await backupTo(file);
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`Backup failed: ${err.message}`, interaction.user)] });
  }

  const sizeKb = Math.round(statSync(file).size / 1024);
  await interaction.editReply({
    embeds: [
      buildEmbed({
        kind: 'success',
        title: 'Backup created',
        description: `\`${path.basename(file)}\` (${sizeKb} KB)\nStored in the host's \`backups/\` directory — nightly backups also run there.`,
        moderator: interaction.user,
      }),
    ],
  });
}
