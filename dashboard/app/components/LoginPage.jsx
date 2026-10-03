'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Activity, Zap, Lock } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

export default function LoginPage({ demoMode }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
        return;
      }
      setError(res.status === 401 ? 'WRONG ACCESS KEY.' : 'LOGIN FAILED — TRY AGAIN.');
    } catch {
      setError('NETWORK ERROR — IS THE SITE AWAKE?');
    }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <motion.div
        className="card login-split"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-brand">
          <div className="hazard-strip" aria-hidden="true" />
          <div className="login-logo-row">
            <div className="sigil" aria-hidden="true">E</div>
            <span className="kicker">{siteConfig.name} · control deck</span>
          </div>
          <h1>
            MODERATION<br />
            WITHOUT<br />
            COMPROMISE<span className="dot">.</span>
          </h1>
          <p className="tagline">
            Live telemetry from the phone host, and every server control in one
            place.
          </p>
          <ul className="login-points">
            <li>
              <Activity size={14} aria-hidden="true" />
              Health, usage, cases, and alarms at a glance
            </li>
            <li>
              <Zap size={14} aria-hidden="true" />
              Dispatch config — the phone executes within a minute
            </li>
            <li>
              <Lock size={14} aria-hidden="true" />
              Key-gated, encrypted at rest, no inbound ports
            </li>
          </ul>
        </div>
        <div className="login-form">
          <span className="kicker red">Restricted access</span>
          <h2 style={{ marginTop: 10 }}>Sign in</h2>
          <p className="sub">Enter the dashboard access key to continue.</p>
          <form onSubmit={submit}>
            <input
              className="input"
              type="password"
              placeholder="Access key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              autoComplete="current-password"
              aria-label="Access key"
            />
            <motion.button
              className="btn"
              type="submit"
              disabled={busy || key.length === 0}
              whileTap={{ scale: 0.98 }}
            >
              {busy ? 'Checking…' : 'Enter dashboard'}
            </motion.button>
          </form>
          <motion.div
            className="error-text"
            role="alert"
            animate={error ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
          >
            {error}
          </motion.div>
          {demoMode && <span className="demo-badge">demo mode · any key opens · seed data</span>}
        </div>
      </motion.div>
    </div>
  );
}
