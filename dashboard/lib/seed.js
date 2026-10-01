// Demo snapshot shown when the dashboard has never received a push from the
// bot (no KV/Blob data yet / local dev). Clearly marked demo:true so the UI can
// badge it — never mistaken for live data.
function minutesAgo(min) {
  return Date.now() - min * 60_000;
}

export function seedSnapshot() {
  return {
    demo: true,
    receivedAt: Date.now(),
    bot: {
      username: 'Eternyx',
      guild: 'Eternity | ROYAL\'S PARADISE | Dev',
      uptimeMs: 26 * 3_600_000 + 14 * 60_000,
      rssMb: 76,
      wsPingMs: 38,
      startedAt: minutesAgo(26 * 60 + 14),
    },
    guild: {
      channels: [
        { id: '1444582621417046074', name: 'general' },
        { id: '1444582621417046075', name: 'announcements' },
        { id: '1444582621417046076', name: 'mod-log' },
        { id: '1444582621417046077', name: 'bot-commands' },
        { id: '1444582621417046078', name: 'rules' },
      ],
      roles: [
        { id: '1444582621417046080', name: 'Admin' },
        { id: '1444582621417046081', name: 'Moderator' },
        { id: '1444582621417046082', name: 'Trial Mod' },
        { id: '1444582621417046083', name: 'VIP' },
        { id: '1444582621417046084', name: 'Member' },
      ],
      automodRules: [
        { id: 'rule_1', name: 'eternyx-invite-block', enabled: true },
        { id: 'rule_2', name: 'eternyx-mention-spam', enabled: true },
      ],
    },
    config: {
      logChannelId: '1444582621417046076',
      modRoleIds: ['1444582621417046081'],
      raidThreshold: 10,
      nukeAutoAction: 0,
    },
    usage: [
      { name: 'timeout', count: 34, last_used: minutesAgo(9) },
      { name: 'warn', count: 27, last_used: minutesAgo(23) },
      { name: 'clear', count: 18, last_used: minutesAgo(41) },
      { name: 'ban', count: 6, last_used: minutesAgo(180) },
      { name: 'lock', count: 4, last_used: minutesAgo(300) },
      { name: 'botstatus', count: 11, last_used: minutesAgo(5) },
    ],
    cases: [
      { id: 42, type: 'timeout', user_id: '216039405824204800', reason: 'Spamming invites in #general', status: 'ACTIVE', created_at: minutesAgo(9) },
      { id: 41, type: 'warn', user_id: '482910556231311360', reason: 'Repeated flaming after warning', status: 'ACTIVE', created_at: minutesAgo(23) },
      { id: 40, type: 'clear', user_id: '0', reason: 'Raid cleanup in #general', status: 'ACTIVE', created_at: minutesAgo(41) },
      { id: 39, type: 'ban', user_id: '703998204315238400', reason: 'Raid account — nukeGuard auto-flagged', status: 'ACTIVE', created_at: minutesAgo(300) },
      { id: 38, type: 'lock', user_id: '0', reason: 'Lockdown during join raid', status: 'ACTIVE', created_at: minutesAgo(301) },
    ],
    events: [
      { kind: 'raid_suspected', detail: 'joins=14/60s — verification raised to High', created_at: minutesAgo(300) },
      { kind: 'nuke_suspected_bans', detail: 'executor=703998204315238400 count>=5/60s', created_at: minutesAgo(301) },
      { kind: 'self_perm_reduced', detail: 'ManageChannels missing from bot role', created_at: minutesAgo(1400) },
    ],
    logs: [
      '[2026-09-30T04:00:00.000Z] INFO login ok',
      '[2026-09-30T04:00:00.100Z] INFO logged in as Eternyx — guild Eternity | ROYAL\'S PARADISE | Dev',
      '[2026-09-30T04:05:12.000Z] INFO dashboard snapshot pushed',
      '[2026-09-30T04:29:41.000Z] INFO rss 76 MB',
    ],
  };
}
