// ══════════════════════════════════════════════════════════════════
//  SITE CUSTOMIZATION — edit this file to make the dashboard yours.
//  Colors, name, tagline, and which sections are visible.
// ══════════════════════════════════════════════════════════════════

export const siteConfig = {
  name: 'Eternyx',
  tagline: 'Moderation command center',
  footer: 'Eternyx · hosted on Vercel · fed by the phone',

  // Theme — any valid CSS color.
  theme: {
    background: '#07080f',
    surface: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.09)',
    text: '#e8eaf6',
    textDim: '#8b90a8',
    accent: '#7c5cff',   // primary — buttons, highlights, bars
    accent2: '#22d3ee',  // secondary — gradients, live badge
    danger: '#ff5470',
  },

  // Section visibility on the dashboard page.
  features: {
    usage: true,
    cases: true,
    events: true,
    logs: true,
  },
};
