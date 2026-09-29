import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction, refuse } from '../../lib/actions.js';
import { cleanReason, DURATIONS, DURATION_MAP } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Timeout a member')
  .addUserOption((o) => o.setName('user').setDescription('Member to timeout').setRequired(true))
  .addStringOption((o) =>
    o
      .setName('duration')
      .setDescription('How long')
      .setRequired(true)
      .addChoices(...DURATIONS.map(({ name, value }) => ({ name, value })))
  )
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const durationValue = interaction.options.getString('duration', true);
  const seconds = DURATION_MAP[durationValue];
  if (!seconds) return refuse(interaction, 'Unknown duration preset.');
  const reason = cleanReason(interaction.options.getString('reason'));
  const guild = interaction.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return refuse(interaction, 'That user is not in this server.');

  await runModAction(interaction, {
    type: 'timeout',
    targetUser: user,
    targetMember: member,
    reason,
    durationSeconds: seconds,
    durationLabel: DURATIONS.find((d) => d.value === durationValue)?.name ?? durationValue,
    apply: () => member.timeout(seconds * 1000, `${reason} — by ${interaction.user.username}`),
    dmTitle: `You received a timeout in ${guild.name}`,
  });
}
