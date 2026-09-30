import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export default function NotFound() {
  return (
    <div className="err-wrap">
      <div>
        <div className="err-code">404</div>
        <h1>Lost in the void</h1>
        <p>
          This page drifted out of {siteConfig.name}&apos;s orbit. The dashboard is still
          right where you left it, though.
        </p>
        <Link className="home-btn" href="/">Back to the dashboard</Link>
      </div>
    </div>
  );
}
