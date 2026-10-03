'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { siteConfig } from '@/lib/site-config';

function ago(ts) {
  if (!ts) return 'never';
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
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const SECTIONS = [
  { id: 'overview', label: 'Overview', glyph: '◉', blurb: 'Bot health, command volume, and server state.' },
  { id: 'channels', label: 'Server setup', glyph: '▤', blurb: 'Log channel and moderator roles.' },
  { id: 'announcements', label: 'Announcements', glyph: '✉', blurb: 'Broadcast embeds through the bot.' },
  { id: 'security', label: 'Guards & channels', glyph: '⬡', blurb: 'Raid threshold, auto-action, locks, slowmode.' },
  { id: 'automod', label: 'AutoMod', glyph: '◈', blurb: 'Native Discord content filters.' },
  { id: 'audit', label: 'Logs & results', glyph: '≣', blurb: 'Executions, cases, alarms, phone log.' },
];

// One short crossfade between sections — motion answers the nav choice,
// nothing else on the page moves on its own.
const panelFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

export default function Board({ initial }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [snapshot, setSnapshot] = useState(initial || {});
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  // Form states for setup actions
  const [selectedLogChannel, setSelectedLogChannel] = useState('');
  const [selectedModRole, setSelectedModRole] = useState('');
  const [modRoleMode, setModRoleMode] = useState('set'); // set or add
  const [raidThreshold, setRaidThreshold] = useState(10);
  const [nukeAction, setNukeAction] = useState(false);

  // Announcement state
  const [annChannel, setAnnChannel] = useState('');
  const [annTitle, setAnnTitle] = useState('Important Server Announcement');
  const [annMessage, setAnnMessage] = useState('');

  // Channel Lock & Slowmode
  const [targetChannel, setTargetChannel] = useState('');
  const [slowmodeSec, setSlowmodeSec] = useState(0);

  // AutoMod states
  const [kwRuleName, setKwRuleName] = useState('');
  const [kwWords, setKwWords] = useState('');
  const [mentionLimit, setMentionLimit] = useState(10);
  const [removeRuleName, setRemoveRuleName] = useState('');

  // Poller for real-time live data
  const poll = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/overview');
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) setSnapshot(data.snapshot);
        if (data.queue) setQueue(data.queue);
        if (data.results) setResults(data.results);
      }
    } catch {
      /* silent retry */
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    // 60s matches the phone's push/pull cadence — faster polling only burns
    // Vercel function + Blob invocations without fresher data.
    const timer = setInterval(poll, 60000);
    poll();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync initial config from snapshot
  useEffect(() => {
    if (snapshot?.config) {
      if (snapshot.config.logChannelId) setSelectedLogChannel(snapshot.config.logChannelId);
      if (snapshot.config.raidThreshold) setRaidThreshold(snapshot.config.raidThreshold);
      if (typeof snapshot.config.nukeAutoAction === 'number') {
        setNukeAction(snapshot.config.nukeAutoAction === 1);
      }
    }
  }, [snapshot]);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4500);
  };

  const dispatchAction = async (action, params) => {
    setLoading(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, params }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Queued — the phone picks it up within a minute.`);
        poll();
      } else {
        showToast(data.error || 'Failed to dispatch command', true);
      }
    } catch (e) {
      showToast('Network error while queueing command', true);
    }
    setLoading(false);
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  };

  const bot = snapshot.bot || {};
  const guild = snapshot.guild || {};
  const channels = guild.channels || [];
  const roles = guild.roles || [];
  const automodRules = guild.automodRules || [];
  const usage = snapshot.usage || [];
  const cases = snapshot.cases || [];
  const events = snapshot.events || [];
  const logs = snapshot.logs || [];
  const maxCount = Math.max(1, ...usage.map((u) => u.count));
  const isDemo = Boolean(snapshot.demo);
  const ramMb = bot.rssMb || 0;
  const ramPct = Math.min(100, Math.round((ramMb / 256) * 100));
  const section = SECTIONS.find((s) => s.id === activeTab) ?? SECTIONS[0];

  return (
    <div className="dash">
      {/* ── Toast notification ────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className="side">
        <div className="brand">
          <div className="sigil" aria-hidden="true">E</div>
          <div>
            <div className="brand-name">{siteConfig.name}</div>
            <div className="brand-sub">Command center</div>
          </div>
        </div>
        <nav className="nav" role="tablist" aria-label="Dashboard sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={activeTab === s.id}
              className={`nav-item ${activeTab === s.id ? 'active' : ''}`}
              onClick={() => setActiveTab(s.id)}
            >
              <span className="nav-glyph" aria-hidden="true">{s.glyph}</span>
              {s.label}
              {s.id === 'audit' && results.length > 0 && (
                <span className="nav-count">{results.length > 9 ? '9+' : results.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="link-card">
            <div className="row">
              <span className="live-dot" style={isDemo ? { background: 'var(--danger)' } : undefined} />
              {isDemo ? 'Demo data' : 'Live sync'}
            </div>
            <div className="sub">
              Pushed {ago(snapshot.receivedAt)}
              {queue.length > 0 ? ` · ${queue.length} waiting` : ' · queue clear'}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────── */}
      <div className="main">
        <header className="dash-head">
          <div>
            <h1>{section.label}</h1>
            <div className="sub">
              {bot.guild ? <span><strong>{bot.guild}</strong> · </span> : null}
              {section.blurb}
            </div>
          </div>
          <div className="head-actions">
            {queue.length > 0 && (
              <span className="queue-chip">{queue.length} waiting on phone</span>
            )}
            <button className="ghost-btn" onClick={poll} disabled={syncing}>
              <span className={syncing ? 'spin' : ''} aria-hidden="true">↻</span> Sync
            </button>
            <button className="ghost-btn" onClick={logout}>Exit</button>
          </div>
        </header>

        {/* ── Pending queue: everything the phone hasn't picked up yet ── */}
        {queue.length > 0 && (
          <div className="card section queue-strip">
            <h2>Waiting on the phone ({queue.length})</h2>
            <p className="lede">Dispatched from here, executes on the next phone sync.</p>
            <ul className="queue-list">
              {queue.map((c) => (
                <li key={c.id}>
                  <span className="q-dot" aria-hidden="true" />
                  <span className="q-act">{c.action}</span>
                  <span className="q-age">{ago(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <main className="tab-viewport">
          <AnimatePresence mode="wait">
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <motion.div key="overview" {...panelFade}>
                <div className="grid">
                  <div className="card stat">
                    <div className="k">Bot</div>
                    <div className="v small">{bot.username || 'Offline'}</div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                      {bot.startedAt ? `Started ${ago(bot.startedAt)}` : 'Phone host'}
                    </div>
                  </div>
                  <div className="card stat">
                    <div className="k">Phone RAM</div>
                    <div className="v">
                      {ramMb || '—'} <span style={{ fontSize: 16 }}>MB</span>
                    </div>
                    <div className={`meter${ramPct > 75 ? ' hot' : ''}`} role="img" aria-label={`${ramMb} of 256 MB used`}>
                      <span style={{ width: `${ramPct}%` }} />
                    </div>
                    <div className="meter-note">{ramMb} of 256 MB host cap</div>
                  </div>
                  <div className="card stat">
                    <div className="k">Uptime</div>
                    <div className="v small">{dur(bot.uptimeMs || 0)}</div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                      Phone host
                    </div>
                  </div>
                  <div className="card stat">
                    <div className="k">Gateway ping</div>
                    <div className="v">
                      {bot.wsPingMs || '—'} <span style={{ fontSize: 16 }}>ms</span>
                    </div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                      Outbound only
                    </div>
                  </div>
                </div>

                {/* Command usage bars */}
                <div className="card section">
                  <h2>Command volume</h2>
                  {usage.length === 0 ? (
                    <div className="empty">No moderation commands logged yet.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Command</th>
                          <th style={{ width: '45%' }}>Activity</th>
                          <th>Hits</th>
                          <th>Last used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.map((u) => (
                          <tr key={u.name}>
                            <td className="mono">/{u.name}</td>
                            <td>
                              <div className="bar-wrap">
                                <motion.div
                                  className="bar"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.round((u.count / maxCount) * 100)}%` }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                />
                              </div>
                            </td>
                            <td>
                              <strong>{u.count}</strong>
                            </td>
                            <td className="dim">{ago(u.last_used)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Quick control shortcuts */}
                <div className="card section">
                  <h2>Quick actions</h2>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn small" onClick={() => setActiveTab('channels')}>
                      Channels and roles
                    </button>
                    <button className="btn small" onClick={() => setActiveTab('announcements')}>
                      New announcement
                    </button>
                    <button className="btn small" onClick={() => setActiveTab('security')}>
                      Raid and security
                    </button>
                    <button className="btn small" onClick={() => setActiveTab('automod')}>
                      AutoMod rules
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SERVER SETUP */}
            {activeTab === 'channels' && (
              <motion.div key="channels" {...panelFade}>
                <div className="panel-grid">
                  <div className="card">
                    <h2>Audit log channel</h2>
                    <p className="lede">Every moderation action and security alarm gets mirrored here.</p>
                    <div className="field">
                      <label>Channel</label>
                      <select
                        className="input"
                        value={selectedLogChannel}
                        onChange={(e) => setSelectedLogChannel(e.target.value)}
                      >
                        <option value="">Select a channel</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name} ({c.id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn"
                      disabled={loading || !selectedLogChannel}
                      onClick={() => dispatchAction('set-log-channel', { id: selectedLogChannel })}
                    >
                      Assign log channel
                    </button>
                    <div className="form-note">
                      Current: {snapshot?.config?.logChannelId ? `<#${snapshot.config.logChannelId}>` : 'Not configured'}
                    </div>
                  </div>

                  <div className="card">
                    <h2>Moderator roles</h2>
                    <p className="lede">Staff roles allowed to run moderation commands.</p>
                    <div className="field">
                      <label>Update mode</label>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="modMode"
                            checked={modRoleMode === 'set'}
                            onChange={() => setModRoleMode('set')}
                          />
                          Replace list
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="modMode"
                            checked={modRoleMode === 'add'}
                            onChange={() => setModRoleMode('add')}
                          />
                          Add to list
                        </label>
                      </div>
                    </div>
                    <div className="field">
                      <label>Role</label>
                      <select
                        className="input"
                        value={selectedModRole}
                        onChange={(e) => setSelectedModRole(e.target.value)}
                      >
                        <option value="">Select a role</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            @{r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn"
                      disabled={loading || !selectedModRole}
                      onClick={() =>
                        dispatchAction(
                          modRoleMode === 'set' ? 'set-mod-role' : 'add-mod-role',
                          { id: selectedModRole }
                        )
                      }
                    >
                      {modRoleMode === 'set' ? 'Set primary mod role' : 'Add moderator role'}
                    </button>
                    <div className="form-note">
                      Active mod roles: {snapshot?.config?.modRoleIds?.length || 0}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ANNOUNCEMENTS */}
            {activeTab === 'announcements' && (
              <motion.div key="announcements" {...panelFade}>
                <div className="panel-grid">
                  <div className="card">
                    <h2>Send announcement</h2>
                    <p className="lede">Broadcast an official embed through the bot.</p>
                    <div className="field">
                      <label>Channel</label>
                      <select
                        className="input"
                        value={annChannel}
                        onChange={(e) => setAnnChannel(e.target.value)}
                      >
                        <option value="">Select a channel</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Title</label>
                      <input
                        className="input"
                        type="text"
                        placeholder="e.g. Server maintenance notice"
                        value={annTitle}
                        onChange={(e) => setAnnTitle(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Message (Markdown supported)</label>
                      <textarea
                        className="input"
                        placeholder="Type the announcement here..."
                        value={annMessage}
                        onChange={(e) => setAnnMessage(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn"
                      disabled={loading || !annChannel || !annMessage.trim()}
                      onClick={() => {
                        dispatchAction('announce', {
                          channelId: annChannel,
                          title: annTitle,
                          message: annMessage,
                        });
                        setAnnMessage('');
                      }}
                    >
                      Broadcast announcement
                    </button>
                  </div>

                  {/* Embed preview */}
                  <div className="card">
                    <h2>Embed preview</h2>
                    <p className="lede">How members will see it in Discord.</p>
                    <div
                      style={{
                        borderLeft: '3px solid var(--accent)',
                        background: 'rgba(0,0,0,0.45)',
                        padding: '16px 20px',
                        borderRadius: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="live-dot" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)' }}>
                          Eternyx Bot
                        </span>
                      </div>
                      <h3 style={{ fontSize: 17, marginBottom: 8, color: '#fff' }}>
                        {annTitle || 'Announcement title'}
                      </h3>
                      <p style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {annMessage || 'Announcement text renders here...'}
                      </p>
                      <div className="dim" style={{ fontSize: 11, marginTop: 14 }}>
                        Preview — sent by Eternyx when you broadcast
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* GUARDS & CHANNELS */}
            {activeTab === 'security' && (
              <motion.div key="security" {...panelFade}>
                <div className="panel-grid">
                  <div className="card">
                    <h2>Raid and anti-nuke</h2>
                    <div className="field">
                      <label>Join threshold ({raidThreshold} joins per minute)</label>
                      <input
                        type="range"
                        min="3"
                        max="40"
                        value={raidThreshold}
                        onChange={(e) => setRaidThreshold(Number(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                      />
                      <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                        Faster joins than this raise the verification gate.
                      </div>
                    </div>
                    <button
                      className="btn small"
                      disabled={loading}
                      onClick={() => dispatchAction('set-raid-threshold', { joins: raidThreshold })}
                    >
                      Save threshold
                    </button>

                    <hr style={{ margin: '20px 0', borderColor: 'var(--border)' }} />

                    <div className="toggle-row">
                      <div>
                        <strong style={{ fontSize: 14 }}>Auto-timeout mass-ban actors</strong>
                        <div className="dim" style={{ fontSize: 12 }}>
                          Timeout for 1 hour when one actor bans at attack speed.
                        </div>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={nukeAction}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNukeAction(val);
                            dispatchAction('set-nuke-auto-action', { enabled: val });
                          }}
                        />
                        <span className="track" />
                      </label>
                    </div>
                  </div>

                  <div className="card">
                    <h2>Channel locks and slowmode</h2>
                    <div className="field">
                      <label>Channel</label>
                      <select
                        className="input"
                        value={targetChannel}
                        onChange={(e) => setTargetChannel(e.target.value)}
                      >
                        <option value="">Select a channel</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                      <button
                        className="btn small danger-btn"
                        disabled={loading || !targetChannel}
                        onClick={() => dispatchAction('lock-channel', { channelId: targetChannel })}
                      >
                        Lock channel
                      </button>
                      <button
                        className="btn small"
                        disabled={loading || !targetChannel}
                        onClick={() => dispatchAction('unlock-channel', { channelId: targetChannel })}
                      >
                        Unlock channel
                      </button>
                    </div>

                    <div className="field">
                      <label>Slowmode seconds (0 turns it off, max 21600)</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max="21600"
                          value={slowmodeSec}
                          onChange={(e) => setSlowmodeSec(Number(e.target.value))}
                        />
                        <button
                          className="btn small"
                          disabled={loading || !targetChannel}
                          onClick={() =>
                            dispatchAction('set-slowmode', {
                              channelId: targetChannel,
                              seconds: slowmodeSec,
                            })
                          }
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* AUTOMOD */}
            {activeTab === 'automod' && (
              <motion.div key="automod" {...panelFade}>
                <div className="panel-grid">
                  <div className="card">
                    <h2>Block keywords</h2>
                    <div className="field">
                      <label>Rule name</label>
                      <input
                        className="input"
                        type="text"
                        placeholder="e.g. slur-filter"
                        value={kwRuleName}
                        onChange={(e) => setKwRuleName(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Blocked words, one per line (wildcards like *this*)</label>
                      <textarea
                        className="input"
                        placeholder={'badword1\n*phishing.ru*\nfakediscord'}
                        value={kwWords}
                        onChange={(e) => setKwWords(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn"
                      disabled={loading || !kwRuleName || !kwWords.trim()}
                      onClick={() => {
                        const words = kwWords
                          .split('\n')
                          .map((w) => w.trim())
                          .filter(Boolean);
                        dispatchAction('automod-keyword', { name: kwRuleName, words });
                        setKwWords('');
                        setKwRuleName('');
                      }}
                    >
                      Deploy keyword rule
                    </button>
                  </div>

                  <div className="card">
                    <h2>Ready-made protections</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>Block invites</strong>
                          <div className="dim" style={{ fontSize: 12 }}>
                            Blocks discord.gg links in public channels.
                          </div>
                        </div>
                        <button
                          className="btn small"
                          disabled={loading}
                          onClick={() => dispatchAction('automod-invite', {})}
                        >
                          Enable
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>Preset filters</strong>
                          <div className="dim" style={{ fontSize: 12 }}>
                            Blocks slurs, severe profanity, and explicit text.
                          </div>
                        </div>
                        <button
                          className="btn small"
                          disabled={loading}
                          onClick={() => dispatchAction('automod-preset', {})}
                        >
                          Enable
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>Mention spam shield</strong>
                          <div className="dim" style={{ fontSize: 12 }}>
                            Blocks mass mentions (limit {mentionLimit}).
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            className="input"
                            style={{ width: 65, padding: '6px 8px' }}
                            type="number"
                            min="5"
                            max="50"
                            value={mentionLimit}
                            onChange={(e) => setMentionLimit(Number(e.target.value))}
                          />
                          <button
                            className="btn small"
                            disabled={loading}
                            onClick={() => dispatchAction('automod-mention-spam', { limit: mentionLimit })}
                          >
                            Enable
                          </button>
                        </div>
                      </div>
                    </div>

                    <hr style={{ margin: '20px 0', borderColor: 'var(--border)' }} />

                    <h2>Active AutoMod rules ({automodRules.length})</h2>
                    {automodRules.length === 0 ? (
                      <div className="empty">No native rules yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {automodRules.map((r) => (
                          <div
                            key={r.id || r.name}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: 'rgba(0,0,0,0.3)',
                              padding: '8px 12px',
                              borderRadius: '10px',
                            }}
                          >
                            <span className="mono" style={{ fontSize: 13 }}>
                              {r.name}
                            </span>
                            <button
                              className="ghost-btn"
                              style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }}
                              onClick={() => dispatchAction('automod-remove', { name: r.name })}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* LOGS & RESULTS */}
            {activeTab === 'audit' && (
              <motion.div key="audit" {...panelFade}>
                <div className="card section">
                  <h2>Recent action results</h2>
                  {results.length === 0 ? (
                    <div className="empty">No actions from this dashboard yet.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Action</th>
                          <th>Detail</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.slice().reverse().map((r, i) => (
                          <tr key={i}>
                            <td>
                              <span className={`badge ${r.ok ? 'ok' : 'danger'}`}>
                                {r.ok ? 'Success' : 'Failed'}
                              </span>
                            </td>
                            <td className="mono">{r.action}</td>
                            <td>{r.detail}</td>
                            <td className="dim">{ago(r.at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card section">
                  <h2>Recent moderation cases</h2>
                  {cases.length === 0 ? (
                    <div className="empty">No moderation cases recorded yet.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Case</th>
                          <th>Type</th>
                          <th>Target</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cases.map((c) => (
                          <tr key={c.id}>
                            <td className="mono">#{c.id}</td>
                            <td>
                              <span className="badge">{c.type}</span>
                            </td>
                            <td className="mono">{c.user_id === '0' ? '—' : c.user_id}</td>
                            <td className="dim">{String(c.reason || '').slice(0, 50)}</td>
                            <td>
                              <span className={`badge ${c.status === 'ACTIVE' ? 'ok' : ''}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="dim">{ago(c.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card section">
                  <h2>Security events</h2>
                  {events.length === 0 ? (
                    <div className="empty">No security events.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>Detail</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((e, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="badge danger">{e.kind}</span>
                            </td>
                            <td className="mono dim">{String(e.detail || '').slice(0, 90)}</td>
                            <td className="dim">{ago(e.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card section">
                  <h2>Phone log</h2>
                  <div className="logpre">
                    {logs.length > 0 ? logs.join('\n') : 'Waiting for the phone to push logs...'}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="dim" style={{ fontSize: 12, textAlign: 'center', marginTop: 36 }}>
          {siteConfig.footer}
        </footer>
      </div>
    </div>
  );
}
