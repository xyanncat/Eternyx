// ══════════════════════════════════════════════════════════════════
//  SITE CUSTOMIZATION — edit this file to make the dashboard yours.
//  Colors, name, tagline, and which sections are visible.
// ══════════════════════════════════════════════════════════════════

export const siteConfig = {
  name: 'Eternyx',
  tagline: 'Discord moderation command center',
  footer: 'Eternyx core — always-on phone host with a cloud dashboard',

  // Theme — ops-console: Discord blurple primary, cyan signal, deep ink base.
  theme: {
    background: '#070B16',
    surface: 'rgba(17, 24, 43, 0.72)',
    border: 'rgba(148, 163, 255, 0.16)',
    text: '#eef1ff',
    textDim: '#93a0c8',
    accent: '#5865f2',   // Discord blurple — primary actions, active states
    accent2: '#22d3ee',  // Signal cyan — live status, data highlights
    danger: '#f43f5e',
    success: '#10b981',
  },

  // Section visibility on the dashboard page.
  features: {
    usage: true,
    cases: true,
    events: true,
    logs: true,
  },
};
