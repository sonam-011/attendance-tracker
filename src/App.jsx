import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Auth from './Auth';

const DEFAULT_TARGET = 75;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}`; }
function todayKey() {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function colorForPercent(percent, target) {
  if (percent === null) return '#B0B0C3';
  if (percent >= target) return '#22C55E';
  if (percent >= target - 15) return '#F59E0B';
  return '#EF4444';
}

// attendance is a map: { "2026-01-15": "present" | "absent" | "off" }
function getStats(attendance, target) {
  const days = Object.values(attendance || {});
  const attended = days.filter((s) => s === 'present').length;
  const missed = days.filter((s) => s === 'absent').length;
  const total = attended + missed; // "off" days don't count toward %
  if (total === 0) return { attended, missed, total, percent: null, message: 'No classes recorded yet' };

  const percent = (attended / total) * 100;
  const t = target / 100;
  if (percent >= target) {
    const canSkip = Math.floor(attended / t - total);
    return {
      attended, missed, total, percent,
      message: canSkip > 0 ? `Can miss ${canSkip} more class${canSkip === 1 ? '' : 'es'}` : "Can't miss any class",
    };
  } else {
    const needed = Math.max(0, Math.ceil((t * total - attended) / (1 - t)));
    return { attended, missed, total, percent, message: `Attend ${needed} class${needed === 1 ? '' : 'es'} in a row` };
  }
}

function ProgressRing({ percent, color, size = 60, strokeWidth = 6 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = percent ?? 0;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#EDEDF2" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.24} fontWeight="700" fill={color}>
        {percent === null ? '—' : `${Math.round(percent)}%`}
      </text>
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setSubjects(data.subjects || []);
          setTarget(data.target || DEFAULT_TARGET);
        }
      } finally {
        setDataLoading(false);
      }
    })();
  }, [user]);

  async function saveData(newSubjects, newTarget) {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), { subjects: newSubjects, target: newTarget }, { merge: true });
  }

  const selected = subjects.find((s) => s.id === selectedId) || null;

  function addSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    const updated = [...subjects, { id: Date.now().toString(), name, attendance: {} }];
    setSubjects(updated);
    saveData(updated, target);
    setNewSubjectName('');
  }

  function deleteSubject(id) {
    const updated = subjects.filter((s) => s.id !== id);
    setSubjects(updated);
    saveData(updated, target);
    if (selectedId === id) setSelectedId(null);
  }

  // Cycle a date's status: none -> present -> absent -> off -> none
  function toggleDate(subjectId, key) {
    const updated = subjects.map((s) => {
      if (s.id !== subjectId) return s;
      const current = s.attendance[key];
      const order = [undefined, 'present', 'absent', 'off'];
      const next = order[(order.indexOf(current) + 1) % order.length];
      const newAttendance = { ...s.attendance };
      if (next) newAttendance[key] = next; else delete newAttendance[key];
      return { ...s, attendance: newAttendance };
    });
    setSubjects(updated);
    saveData(updated, target);
  }

  function changeTarget(newTarget) {
    setTarget(newTarget);
    saveData(subjects, newTarget);
  }

  if (authLoading) return <CenteredMessage text="Loading…" />;
  if (!user) return <Auth />;
  if (dataLoading) return <CenteredMessage text="Fetching your data…" />;

  const allDays = subjects.flatMap((s) => Object.values(s.attendance || {}));
  const overallAttended = allDays.filter((s) => s === 'present').length;
  const overallMissed = allDays.filter((s) => s === 'absent').length;
  const overallTotal = overallAttended + overallMissed;
  const overallPercent = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : null;

  const sortedSubjects = [...subjects].sort((a, b) => {
    const pa = getStats(a.attendance, target).percent;
    const pb = getStats(b.attendance, target).percent;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #F5F3FF 0%, #E0F7FA 50%, #FFF0F6 100%)',
      fontFamily: "'Poppins', 'Segoe UI', sans-serif",
      padding: '24px 16px 60px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .card { animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .btn { transition: transform 0.12s ease; border: none; cursor: pointer; }
        .btn:hover { transform: translateY(-2px); }
        .btn:active { transform: scale(0.96); }
        .subj-row { transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
        .subj-row:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(108,92,231,0.15); }
        .day-cell { transition: transform 0.1s ease; cursor: pointer; }
        .day-cell:hover { transform: scale(1.08); }
      `}</style>

      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        {!selected ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h1 style={{
                  fontSize: 28, fontWeight: 800, margin: 0,
                  background: 'linear-gradient(135deg, #6C5CE7, #00B4D8)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  My Attendance
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: '#666' }}>Target:</span>
                  <input
                    type="number" min={1} max={100} value={target}
                    onChange={(e) => changeTarget(Math.min(100, Math.max(1, Number(e.target.value) || 0)))}
                    style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }}
                  />
                  <span style={{ fontSize: 13, color: '#666' }}>%</span>
                </div>
              </div>
              <button className="btn" onClick={() => signOut(auth)} style={{ background: 'none', color: '#999', fontSize: 13, marginTop: 6 }}>
                Sign out
              </button>
            </div>

            <div className="card" style={{
              borderRadius: 18, padding: 20, marginBottom: 20, color: '#fff',
              background: 'linear-gradient(135deg, #6C5CE7 0%, #00B4D8 100%)',
              boxShadow: '0 10px 30px rgba(108,92,231,0.35)',
            }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>Overall attendance</div>
              <div style={{ fontSize: 40, fontWeight: 800, marginTop: 2 }}>
                {overallPercent === null ? '—' : `${overallPercent.toFixed(1)}%`}
              </div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
                {overallAttended} attended / {overallTotal} total across {subjects.length} subject{subjects.length === 1 ? '' : 's'}
              </div>
            </div>

            {sortedSubjects.length === 0 && (
              <p style={{ color: '#888', textAlign: 'center', margin: '30px 0' }}>No subjects yet — add one below 👇</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sortedSubjects.map((s) => {
                const stats = getStats(s.attendance, target);
                const color = colorForPercent(stats.percent, target);
                return (
                  <div
                    key={s.id}
                    className="card subj-row"
                    onClick={() => setSelectedId(s.id)}
                    style={{
                      background: '#fff', borderRadius: 14, padding: 14,
                      border: `2px solid ${color}`, display: 'flex', alignItems: 'center', gap: 14,
                      boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                    }}
                  >
                    <ProgressRing percent={stats.percent} color={color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 15 }}>{s.name}</strong>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 3 }}>
                        {stats.attended} attended · {stats.missed} missed
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 2 }}>{stats.message}</div>
                    </div>
                    <button
                      className="btn"
                      onClick={(e) => { e.stopPropagation(); deleteSubject(s.id); }}
                      style={{ background: 'none', color: '#ccc', fontSize: 16, padding: 4 }}
                      aria-label={`Delete ${s.name}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <input
                type="text" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="Subject name, e.g. Physics"
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd' }}
                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
              />
              <button className="btn" onClick={addSubject} style={{
                padding: '0 20px', borderRadius: 10, color: '#fff', fontWeight: 600,
                background: 'linear-gradient(135deg, #6C5CE7, #00B4D8)',
              }}>
                Add
              </button>
            </div>
          </>
        ) : (
          <SubjectDetail
            subject={selected}
            target={target}
            onBack={() => setSelectedId(null)}
            onDelete={() => deleteSubject(selected.id)}
            onToggleDate={(key) => toggleDate(selected.id, key)}
          />
        )}
      </div>
    </div>
  );
}

function CenteredMessage({ text }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #F5F3FF 0%, #E0F7FA 50%, #FFF0F6 100%)',
      fontFamily: "'Poppins', sans-serif", color: '#666',
    }}>
      {text}
    </div>
  );
}

function SubjectDetail({ subject, target, onBack, onDelete, onToggleDate }) {
  const stats = getStats(subject.attendance, target);
  const color = colorForPercent(stats.percent, target);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else { setViewMonth(viewMonth - 1); }
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else { setViewMonth(viewMonth + 1); }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const STATUS_COLOR = { present: '#22C55E', absent: '#EF4444', off: '#94A3B8' };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button className="btn" onClick={onBack} style={{ background: 'none', color: '#6C5CE7', fontWeight: 600, fontSize: 14, padding: 0 }}>
          ← Back
        </button>
        <button className="btn" onClick={onDelete} style={{ background: 'none', color: '#EF4444', fontSize: 13, padding: 0 }}>
          Delete subject
        </button>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 14px' }}>{subject.name}</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', borderRadius: 16, padding: 18, border: `2px solid ${color}` }}>
        <ProgressRing percent={stats.percent} color={color} size={72} strokeWidth={7} />
        <div>
          <div style={{ fontSize: 13, color: '#666' }}>{stats.attended} attended · {stats.missed} missed</div>
          <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 4 }}>{stats.message}</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 16, fontSize: 12, color: '#666' }}>
        <LegendDot color="#22C55E" label="Present" />
        <LegendDot color="#EF4444" label="Absent" />
        <LegendDot color="#94A3B8" label="Off-day" />
      </div>

      {/* Calendar */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginTop: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button className="btn" onClick={prevMonth} style={{ background: 'none', fontSize: 16, color: '#6C5CE7' }}>‹</button>
          <strong style={{ fontSize: 14 }}>{MONTH_NAMES[viewMonth]} {viewYear}</strong>
          <button className="btn" onClick={nextMonth} style={{ background: 'none', fontSize: 16, color: '#6C5CE7' }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 11, color: '#999', marginBottom: 4 }}>
          {WEEKDAYS.map((d) => <div key={d} style={{ textAlign: 'center' }}>{d}</div>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const key = dateKey(viewYear, viewMonth, day);
            const status = subject.attendance[key];
            const isToday = key === todayKey();
            return (
              <div
                key={i}
                className="day-cell"
                onClick={() => onToggleDate(key)}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: status ? STATUS_COLOR[status] : '#F3F3F7',
                  color: status ? '#fff' : '#555',
                  border: isToday ? '2px solid #6C5CE7' : 'none',
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 10 }}>
        Tap a date to cycle: Present → Absent → Off-day → clear
      </p>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </div>
  );
}