// ══════════════════════════════════════════════════════════════════
//  SITE CUSTOMIZATION — edit this file to make the dashboard yours.
//  Colors, name, tagline, and which sections are visible.
// ══════════════════════════════════════════════════════════════════

export const siteConfig = {
  name: 'Eternyx',
  tagline: 'Discord moderation command center',
  footer: 'Eternyx core — always-on phone host with a cloud dashboard',

  // Theme — Radiant Neon & Cyber Glass styling
  theme: {
    background: '#060814',
    surface: 'rgba(14, 18, 36, 0.65)',
    border: 'rgba(124, 92, 255, 0.22)',
    text: '#f0f4fc',
    textDim: '#8fa0c4',
    accent: '#8b5cf6',   // Electric purple
    accent2: '#06b6d4',  // Cyber cyan
    accent3: '#ec4899',  // Neon magenta
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
