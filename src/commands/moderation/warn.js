import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction, refuse } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';
import { countActiveWarnings, createCase, setCaseStatus } from '../../storage/db.js';

export const meta = { modOnly: true };

// Auto-escalation (plan §5): every 3rd active warning applies a 1h timeout;
// at 6+ the reply suggests a kick/ban instead of acting unilaterally.
export async function escalate(interaction, member, warnCase) {
  const guild = interaction.guild;
  const n = countActiveWarnings(guild.id, warnCase.user_id);
  if (n > 0 && n % 3 === 0 && member?.moderatable) {
    try {
      await member.timeout(3_600_000, `Auto-escalation: ${n} active warnings`);
      const autoCase = createCase({
        guildId: guild.id,
        userId: warnCase.user_id,
        moderatorId: interaction.client.user.id,
        type: 'timeout',
        reason: `Auto-escalation after ${n} active warnings (from case #${warnCase.id})`,
        duration: 3600,
      });
      setCaseStatus(autoCase.id, 'ACTIVE'); // the timeout was actually applied
      return `\n⚠ **${n} active warnings** — 1h timeout applied automatically.`;
    } catch {
      return `\n⚠ **${n} active warnings** — auto-timeout failed, apply one manually.`;
    }
  }
  if (n >= 6) return `\n⚠ **${n} active warnings** — consider a kick or ban.`;
  return n > 1 ? `\n${n} active warnings on record.` : null;
}

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a member (cases are append-only)')
  .addUserOption((o) => o.setName('user').setDescription('Member to warn').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = cleanReason(interaction.options.getString('reason'));
  const guild = interaction.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return refuse(interaction, 'That user is not in this server.');

  await runModAction(interaction, {
    type: 'warn',
    targetUser: user,
    targetMember: member,
    reason,
    apply: () => Promise.resolve(), // a warning is case-only
    dmTitle: `You were warned in ${guild.name}`,
    afterActive: (caseRow) => escalate(interaction, member, caseRow),
  });
}
