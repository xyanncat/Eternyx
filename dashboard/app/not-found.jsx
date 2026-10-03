import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export default function NotFound() {
  return (
    <div className="err-wrap">
      <div>
        <div className="err-code">404</div>
        <div className="hazard-strip" aria-hidden="true" />
        <h1>Signal lost</h1>
        <p>
          This page does not exist. The dashboard is still right where you
          left it, though.
        </p>
        <Link className="btn" href="/">
          Back to {siteConfig.name}
        </Link>
      </div>
    </div>
  );
}
