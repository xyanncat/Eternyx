'use client';

import { motion } from 'framer-motion';
import { siteConfig } from '@/lib/site-config';

function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

function dur(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

export default function DashboardView({ snapshot }) {
  const { bot = {}, usage = [], cases = [], events = [], logs = [] } = snapshot;
  const demo = Boolean(snapshot.demo);
  const maxCount = Math.max(1, ...usage.map((u) => u.count));
  const f = siteConfig.features;
  const receivedAgo = snapshot.receivedAt ? ago(snapshot.receivedAt) : 'never';

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <div className="login-logo">E</div>
        <div>
          <h1>{siteConfig.name}</h1>
          <div className="sub">{siteConfig.tagline} · pushed {receivedAgo}</div>
        </div>
        <div className="head-spacer" />
        {demo ? (
          <span className="live-badge demo-badge-lg">DEMO DATA</span>
        ) : (
          <span className="live-badge"><span className="live-dot" /> LIVE</span>
        )}
        <button className="ghost-btn" onClick={() => window.location.reload()}>Refresh</button>
        <button className="ghost-btn" onClick={logout}>Log out</button>
      </div>

      <div className="grid">
        <motion.div className="card stat" variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <div className="k">Bot</div>
          <div className="v small">{bot.username ?? 'offline'}</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{bot.guild ?? '—'}</div>
        </motion.div>
        <motion.div className="card stat" variants={fadeUp} initial="hidden" animate="show" custom={1}>
          <div className="k">Uptime</div>
          <div className="v">{dur(bot.uptimeMs ?? 0)}</div>
        </motion.div>
        <motion.div className="card stat" variants={fadeUp} initial="hidden" animate="show" custom={2}>
          <div className="k">Memory</div>
          <div className="v">{bot.rssMb ?? '—'} <span style={{ fontSize: 15 }}>MB</span></div>
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>cap 256 MB</div>
        </motion.div>
        <motion.div className="card stat" variants={fadeUp} initial="hidden" animate="show" custom={3}>
          <div className="k">Gateway ping</div>
          <div className="v">{bot.wsPingMs ?? '—'} <span style={{ fontSize: 15 }}>ms</span></div>
        </motion.div>
      </div>

      {f.usage && (
        <motion.div className="card section" variants={fadeUp} initial="hidden" animate="show" custom={4}>
          <h2>Command usage · all time</h2>
          {usage.length === 0 ? <div className="empty">No commands used yet.</div> : (
            <table>
              <thead><tr><th>Command</th><th style={{ width: '45%' }}>Volume</th><th>Count</th><th>Last used</th></tr></thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.name}>
                    <td className="mono">/{u.name}</td>
                    <td><div className="bar-wrap"><div className="bar" style={{ width: Math.round((u.count / maxCount) * 100) + '%' }} /></div></td>
                    <td><strong>{u.count}</strong></td>
                    <td className="dim">{u.last_used ? ago(u.last_used) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
      )}

      {f.cases && (
        <motion.div className="card section" variants={fadeUp} initial="hidden" animate="show" custom={5}>
          <h2>Recent cases</h2>
          {cases.length === 0 ? <div className="empty">No moderation cases yet.</div> : (
            <table>
              <thead><tr><th>Case</th><th>Type</th><th>User</th><th>Reason</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">#{c.id}</td>
                    <td><span className="badge">{c.type}</span></td>
                    <td className="mono">{c.user_id === '0' ? '—' : c.user_id}</td>
                    <td className="dim">{String(c.reason ?? '').slice(0, 60)}</td>
                    <td><span className={'badge ' + (c.status === 'ACTIVE' ? 'ok' : '')}>{c.status}</span></td>
                    <td className="dim">{ago(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
      )}

      {f.events && (
        <motion.div className="card section" variants={fadeUp} initial="hidden" animate="show" custom={6}>
          <h2>Security events</h2>
          {events.length === 0 ? <div className="empty">All quiet — no security events.</div> : (
            <table>
              <thead><tr><th>Kind</th><th>Detail</th><th>When</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td><span className={'badge ' + (String(e.kind).includes('self_') || String(e.kind).includes('nuke') ? 'danger' : '')}>{e.kind}</span></td>
                    <td className="dim mono">{String(e.detail ?? '').slice(0, 80)}</td>
                    <td className="dim">{ago(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
      )}

      {f.logs && (
        <motion.div className="card section" variants={fadeUp} initial="hidden" animate="show" custom={7}>
          <h2>Log tail</h2>
          <div className="logpre">{logs.length ? logs.join('\n') : 'no log lines pushed yet'}</div>
        </motion.div>
      )}

      <p className="dim" style={{ fontSize: 12, textAlign: 'center', marginTop: 30 }}>{siteConfig.footer}</p>
    </div>
  );
}
