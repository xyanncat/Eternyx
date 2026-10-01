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

const TABS = [
  { id: 'overview', label: '📊 Overview', desc: 'Live telemetrics, usage & server status' },
  { id: 'channels', label: '⚙️ Server Setup', desc: 'Configure channels, mod roles & hierarchy' },
  { id: 'announcements', label: '📢 Announcements', desc: 'Broadcast embeds directly to any channel' },
  { id: 'security', label: '🛡️ Guards & Channels', desc: 'Raid guard, anti-nuke & channel locks' },
  { id: 'automod', label: '🤖 AutoMod Rules', desc: 'Discord native filters & word blocks' },
  { id: 'audit', label: '📜 Logs & Results', desc: 'Command execution queue, cases & audit' },
];

export default function Board({ initial }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [snapshot, setSnapshot] = useState(initial || {});
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
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
    }
  };

  useEffect(() => {
    const timer = setInterval(poll, 10000);
    poll();
    return () => clearInterval(timer);
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
        showToast(`⚡ Command queued! Executed on phone within ~60s.`);
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

  return (
    <div className="dash">
      {/* ── Toast notification ────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Header ────────────────────────────────────── */}
      <header className="dash-head">
        <motion.div
          className="login-logo"
          whileHover={{ rotate: 10, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          E
        </motion.div>
        <div>
          <h1>{siteConfig.name}</h1>
          <div className="sub">
            {bot.guild ? <span><strong>{bot.guild}</strong> · </span> : null}
            <span>Pushed {ago(snapshot.receivedAt)}</span>
          </div>
        </div>
        <div className="head-spacer" />
        <div className="head-actions">
          {isDemo ? (
            <span className="live-badge demo-badge-lg">
              <span className="live-dot" style={{ background: 'var(--danger)' }} /> DEMO MODE
            </span>
          ) : (
            <span className="live-badge">
              <span className="live-dot" /> LIVE PHONE SYNC
            </span>
          )}
          {queue.length > 0 && (
            <span className="queue-chip">
              ⏳ {queue.length} pending in queue
            </span>
          )}
          <button className="ghost-btn" onClick={poll}>
            ↻ Sync
          </button>
          <button className="ghost-btn" onClick={logout}>
            Exit
          </button>
        </div>
      </header>

      {/* ── Tab Navigation ────────────────────────────────── */}
      <nav className="tabs">
        {TABS.map((tab) => (
          <motion.button
            key={tab.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </motion.button>
        ))}
      </nav>

      {/* ── Main Tab Contents ─────────────────────────────── */}
      <main className="tab-viewport">
        <AnimatePresence mode="wait">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="grid">
                <div className="card stat">
                  <div className="k">Bot Identity</div>
                  <div className="v small">{bot.username || 'Offline'}</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    PID {bot.pid || 'Termux Host'}
                  </div>
                </div>
                <div className="card stat">
                  <div className="k">Phone RAM Footprint</div>
                  <div className="v">
                    {bot.rssMb || '76'} <span style={{ fontSize: 16 }}>MB</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    Strict cap: 256 MB
                  </div>
                </div>
                <div className="card stat">
                  <div className="k">Host Uptime</div>
                  <div className="v small">{dur(bot.uptimeMs || 0)}</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    Xiaomi 10 Prime 24/7
                  </div>
                </div>
                <div className="card stat">
                  <div className="k">Discord Gateway Ping</div>
                  <div className="v">
                    {bot.wsPingMs || '38'} <span style={{ fontSize: 16 }}>ms</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    Outbound WSS tunnel
                  </div>
                </div>
              </div>

              {/* Command usage bars */}
              <div className="card section">
                <h2>📊 Command Volume · All Time</h2>
                {usage.length === 0 ? (
                  <div className="empty">No moderation commands logged yet.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Command</th>
                        <th style={{ width: '45%' }}>Activity Bar</th>
                        <th>Hits</th>
                        <th>Last Executed</th>
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
                                transition={{ duration: 0.8, ease: 'easeOut' }}
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

              {/* Quick Quick Control Card */}
              <div className="card section">
                <h2>⚡ Quick Actions</h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn small"
                    onClick={() => setActiveTab('channels')}
                  >
                    Configure Channels & Roles
                  </button>
                  <button
                    className="btn small"
                    onClick={() => setActiveTab('announcements')}
                  >
                    Draft Server Announcement
                  </button>
                  <button
                    className="btn small"
                    onClick={() => setActiveTab('security')}
                  >
                    Raid & Security Controls
                  </button>
                  <button
                    className="btn small"
                    onClick={() => setActiveTab('automod')}
                  >
                    Manage AutoMod Rules
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: SERVER & CHANNEL SETUP */}
          {activeTab === 'channels' && (
            <motion.div
              key="channels"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="panel-grid">
                {/* Audit Log Channel assignment */}
                <div className="card">
                  <h2>📋 Audit Log Channel</h2>
                  <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
                    Choose the channel where Eternyx mirrors every moderation strike, case embed, and security alarm.
                  </p>
                  <div className="field">
                    <label>Designated Channel</label>
                    <select
                      className="input"
                      value={selectedLogChannel}
                      onChange={(e) => setSelectedLogChannel(e.target.value)}
                    >
                      <option value="">-- Select Discord Channel --</option>
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
                    onClick={() =>
                      dispatchAction('set-log-channel', { id: selectedLogChannel })
                    }
                  >
                    Assign Log Channel
                  </button>
                  <div className="form-note">
                    Current: {snapshot?.config?.logChannelId ? `<#${snapshot.config.logChannelId}>` : 'Not configured'}
                  </div>
                </div>

                {/* Moderator Roles assignment */}
                <div className="card">
                  <h2>🛡️ Moderator Roles</h2>
                  <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
                    Assign staff roles that are authorized to run moderation slash commands.
                  </p>
                  <div className="field">
                    <label>Action Mode</label>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="modMode"
                          checked={modRoleMode === 'set'}
                          onChange={() => setModRoleMode('set')}
                        />
                        Replace Role List
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="modMode"
                          checked={modRoleMode === 'add'}
                          onChange={() => setModRoleMode('add')}
                        />
                        Add to Existing Roles
                      </label>
                    </div>
                  </div>
                  <div className="field">
                    <label>Role to Authorize</label>
                    <select
                      className="input"
                      value={selectedModRole}
                      onChange={(e) => setSelectedModRole(e.target.value)}
                    >
                      <option value="">-- Select Discord Role --</option>
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
                    {modRoleMode === 'set' ? 'Set as Primary Mod Role' : 'Add Moderator Role'}
                  </button>
                  <div className="form-note">
                    Active Mod Roles in DB: {snapshot?.config?.modRoleIds?.length || 0}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <motion.div
              key="announcements"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="panel-grid">
                <div className="card">
                  <h2>📢 Send Server Announcement</h2>
                  <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
                    Compose and broadcast an official embedded announcement via the bot.
                  </p>
                  <div className="field">
                    <label>Destination Channel</label>
                    <select
                      className="input"
                      value={annChannel}
                      onChange={(e) => setAnnChannel(e.target.value)}
                    >
                      <option value="">-- Select Target Channel --</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Embed Header Title</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="e.g., Server Maintenance Notice"
                      value={annTitle}
                      onChange={(e) => setAnnTitle(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Message Content (Markdown supported)</label>
                    <textarea
                      className="input"
                      placeholder="Type your server announcement here..."
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
                    🚀 Broadcast Announcement
                  </button>
                </div>

                {/* Embed Live Visual Preview */}
                <div className="card">
                  <h2>👁️ Live Embed Preview</h2>
                  <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
                    Visual representation of how Discord members will see the embed.
                  </p>
                  <div
                    style={{
                      borderLeft: '4px solid var(--accent)',
                      background: 'rgba(0,0,0,0.5)',
                      padding: '16px 20px',
                      borderRadius: '8px',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span className="live-dot" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                        Eternyx Bot
                      </span>
                    </div>
                    <h3 style={{ fontSize: 17, marginBottom: 8, color: '#fff' }}>
                      {annTitle || 'Announcement Title'}
                    </h3>
                    <p style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {annMessage || 'Your announcement text will render here...'}
                    </p>
                    <div className="dim" style={{ fontSize: 11, marginTop: 14 }}>
                      Case Preview · by @Eternyx · Eternyx Dev Center
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: GUARDS & SECURITY */}
          {activeTab === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="panel-grid">
                {/* Raid & Nuke settings */}
                <div className="card">
                  <h2>🛡️ Raid & Anti-Nuke Tuning</h2>
                  <div className="field">
                    <label>Join Raid Threshold ({raidThreshold} joins / min)</label>
                    <input
                      type="range"
                      min="3"
                      max="40"
                      value={raidThreshold}
                      onChange={(e) => setRaidThreshold(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                    <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                      Triggers join verification gate if members join faster than this.
                    </div>
                  </div>
                  <button
                    className="btn small"
                    disabled={loading}
                    onClick={() =>
                      dispatchAction('set-raid-threshold', { joins: raidThreshold })
                    }
                  >
                    Save Threshold
                  </button>

                  <hr style={{ margin: '20px 0', borderColor: 'var(--border)' }} />

                  <div className="toggle-row">
                    <div>
                      <strong style={{ fontSize: 14 }}>Auto-Timeout Mass Ban Actors</strong>
                      <div className="dim" style={{ fontSize: 12 }}>
                        Automatically applies 1h timeout on compromised admin burst.
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

                {/* Channel Lock & Slowmode */}
                <div className="card">
                  <h2>🔒 Channel Lockdown & Slowmode</h2>
                  <div className="field">
                    <label>Target Channel</label>
                    <select
                      className="input"
                      value={targetChannel}
                      onChange={(e) => setTargetChannel(e.target.value)}
                    >
                      <option value="">-- Choose Channel --</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                    <button
                      className="btn small"
                      style={{ background: 'var(--danger)' }}
                      disabled={loading || !targetChannel}
                      onClick={() =>
                        dispatchAction('lock-channel', { channelId: targetChannel })
                      }
                    >
                      🔒 Lock Channel
                    </button>
                    <button
                      className="btn small"
                      disabled={loading || !targetChannel}
                      onClick={() =>
                        dispatchAction('unlock-channel', { channelId: targetChannel })
                      }
                    >
                      🔓 Unlock Channel
                    </button>
                  </div>

                  <div className="field">
                    <label>Set Slowmode (Seconds: 0 = Off, Max: 21600)</label>
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

          {/* TAB 5: AUTOMOD RULES */}
          {activeTab === 'automod' && (
            <motion.div
              key="automod"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="panel-grid">
                {/* Create Custom Keyword Rule */}
                <div className="card">
                  <h2>🚫 Block Keywords & Phrases</h2>
                  <div className="field">
                    <label>Rule Identifier</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="e.g., slur-filter"
                      value={kwRuleName}
                      onChange={(e) => setKwRuleName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Blocked Words (one per line, wildcards *like* this)</label>
                    <textarea
                      className="input"
                      placeholder="badword1&#10;*phishing.ru*&#10;fakediscord"
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
                    Deploy Native Keyword Rule
                  </button>
                </div>

                {/* Instant Presets */}
                <div className="card">
                  <h2>🛡️ One-Click Native Protections</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Block Discord Invites</strong>
                        <div className="dim" style={{ fontSize: 12 }}>
                          Blocks discord.gg links in all public chat channels.
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
                        <strong>Discord Pre-Configured Presets</strong>
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
                        <strong>Mention Spam Shield</strong>
                        <div className="dim" style={{ fontSize: 12 }}>
                          Blocks mass @mention attacks (Limit: {mentionLimit}).
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
                          onClick={() =>
                            dispatchAction('automod-mention-spam', { limit: mentionLimit })
                          }
                        >
                          Enable
                        </button>
                      </div>
                    </div>
                  </div>

                  <hr style={{ margin: '20px 0', borderColor: 'var(--border)' }} />

                  <h2>Active AutoMod Rules ({automodRules.length})</h2>
                  {automodRules.length === 0 ? (
                    <div className="empty">No native rules fetched yet.</div>
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
                            borderRadius: '8px',
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

          {/* TAB 6: AUDIT, QUEUE & LIVE RESULTS */}
          {activeTab === 'audit' && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {/* Live Execution Results from Phone */}
              <div className="card section">
                <h2>⚡ Recent Dashboard Action Results (From Phone)</h2>
                {results.length === 0 ? (
                  <div className="empty">No recent web actions recorded.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Action</th>
                        <th>Outcome Detail</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice().reverse().map((r, i) => (
                        <tr key={i}>
                          <td>
                            <span className={`badge ${r.ok ? 'ok' : 'danger'}`}>
                              {r.ok ? 'SUCCESS' : 'FAILED'}
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

              {/* Moderation Cases */}
              <div className="card section">
                <h2>⚖️ Recent Moderation Cases</h2>
                {cases.length === 0 ? (
                  <div className="empty">No moderation cases recorded in SQLite yet.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Case #</th>
                        <th>Type</th>
                        <th>Target User</th>
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

              {/* Security Events */}
              <div className="card section">
                <h2>🚨 Security Alarms & Tamper Events</h2>
                {events.length === 0 ? (
                  <div className="empty">All quiet — no security events triggered.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Details</th>
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

              {/* Raw Log Output */}
              <div className="card section">
                <h2>🖥️ Live Phone Log Tail</h2>
                <div className="logpre">
                  {logs.length > 0 ? logs.join('\n') : 'Waiting for phone bot to push logs...'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="dim" style={{ fontSize: 12, textAlign: 'center', marginTop: 40 }}>
        {siteConfig.footer}
      </footer>
    </div>
  );
}
