'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, MotionConfig } from 'motion/react';
import { Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Ribbon from './Ribbon';

export default function LoginPage({ demoMode }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
      if (response.ok) { router.push('/dashboard'); router.refresh(); return; }
      setError(response.status === 401 ? 'That access key isn’t correct. Try again.' : 'Unable to sign in. Please try again.');
    } catch { setError('Couldn’t reach the dashboard. Check your connection and try again.'); }
    setBusy(false);
  }
  return (
    <MotionConfig reducedMotion="user">
      <main className="login-page">
        <header className="login-header"><a href="/" className="wordmark"><span className="sigil" aria-hidden="true">E</span>Eternyx</a><span>Server workspace</span></header>
        <div className="login-layout">
          <section className="login-story">
            <Ribbon />
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.12 }}>
              <h1>Your server.<br />In good hands.</h1>
              <p>Moderation, activity, and server controls in one place.</p>
            </motion.div>
          </section>
          <motion.section className="login-form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.25 }}>
            <div className="login-form-inner">
              <h2>Welcome back</h2>
              <p>Enter your access key to continue.</p>
              <form onSubmit={submit}>
                <label htmlFor="access-key">Access key</label>
                <div className="password-field">
                  <input id="access-key" className="input" type={visible ? 'text' : 'password'} value={key} onChange={event => setKey(event.target.value)} placeholder="Enter your access key" autoComplete="current-password" required aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} />
                  <button type="button" aria-label={visible ? 'Hide access key' : 'Show access key'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
                <button className="btn login-submit" type="submit" disabled={busy || !key.trim()}><span>{busy ? 'Opening dashboard…' : 'Open dashboard'}</span><ArrowRight size={18} /></button>
                <p id="login-error" className="error-text" role="alert">{error}</p>
              </form>
              {demoMode && <p className="demo-note">Preview mode. Use <code>demo</code> as the access key.</p>}
              <div className="private-note"><Lock size={14} /> Private access</div>
            </div>
          </motion.section>
        </div>
        <footer className="login-footer"><span>Eternyx</span><span>A calmer place to manage your community.</span></footer>
      </main>
    </MotionConfig>
  );
}
