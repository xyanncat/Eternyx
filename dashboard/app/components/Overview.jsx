'use client';

import { motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { ArrowUpRight, ChevronRight, Shield, Clock3, Activity } from 'lucide-react';
import Ribbon from './Ribbon';

const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } };
function ago(at) {
  if (!at) return 'Not reported';
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export default function Overview({ snapshot, connection, onNavigate }) {
  const bot = snapshot.bot || {};
  const rules = (snapshot.guild?.automodRules || []).filter(rule => rule.enabled !== false);
  const usage = [...(snapshot.usage || [])].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...usage.map(command => command.count));
  const cases = (snapshot.cases || []).slice(0, 5);
  const uptime = bot.uptimeMs || 0;
  const title = snapshot.config?.lockdownActive ? 'Server lockdown is active.' : connection === 'live' ? 'Connected to your server.' : connection === 'demo' ? 'Explore your server controls.' : 'Waiting for the next update.';
  return (
    <motion.div className="overview" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>
      <motion.section className="overview-banner" variants={item}>
        <div className="banner-copy">
          <h2>{title}</h2>
          <p>{connection === 'live' ? 'Live activity and moderation, delivered directly from your phone.' : connection === 'demo' ? 'You’re viewing sample data. Live activity appears when the bot reports in.' : 'The last snapshot is shown below. Refresh to check for a new report.'}</p>
          <button className="text-link" onClick={() => onNavigate('security')}>Manage protection <ArrowUpRight size={16} /></button>
        </div>
        <Ribbon />
      </motion.section>
      <motion.section className="metric-strip" aria-label="Bot health" variants={item}>
        <div><span>Gateway latency</span><strong>{bot.wsPingMs == null ? '—' : <NumberFlow value={bot.wsPingMs} />}<small>ms</small></strong></div>
        <div><span>Memory usage</span><strong>{bot.rssMb == null ? '—' : <NumberFlow value={bot.rssMb} />}<small>MB</small></strong></div>
        <div><span>Session uptime</span><strong>{Math.floor(uptime / 3600000)}<small>h</small> {Math.floor(uptime % 3600000 / 60000)}<small>m</small></strong></div>
        <div><span>Active AutoMod rules</span><strong><NumberFlow value={rules.length} /></strong></div>
      </motion.section>
      <div className="overview-columns">
        <motion.section className="activity-panel" variants={item}>
          <div className="section-heading"><h2>Command activity</h2><span>Recorded totals</span></div>
          {usage.length ? <div className="command-chart">{usage.slice(0, 8).map((command, index) => (
            <div className="command-row" key={command.name} title={`/${command.name}: ${command.count} uses`}>
              <span>/{command.name}</span>
              <div className="command-track"><motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: 0.2 + index * 0.045, ease: [0.22, 1, 0.36, 1] }} style={{ width: `${Math.max(1, command.count / max * 100)}%` }} /></div>
              <strong><NumberFlow value={command.count} /></strong>
            </div>
          ))}</div> : <div className="empty"><Activity size={24} /><p>No commands recorded yet.</p></div>}
        </motion.section>
        <motion.section className="recent-panel" variants={item}>
          <div className="section-heading"><h2>Recent cases</h2><button className="text-link" onClick={() => onNavigate('audit')}>View all <ChevronRight size={15} /></button></div>
          {cases.length ? <div className="case-list">{cases.map(entry => (
            <button key={entry.id} className="case-entry" onClick={() => onNavigate('audit')}>
              <span className={`case-icon case-${entry.type}`}><Shield size={17} /></span>
              <span className="case-copy"><strong>{entry.type}<small>Case #{entry.id}</small></strong><span>{entry.reason || 'No reason recorded'}</span></span>
              <time suppressHydrationWarning>{ago(entry.created_at)}</time>
            </button>
          ))}</div> : <div className="empty"><Clock3 size={24} /><p>No moderation cases yet.</p></div>}
        </motion.section>
      </div>
      <motion.div className="overview-shortcuts" variants={item}>
        <button onClick={() => onNavigate('announcements')}>Write an announcement <ArrowUpRight size={15} /></button>
        <button onClick={() => onNavigate('channels')}>Configure your server <ArrowUpRight size={15} /></button>
        <span>{connection === 'demo' ? 'Sample data' : 'Hosted on your phone'}</span>
      </motion.div>
    </motion.div>
  );
}
