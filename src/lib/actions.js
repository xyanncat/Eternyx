// Shared flow for every moderation action (plan §4.5–§4.7):
// guard -> public defer -> best-effort DM -> write-ahead case -> apply -> ACTIVE ->
// post-hook -> audit + embed reply. runChannelAction covers channel-scoped actions
// (lock/unlock/slowmode) with the same write-ahead + audit guarantees but no user guard.
import { buildEmbed, errorEmbed, EPHEMERAL } from './embeds.js';
import { isMod, isOwner, moderationAllowed } from './perms.js';
import { sendAuditLog } from './audit.js';
import { getConfig, createCase, setCaseStatus, recordEvent } from '../storage/db.js';
import { logger } from './log.js';

const VERBS = {
  ban: 'banned',
  softban: 'soft-banned',
  unban: 'unbanned',
  kick: 'kicked',
  timeout: 'timed out',
  untimeout: 'removed the timeout from',
  warn: 'warned',
  lock: 'locked',
  unlock: 'unlocked',
  clear: 'purged messages from',
  slowmode: 'set slowmode in',
};

function verbTitle(type) {
  const verb = VERBS[type] ?? type;
  return verb.charAt(0).toUpperCase() + verb.slice(1);
}

async function ensureDeferred(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
}

async function reportFailure(interaction, caseRow, err) {
  logger.error(`case #${caseRow.id} (${caseRow.type}) failed: ${err.message}`);
  recordEvent('case_failed', JSON.stringify({ case: caseRow.id, type: caseRow.type, error: err.message }));
  await interaction.editReply({
    embeds: [
      errorEmbed(`Case #${caseRow.id} could not be applied (${err.message}). It is recorded as PENDING.`, interaction.user),
    ],
  });
}

export async function runModAction(
  interaction,
  {
    type,
    targetUser,
    targetMember = null,
    reason,
    durationSeconds = null,
    durationLabel = null,
    apply,
    dmTitle = null,
    afterActive = null,
    allowOwnerTarget = false,
  }
) {
  const guild = interaction.guild;
  const cfg = getConfig(guild.id);
  const guard = moderationAllowed({
    guild,
    moderator: interaction.member,
    targetUser,
    targetMember,
    botMember: guild.members.me,
    moderatorIsOwner: isOwner(interaction.user.id, cfg),
    targetIsMod: targetMember ? isMod(targetMember, cfg) : false,
    allowOwnerTarget,
  });
  if (!guard.ok) {
    return interaction.reply({ embeds: [errorEmbed(guard.reason, interaction.user)], flags: EPHEMERAL });
  }

  await ensureDeferred(interaction); // public — moderation actions are announcements

  // DM before the action, since bans/kicks remove the member (best-effort).
  if (dmTitle) {
    try {
      await targetUser.send({
        embeds: [
          buildEmbed({
            kind: 'warn',
            title: dmTitle,
            description: `**Reason:** ${reason}`,
            moderator: interaction.user,
          }),
        ],
      });
    } catch {
      /* DMs may be closed — never block the action on it */
    }
  }

  // Write-ahead: the case exists (as PENDING) before the Discord API call (plan §4.7).
  const caseRow = createCase({
    guildId: guild.id,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    type,
    reason,
    duration: durationSeconds,
  });

  try {
    await apply();
  } catch (err) {
    return reportFailure(interaction, caseRow, err);
  }
  setCaseStatus(caseRow.id, 'ACTIVE');

  // Post-hook (e.g. warn auto-escalation) runs after the action is ACTIVE;
  // may return a note that gets appended to the reply embed.
  let postNote = null;
  if (afterActive) {
    try {
      postNote = (await afterActive(caseRow)) ?? null;
    } catch (err) {
      logger.warn(`post-action hook for case #${caseRow.id} failed: ${err.message}`);
    }
  }

  const embed = buildEmbed({
    kind: 'action',
    title: verbTitle(type),
    moderator: interaction.user,
    target: targetUser,
    caseId: caseRow.id,
    description: [
      `**Member:** <@${targetUser.id}>`,
      durationLabel ? `**Duration:** ${durationLabel}` : null,
      `**Reason:** ${reason}`,
      typeof postNote === 'string' ? postNote : null,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  await sendAuditLog(guild, embed);
  await interaction.editReply({ embeds: [embed] });
}

export async function runChannelAction(interaction, { type, reason, apply, description }) {
  await ensureDeferred(interaction); // public

  const caseRow = createCase({
    guildId: interaction.guildId,
    userId: '0',
    moderatorId: interaction.user.id,
    type,
    reason,
    duration: null,
  });

  try {
    await apply();
  } catch (err) {
    return reportFailure(interaction, caseRow, err);
  }
  setCaseStatus(caseRow.id, 'ACTIVE');

  const embed = buildEmbed({
    kind: 'action',
    title: verbTitle(type),
    moderator: interaction.user,
    caseId: caseRow.id,
    description: [description, `**Reason:** ${reason}`].filter(Boolean).join('\n'),
  });
  await sendAuditLog(interaction.guild, embed);
  await interaction.editReply({ embeds: [embed] });
}

// Ephemeral error for commands that check something before deferring.
export function refuse(interaction, reason) {
  return interaction.reply({ embeds: [errorEmbed(reason, interaction.user)], flags: EPHEMERAL });
}
