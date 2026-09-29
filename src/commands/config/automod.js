// Manages Discord's NATIVE AutoMod rules (plan §2): Discord does the content
// filtering at gateway level; this bot only creates/removes/lists rules.
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import { buildEmbed, errorEmbed, EPHEMERAL } from '../../lib/embeds.js';
import { getConfig } from '../../storage/db.js';

export const meta = { ownerOnly: true, cooldown: 5 };

export const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Manage native AutoMod rules (owner only)')
  .addSubcommand((s) =>
    s
      .setName('keyword')
      .setDescription('Block messages containing keywords (one per line)')
      .addStringOption((o) => o.setName('name').setDescription('Rule name').setRequired(true).setMaxLength(60))
      .addStringOption((o) => o.setName('words').setDescription('One keyword/pattern per line, max 50').setRequired(true).setMaxLength(1000))
  )
  .addSubcommand((s) => s.setName('invite').setDescription('Block Discord invite links'))
  .addSubcommand((s) => s.setName('preset').setDescription("Block Discord's profanity/sexual-content/slur presets"))
  .addSubcommand((s) =>
    s
      .setName('mention-spam')
      .setDescription('Block messages mentioning too many users')
      .addIntegerOption((o) => o.setName('limit').setDescription('Max mentions per message (5–50)').setRequired(true).setMinValue(5).setMaxValue(50))
  )
  .addSubcommand((s) => s.setName('remove').setDescription('Remove a rule by name').addStringOption((o) => o.setName('name').setDescription('Rule name').setRequired(true).setMaxLength(100)))
  .addSubcommand((s) => s.setName('list').setDescription('List active rules'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild);

async function createRule(guild, name, triggerType, triggerMetadata) {
  const cfg = getConfig(guild.id);
  const actions = [{ type: AutoModerationActionType.BlockMessage }];
  if (cfg.logChannelId) {
    actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channelId: cfg.logChannelId } });
  }
  return guild.autoModerationRules.create({
    name: name.slice(0, 80),
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType,
    triggerMetadata,
    actions,
    enabled: true,
    reason: 'Eternyx automod setup',
  });
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand(true);
  const guild = interaction.guild;
  await interaction.deferReply({ flags: EPHEMERAL });

  try {
    if (sub === 'keyword') {
      const words = interaction.options
        .getString('words', true)
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 50);
      if (words.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('No keywords provided.', interaction.user)] });
      }
      const rule = await createRule(guild, `eternyx-keyword: ${interaction.options.getString('name', true)}`, AutoModerationRuleTriggerType.Keyword, { keywordFilter: words });
      return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Keyword rule created', description: `**${rule.name}** — ${words.length} pattern(s), blocked + alert to log channel.`, moderator: interaction.user })] });
    }

    if (sub === 'invite') {
      const rule = await createRule(guild, 'eternyx-invite-block', AutoModerationRuleTriggerType.Keyword, {
        keywordFilter: ['*discord.gg/*', '*discord.com/invite/*'],
      });
      return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Invite blocking enabled', description: `**${rule.name}** is active.`, moderator: interaction.user })] });
    }

    if (sub === 'preset') {
      const rule = await createRule(guild, 'eternyx-presets', AutoModerationRuleTriggerType.KeywordPreset, {
        presets: [AutoModerationRuleKeywordPresetType.Profanity, AutoModerationRuleKeywordPresetType.SexualContent, AutoModerationRuleKeywordPresetType.Slurs],
      });
      return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Preset filters enabled', description: `**${rule.name}** — profanity, sexual content and slurs now blocked.`, moderator: interaction.user })] });
    }

    if (sub === 'mention-spam') {
      const limit = interaction.options.getInteger('limit', true);
      const rule = await createRule(guild, 'eternyx-mention-spam', AutoModerationRuleTriggerType.Spam, { mentionTotalLimit: limit });
      return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Mention-spam rule created', description: `**${rule.name}** — messages with more than ${limit} mentions are blocked.`, moderator: interaction.user })] });
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name', true);
      await guild.autoModerationRules.fetch();
      const rule = guild.autoModerationRules.cache.find((r) => r.name === name || r.id === name);
      if (!rule) {
        return interaction.editReply({ embeds: [errorEmbed(`No rule named "${name}". Use /automod list.`, interaction.user)] });
      }
      const ruleName = rule.name;
      await rule.delete('Eternyx automod removal');
      return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Rule removed', description: `**${ruleName}** deleted.`, moderator: interaction.user })] });
    }

    // list
    await guild.autoModerationRules.fetch();
    const rules = [...guild.autoModerationRules.cache.values()].slice(0, 10);
    const embed = buildEmbed({
      kind: 'info',
      title: 'AutoMod rules',
      description: rules.length
        ? rules.map((r) => `**${r.name}** — ${r.triggerType}${r.enabled ? '' : ' (disabled)'}`).join('\n')
        : 'No rules yet.',
      moderator: interaction.user,
    });
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`AutoMod operation failed: ${err.message}. (I need Manage Guild and the rule name must be unique.)`, interaction.user)] });
  }
}
