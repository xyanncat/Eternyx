import { SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';

export const data = new SlashCommandBuilder().setName('help').setDescription('List commands');

const GROUPS = [
  ['🛡 Moderation', '/ban · /softban · /unban · /kick · /timeout · /untimeout · /warn · /warnings · /case · /clear · /slowmode · /lock · /unlock'],
  ['🚨 Security', '/panel — button control panel (lockdown + status) · /lockdown on|off · raid/nuke/self guards run automatically'],
  ['⚙ Config (owner)', '/config set log-channel · /config set control-channel · /config set mod-role · /config add mod-role · /config set raid-threshold · /config set nuke-auto-action · /config set auto-role · /config show · /automod · /dbbackup'],
  ['ℹ Info', '/userinfo · /serverinfo · /avatar'],
  ['🖥 System', '/ping · /botstatus · /help'],
];

export async function execute(interaction) {
  const embed = buildEmbed({
    kind: 'info',
    title: 'Eternyx — command list',
    description: 'Slash commands only. Every moderation action is case-logged and mirrored to the audit channel.',
    fields: GROUPS.map(([name, value]) => ({ name, value })),
  });
  await interaction.reply({ embeds: [embed] });
}
