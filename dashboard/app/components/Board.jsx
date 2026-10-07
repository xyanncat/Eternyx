'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import NumberFlow from '@number-flow/react';
import {
  LayoutDashboard,
  Server,
  Megaphone,
  ShieldAlert,
  Bot,
  ScrollText,
  Cpu,
  MemoryStick,
  Timer,
  Activity,
  RotateCw,
  LogOut,
  ArrowUpRight,
  Link2Off,
  ListFilter,
  AtSign,
  Trash2,
  Send,
} from 'lucide-react';
import { siteConfig } from '@/lib/site-config';
import Overview from './Overview';

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
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, blurb: 'Bot health, command volume, and server state.' },
  { id: 'channels', label: 'Server setup', icon: Server, blurb: 'Log channel and moderator roles.' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, blurb: 'Broadcast embeds through the bot.' },
  { id: 'security', label: 'Guards & channels', icon: ShieldAlert, blurb: 'Raid threshold, auto-action, locks, slowmode.' },
  { id: 'automod', label: 'AutoMod', icon: Bot, blurb: 'Native Discord content filters.' },
  { id: 'audit', label: 'Logs & results', icon: ScrollText, blurb: 'Executions, cases, alarms, phone log.' },
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
  const [pollError, setPollError] = useState(false);
  const [now, setNow] = useState(null);

  // Form states for setup actions
  const [selectedLogChannel, setSelectedLogChannel] = useState('');
  const [selectedModRole, setSelectedModRole] = useState('');
  const [modRoleMode, setModRoleMode] = useState('set'); // set or add
  const [autoRoleUser, setAutoRoleUser] = useState('');
  const [autoRoleBot, setAutoRoleBot] = useState('');
  const [raidThreshold, setRaidThreshold] = useState(10);
  const [nukeAction, setNukeAction] = useState(false);

  // Announcement state
  const [annChannel, setAnnChannel] = useState('');
  const [annTitle, setAnnTitle] = useState('Important Server Announcement');
  const [annMessage, setAnnMessage] = useState('');
  const [annRole, setAnnRole] = useState('');
  const [annUser, setAnnUser] = useState('');

  // Channel Lock & Slowmode
  const [targetChannel, setTargetChannel] = useState('');
  const [slowmodeSec, setSlowmodeSec] = useState(0);

  // AutoMod states
  const [kwRuleName, setKwRuleName] = useState('');
  const [kwWords, setKwWords] = useState('');
  const [mentionLimit, setMentionLimit] = useState(10);

  // Poller for real-time live data
  const poll = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/overview');
      if (res.status === 401 || res.redirected) { window.location.href = '/'; return; }
      if (res.ok) {
        const data = await res.json();
        setPollError(false);
        setNow(Date.now());
        if (data.snapshot) setSnapshot(data.snapshot);
        if (data.queue) setQueue(data.queue);
        if (data.results) setResults(data.results);
      } else { setPollError(true); }
    } catch {
      setPollError(true);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    // 60s matches the phone's push/pull cadence — faster polling only burns
    // Vercel function + Blob invocations without fresher data.
    const timer = setInterval(poll, 60000);
    poll();
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(timer); clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync initial config from snapshot
  useEffect(() => {
    if (snapshot?.config) {
      if (snapshot.config.logChannelId) setSelectedLogChannel(snapshot.config.logChannelId);
      if (snapshot.config.autoRoleUserId) setAutoRoleUser(snapshot.config.autoRoleUserId);
      if (snapshot.config.autoRoleBotId) setAutoRoleBot(snapshot.config.autoRoleBotId);
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
        showToast('Command queued. Waiting for the phone to apply it.');
        poll();
      } else {
        showToast(data.error || 'FAILED TO DISPATCH COMMAND', true);
      }
    } catch {
      showToast('NETWORK ERROR WHILE QUEUEING COMMAND', true);
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
  const connection = isDemo ? 'demo' : pollError || !snapshot.receivedAt || (now != null && now - snapshot.receivedAt > 180000) ? 'stale' : 'live';
  const lockdownActive = Boolean(snapshot?.config?.lockdownActive);
  const ramMb = bot.rssMb || 0;
  const ramPct = Math.min(100, Math.round((ramMb / 256) * 100));
  const section = SECTIONS.find((s) => s.id === activeTab) ?? SECTIONS[0];

  return (
    <MotionConfig reducedMotion="user">
    <div className="shell">
      {/* ── Toast notification ────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -12, x: '-50%' }}
            transition={{ duration: 0.2 }}
            className={`toast ${toast.isError ? 'toast-error' : ''}`}
            role="status"
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
            <div className="brand-sub">Server workspace</div>
          </div>
        </div>
        <nav className="nav" aria-label="Dashboard sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = activeTab === s.id;
            return (
              <button
                key={s.id}
                aria-current={active ? 'page' : undefined}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setActiveTab(s.id)}
              >
                {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon size={15} aria-hidden="true" />
                <span className="nav-label">{s.label}</span>
                {s.id === 'audit' && results.length > 0 && (
                  <span className="nav-count">{results.length > 9 ? '9+' : results.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="sync-card">
            <div className="row">
              <span className={`led ${connection !== 'live' ? 'off' : ''}`} aria-hidden="true" />
              {connection === 'demo' ? 'Demo workspace' : connection === 'live' ? 'Phone connected' : 'Update delayed'}
            </div>
            <div className="sub" suppressHydrationWarning>
              pushed {ago(snapshot.receivedAt)}
              <br />
              {queue.length > 0 ? `${queue.length} waiting on phone` : 'queue clear'}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────── */}
      <div className="main">
        <header className="dash-head">
          <div>
            <h1>{activeTab === 'overview' ? 'Server overview' : section.label}</h1>
            <div className="sub dim" style={{ fontSize: 13.5 }}>
              {bot.guild ? <strong style={{ color: 'var(--text)' }}>{bot.guild}</strong> : null}
              {!bot.guild || activeTab !== 'overview' ? ` ${section.blurb}` : ''}
            </div>
          </div>
          <div className="head-actions">
            {queue.length > 0 && (
              <span className="queue-chip">{queue.length} waiting on phone</span>
            )}
            <button className="btn ghost small" onClick={poll} disabled={syncing}>
              <RotateCw size={15} className={syncing ? 'spin' : ''} aria-hidden="true" /> Refresh
            </button>
            <button className="btn ghost small" onClick={logout}>
              <LogOut size={15} aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>

        {/* ── Pending queue: everything the phone hasn't picked up yet ── */}
        {queue.length > 0 && (
          <div className="card pad ticked queue-strip">
            <div className="sec-head">
              <span className="kicker magenta">Dispatch queue</span>
              <h2>Waiting on the phone ({queue.length})</h2>
            </div>
            <p className="lede">Dispatched from here — the bot applies it within its next sync cycle.</p>
            <ul className="queue-list">
              {queue.map((c) => (
                <li key={c.id}>
                  <span className="q-dot" aria-hidden="true" />
                  <span>{c.action}</span>
                  <span className="q-age" suppressHydrationWarning>{ago(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <main>
          <AnimatePresence mode="wait">
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <motion.div key="overview" {...panelFade}>
                <Overview snapshot={snapshot} connection={connection} onNavigate={setActiveTab} />
              </motion.div>
            )}

            {/* SERVER SETUP */}
            {activeTab === 'channels' && (
              <motion.div key="channels" {...panelFade} className="panel-grid">
                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker">Target</span>
                    <h2>Audit log channel</h2>
                  </div>
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

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker">Staff</span>
                    <h2>Moderator roles</h2>
                  </div>
                  <p className="lede">Staff roles allowed to run moderation commands.</p>
                  <div className="field">
                    <label>Update mode</label>
                    <div className="seg" role="radiogroup" aria-label="Update mode">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={modRoleMode === 'set'}
                        className={modRoleMode === 'set' ? 'on' : ''}
                        onClick={() => setModRoleMode('set')}
                      >
                        Replace list
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={modRoleMode === 'add'}
                        className={modRoleMode === 'add' ? 'on' : ''}
                        onClick={() => setModRoleMode('add')}
                      >
                        Add to list
                      </button>
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

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker">On join</span>
                    <h2>Auto roles</h2>
                  </div>
                  <p className="lede">
                    Granted automatically when someone joins. Requires the bot to have Manage Roles
                    with its role above both picks.
                  </p>
                  <div className="field">
                    <label>Role for members</label>
                    <select
                      className="input"
                      value={autoRoleUser}
                      onChange={(e) => setAutoRoleUser(e.target.value)}
                    >
                      <option value="">Off</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Role for bots</label>
                    <select
                      className="input"
                      value={autoRoleBot}
                      onChange={(e) => setAutoRoleBot(e.target.value)}
                    >
                      <option value="">Off</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn small"
                      disabled={loading || !autoRoleUser}
                      onClick={() => dispatchAction('set-auto-role', { kind: 'user', id: autoRoleUser })}
                    >
                      Save member role
                    </button>
                    <button
                      className="btn small"
                      disabled={loading || !autoRoleBot}
                      onClick={() => dispatchAction('set-auto-role', { kind: 'bot', id: autoRoleBot })}
                    >
                      Save bot role
                    </button>
                  </div>
                  <div className="form-note">
                    Current: members {snapshot?.config?.autoRoleUserId ? '✓ set' : 'off'} · bots{' '}
                    {snapshot?.config?.autoRoleBotId ? '✓ set' : 'off'}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ANNOUNCEMENTS */}
            {activeTab === 'announcements' && (
              <motion.div key="announcements" {...panelFade} className="panel-grid">
                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker magenta">Broadcast</span>
                    <h2>Send announcement</h2>
                  </div>
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
                  <div className="field">
                    <label>Ping a role (optional)</label>
                    <select
                      className="input"
                      value={annRole}
                      onChange={(e) => setAnnRole(e.target.value)}
                    >
                      <option value="">No role ping</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Ping a user (optional)</label>
                    <select
                      className="input"
                      value={annUser}
                      onChange={(e) => setAnnUser(e.target.value)}
                    >
                      <option value="">No user ping</option>
                      {(guild.members || []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn"
                    disabled={loading || !annChannel || !annMessage.trim()}
                    onClick={() => {
                      dispatchAction('announce', {
                        channelId: annChannel,
                        title: annTitle,
                        message: annMessage,
                        mentionRoleIds: annRole ? [annRole] : [],
                        mentionUserIds: annUser ? [annUser] : [],
                      });
                      setAnnMessage('');
                    }}
                  >
                    <Send size={14} aria-hidden="true" /> Broadcast announcement
                  </button>
                </div>

                {/* Embed preview */}
                <div className="card pad">
                  <div className="sec-head">
                    <span className="kicker cyan">Preview</span>
                    <h2>How members see it</h2>
                  </div>
                  <p className="lede">Renders exactly like the Discord embed.</p>
                  <div className="embed-mock">
                    {(annRole || annUser) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {annRole && (
                          <span style={{ background: 'rgba(88,101,242,0.25)', color: 'var(--accent2)', padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
                            @{roles.find((r) => r.id === annRole)?.name ?? 'role'}
                          </span>
                        )}
                        {annUser && (
                          <span style={{ background: 'rgba(88,101,242,0.25)', color: 'var(--accent2)', padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
                            @{(guild.members || []).find((m) => m.id === annUser)?.name ?? 'user'}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="author">
                      <span className="led" aria-hidden="true" />
                      Eternyx Bot
                    </div>
                    <h3>{annTitle || 'Announcement title'}</h3>
                    <p>{annMessage || 'Announcement text renders here...'}</p>
                    <div className="foot">PREVIEW — SENT BY ETERNYX WHEN YOU BROADCAST</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* GUARDS & CHANNELS */}
            {activeTab === 'security' && (
              <motion.div key="security" {...panelFade} className="panel-grid">
                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker red">Anti-raid</span>
                    <h2>Raid and anti-nuke</h2>
                  </div>
                  <div className="field">
                    <label>Join threshold ({raidThreshold} joins per minute)</label>
                    <input
                      type="range"
                      className="range"
                      min="3"
                      max="40"
                      value={raidThreshold}
                      onChange={(e) => setRaidThreshold(Number(e.target.value))}
                    />
                    <div className="dim" style={{ fontSize: 12 }}>
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

                  <hr className="divider" />

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

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker amber">Controls</span>
                    <h2>Channel locks and slowmode</h2>
                  </div>
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
                      className="btn small danger"
                      disabled={loading || !targetChannel}
                      onClick={() => dispatchAction('lock-channel', { channelId: targetChannel })}
                    >
                      Lock channel
                    </button>
                    <button
                      className="btn small ghost"
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

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className={`kicker ${lockdownActive ? 'red' : 'amber'}`}>{lockdownActive ? 'Emergency' : 'Controls'}</span>
                    <h2>Server lockdown</h2>
                  </div>
                  <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
                    Locks every public channel at once. Unlock restores each channel&apos;s previous
                    permissions exactly — the state survives bot restarts.
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                    <span className={`badge ${lockdownActive ? 'danger' : ''}`}>
                      {lockdownActive ? 'Lockdown ACTIVE' : 'Lockdown off'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn small danger"
                      disabled={loading || lockdownActive}
                      onClick={() => dispatchAction('lockdown-on', {})}
                    >
                      Lockdown ON
                    </button>
                    <button
                      className="btn small ghost"
                      disabled={loading || !lockdownActive}
                      onClick={() => dispatchAction('lockdown-off', {})}
                    >
                      Lockdown OFF
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* AUTOMOD */}
            {activeTab === 'automod' && (
              <motion.div key="automod" {...panelFade} className="panel-grid">
                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker">Filter</span>
                    <h2>Block keywords</h2>
                  </div>
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

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker cyan">One-click</span>
                    <h2>Ready-made protections</h2>
                  </div>
                  <div className="stack" style={{ gap: 12 }}>
                    <div className="prot-row">
                      <span className="ic" aria-hidden="true"><Link2Off size={16} /></span>
                      <div style={{ flex: 1 }}>
                        <strong>Block invites</strong>
                        <div className="desc">Blocks discord.gg links in public channels.</div>
                      </div>
                      <button
                        className="btn small ghost"
                        disabled={loading}
                        onClick={() => dispatchAction('automod-invite', {})}
                      >
                        Enable
                      </button>
                    </div>

                    <div className="prot-row">
                      <span className="ic" aria-hidden="true"><ListFilter size={16} /></span>
                      <div style={{ flex: 1 }}>
                        <strong>Preset filters</strong>
                        <div className="desc">Blocks slurs, severe profanity, and explicit text.</div>
                      </div>
                      <button
                        className="btn small ghost"
                        disabled={loading}
                        onClick={() => dispatchAction('automod-preset', {})}
                      >
                        Enable
                      </button>
                    </div>

                    <div className="prot-row">
                      <span className="ic" aria-hidden="true"><AtSign size={16} /></span>
                      <div style={{ flex: 1 }}>
                        <strong>Mention spam shield</strong>
                        <div className="desc">Blocks mass mentions (limit {mentionLimit}).</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          className="input"
                          style={{ width: 70, padding: '7px 9px' }}
                          type="number"
                          min="5"
                          max="50"
                          value={mentionLimit}
                          onChange={(e) => setMentionLimit(Number(e.target.value))}
                        />
                        <button
                          className="btn small ghost"
                          disabled={loading}
                          onClick={() => dispatchAction('automod-mention-spam', { limit: mentionLimit })}
                        >
                          Enable
                        </button>
                      </div>
                    </div>
                  </div>

                  <hr className="divider" />

                  <div className="sec-head">
                    <span className="kicker">Active</span>
                    <h2>AutoMod rules ({automodRules.length})</h2>
                  </div>
                  {automodRules.length === 0 ? (
                    <div className="empty">No native rules yet.</div>
                  ) : (
                    <div className="stack" style={{ gap: 8 }}>
                      {automodRules.map((r) => (
                        <div key={r.id || r.name} className="rule-row">
                          <span>{r.name}</span>
                          <button
                            className="btn danger small"
                            style={{ padding: '4px 10px' }}
                            aria-label={`Delete rule ${r.name}`}
                            onClick={() => dispatchAction('automod-remove', { name: r.name })}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* LOGS & RESULTS */}
            {activeTab === 'audit' && (
              <motion.div key="audit" {...panelFade} className="stack">
                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker magenta">Dispatches</span>
                    <h2>Recent action results</h2>
                  </div>
                  {results.length === 0 ? (
                    <div className="empty">No actions from this dashboard yet.</div>
                  ) : (
                    <div className="tablewrap"><table>
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
                            <td className="dim nowrap" suppressHydrationWarning>{ago(r.at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </div>

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker">Cases</span>
                    <h2>Recent moderation cases</h2>
                  </div>
                  {cases.length === 0 ? (
                    <div className="empty">No moderation cases recorded yet.</div>
                  ) : (
                    <div className="tablewrap"><table>
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
                            <td><span className="badge">{c.type}</span></td>
                            <td className="mono truncate-id">{c.user_id === '0' ? '—' : c.user_id}</td>
                            <td className="dim">{String(c.reason || '').slice(0, 50)}</td>
                            <td>
                              <span className={`badge ${c.status === 'ACTIVE' ? 'ok' : ''}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="dim nowrap" suppressHydrationWarning>{ago(c.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </div>

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker red">Alarms</span>
                    <h2>Security events</h2>
                  </div>
                  {events.length === 0 ? (
                    <div className="empty">No security events.</div>
                  ) : (
                    <div className="tablewrap"><table>
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
                            <td><span className="badge danger">{e.kind}</span></td>
                            <td className="mono dim">{String(e.detail || '').slice(0, 90)}</td>
                            <td className="dim nowrap" suppressHydrationWarning>{ago(e.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </div>

                <div className="card pad ticked">
                  <div className="sec-head">
                    <span className="kicker cyan">Phone</span>
                    <h2>Host log</h2>
                  </div>
                  <div className="logpre">
                    {logs.length > 0 ? logs.join('\n') : 'Waiting for the phone to push logs...'}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="dash-foot">{siteConfig.footer}</footer>
      </div>
    </div>
    </MotionConfig>
  );
}
