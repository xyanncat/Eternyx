// Slash-command router — the app-level authorization gate (plan §4.4).
// Discord's default member permissions hide commands; this re-checks every
// interaction so in-server permission edits are honored immediately.
import { Events } from 'discord.js';
import { errorEmbed, EPHEMERAL } from '../lib/embeds.js';
import { checkCooldown } from '../lib/cooldowns.js';
import { isMod, isOwner } from '../lib/perms.js';
import { getConfig } from '../storage/db.js';
import { logger } from '../lib/log.js';

export const name = Events.InteractionCreate;
export async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;

  const meta = command.meta ?? {};
  const wait = checkCooldown(`${interaction.user.id}:${interaction.commandName}`, meta.cooldown ?? 3);
  if (wait > 0) {
    return interaction.reply({
      embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(wait)}s.`, interaction.user)],
      flags: EPHEMERAL,
    });
  }

  if (meta.ownerOnly || meta.modOnly) {
    const cfg = getConfig(interaction.guildId);
    if (meta.ownerOnly && !isOwner(interaction.user.id, cfg)) {
      return interaction.reply({
        embeds: [errorEmbed('This command is restricted to bot owners.', interaction.user)],
        flags: EPHEMERAL,
      });
    }
    if (meta.modOnly && !isMod(interaction.member, cfg)) {
      return interaction.reply({
        embeds: [errorEmbed('You need the moderator role to use this command.', interaction.user)],
        flags: EPHEMERAL,
      });
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(`command /${interaction.commandName} failed: ${err?.stack ?? err}`);
    const embed = errorEmbed('Something went wrong running that command. The incident has been logged.', interaction.user);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
    }
  }
}
