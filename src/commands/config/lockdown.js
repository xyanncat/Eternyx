// Owner-only raid response (plan §5): lock/unlock every public text channel at once.
import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';
import { sendAuditLog } from '../../lib/audit.js';
import { recordEvent } from '../../storage/db.js';

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

  const channels = [...guild.channels.cache.values()].filter(
    (ch) => ch.isTextBased() && !ch.isThread() && !ch.isVoiceBased()
  );
  const results = await Promise.allSettled(
    channels.map((ch) =>
      ch.permissionOverwrites.edit(
        guild.roles.everyone,
        { SendMessages: on ? false : null },
        { reason: `lockdown ${mode} — ${reason} — by ${interaction.user.username}` }
      )
    )
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - ok;

  recordEvent('lockdown', JSON.stringify({ guild: guild.id, mode, ok, failed, by: interaction.user.id }));

  const embed = buildEmbed({
    kind: on ? 'warn' : 'success',
    title: on ? '🔒 Lockdown active' : '🔓 Lockdown lifted',
    description: `**${ok}** channel(s) ${on ? 'locked' : 'unlocked'}${failed ? `, **${failed}** failed` : ''}.\n**Reason:** ${reason}`,
    moderator: interaction.user,
  });
  await sendAuditLog(guild, embed);
  await interaction.editReply({ embeds: [embed] });
}
