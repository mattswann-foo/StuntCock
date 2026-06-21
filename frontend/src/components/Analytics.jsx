// StuntCock — Analytics panel with 7-day bar chart
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { API, getAuthHeaders } from '../lib/utils.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl px-4 py-3 text-xs" style={{
      background: 'rgba(17,30,71,0.95)',
      border: '1px solid rgba(61,114,232,0.3)',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <p className="mb-2 font-semibold text-white">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{p.name}:</span>
          <span className="text-white font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{
      background: 'rgba(17,30,71,0.5)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{sub}</p>}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/analytics?days=7`, { headers: { ...getAuthHeaders() } }).then(r => r.json()).then(setData).catch(() => {});
  }, []);

  const daily = data?.daily ?? [];
  const totals = daily.reduce((acc, r) => ({
    total:     acc.total     + r.total,
    replied:   acc.replied   + r.replied,
    llm:       acc.llm       + r.llm_triggered,
    unmatched: acc.unmatched + r.unmatched,
  }), { total: 0, replied: 0, llm: 0, unmatched: 0 });

  const filled = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = d.toISOString().slice(0, 10);
    const found = daily.find(r => r.day === day);
    return { ...(found || { total: 0, replied: 0, llm_triggered: 0, unmatched: 0 }), day: day.slice(5) };
  });

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Received (7d)"     value={totals.total}     sub="all inbound" />
        <StatCard label="Auto-replied (7d)" value={totals.replied}   color="text-[#3D72E8]" />
        <StatCard label="LLM-triggered (7d)"value={totals.llm}       color="text-[#E8365D]" />
        <StatCard label="Unmatched (7d)"    value={totals.unmatched} sub="no rule, no LLM" />
      </div>

      {/* Chart */}
      <div className="rounded-3xl p-5" style={{
        background: 'rgba(17,30,71,0.5)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-5"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          Messages per day — last 7 days
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={filled} barGap={2} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(61,114,232,0.06)', radius: 8 }} />
            <Bar dataKey="total"        name="Received" fill="#3D72E8" radius={[6,6,0,0]} />
            <Bar dataKey="replied"      name="Replied"  fill="#2D5ACC" radius={[6,6,0,0]} />
            <Bar dataKey="llm_triggered" name="LLM"    fill="#E8365D" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>

        <div className="flex gap-5 mt-4">
          {[
            { color: '#3D72E8', label: 'Received' },
            { color: '#2D5ACC', label: 'Replied' },
            { color: '#E8365D', label: 'LLM' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
