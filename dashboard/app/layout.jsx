import './globals.css';
import { siteConfig } from '@/lib/site-config';

export const metadata = {
  title: siteConfig.name + ' · ' + siteConfig.tagline,
  description: siteConfig.tagline,
};

export default function RootLayout({ children }) {
  const t = siteConfig.theme;
  return (
    <html lang="en">
      <head>
        <style>{`:root{--bg:${t.background};--surface:${t.surface};--border:${t.border};--text:${t.text};--dim:${t.textDim};--accent:${t.accent};--accent2:${t.accent2};--danger:${t.danger};}`}</style>
      </head>
      <body>
        <div className="bg-orbs" aria-hidden="true">
          <span /><span /><span />
        </div>
        {children}
      </body>
    </html>
  );
}
