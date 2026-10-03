import './globals.css';
import { Syne, Archivo, JetBrains_Mono } from 'next/font/google';
import { siteConfig } from '@/lib/site-config';

const display = Syne({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-syne', display: 'swap' });
const body = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-jbmono', display: 'swap' });

export const metadata = {
  title: siteConfig.name + ' · ' + siteConfig.tagline,
  description: siteConfig.tagline,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
