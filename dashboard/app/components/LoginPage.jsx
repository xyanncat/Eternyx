'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
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
      setError(res.status === 401 ? 'Wrong access key.' : 'Login failed — try again.');
    } catch {
      setError('Network error — is the site awake?');
    }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <motion.div
        className="card login-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-logo" aria-hidden="true">
          E
        </div>
        <h1>{siteConfig.name}</h1>
        <p className="sub">{siteConfig.tagline}</p>
        <form onSubmit={submit}>
          <input
            className="input"
            type="password"
            placeholder="Access key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
            autoComplete="current-password"
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
          animate={error ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          {error}
        </motion.div>
        {demoMode && <span className="demo-badge">demo mode · any key opens · seed data</span>}
      </motion.div>
    </div>
  );
}
