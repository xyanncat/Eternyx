// Owner-only raid response (plan §5): lock/unlock every public text channel
// at once. State is persisted (lib/lockdown) so unlock restores each
// channel's previous @everyone SendMessages value instead of blanket-opening.
import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';
import { sendAuditLog } from '../../lib/audit.js';
import { activateLockdown, deactivateLockdown } from '../../lib/lockdown.js';

export const meta = { ownerOnly: true, cooldown: 30 };

export const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Lock or unlock all public text channels (owner only)')
  .addStringOption((o) =>
    o
      .setName('mode')
      .setDescription('on = lock everything, off = unlock')
      .setRequired(true)
      .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })
  )
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const mode = interaction.options.getString('mode', true);
  const reason = interaction.options.getString('reason', true).trim().slice(0, 512);
  const guild = interaction.guild;
  const on = mode === 'on';

  await interaction.deferReply();

  const result = on
    ? await activateLockdown(guild, interaction.user.username, reason)
    : await deactivateLockdown(guild, interaction.user.username, reason);

  if (!result.ok) {
    const embed = buildEmbed({
      kind: 'warn',
      title: 'No change',
      description: result.detail,
      moderator: interaction.user,
    });
    return interaction.editReply({ embeds: [embed] });
  }

  const embed = buildEmbed({
    kind: on ? 'warn' : 'success',
    title: on ? '🔒 Lockdown active' : '🔓 Lockdown lifted',
    description: `${result.detail}.\n**Reason:** ${reason}`,
    moderator: interaction.user,
  });
  await sendAuditLog(guild, embed);
  await interaction.editReply({ embeds: [embed] });
}
