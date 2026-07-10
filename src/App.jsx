import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Auth from './Auth';

const DEFAULT_TARGET = 75;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function colorForPercent(percent, target) {
  if (percent === null) return '#B0B0C3';
  if (percent >= target) return '#22C55E';
  if (percent >= target - 15) return '#F59E0B';
  return '#EF4444';
}

function getStats(subject, target) {
  const total = subject.records.length;
  const attended = subject.records.filter((r) => r.status === 'attended').length;
  if (total === 0) return { attended, total, percent: null, message: 'No classes recorded yet' };
  const percent = (attended / total) * 100;
  const t = target / 100;
  if (percent >= target) {
    const canSkip = Math.floor(attended / t - total);
    return {
      attended, total, percent,
      message: canSkip > 0
        ? `You can skip ${canSkip} more and stay at ${target}%+`
        : `Right at ${target}% — skipping now drops you below`,
    };
  } else {
    const needed = Math.max(0, Math.ceil((t * total - attended) / (1 - t)));
    return { attended, total, percent, message: `Attend the next ${needed} in a row to reach ${target}%` };
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [subjects, setSubjects] = useState([]);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState('');

  // Watch login state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Load this user's data once they're logged in
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
        } else {
          setSubjects([]);
          setTarget(DEFAULT_TARGET);
        }
      } finally {
        setDataLoading(false);
      }
    })();
  }, [user]);

  // Save current subjects + target to Firestore
  async function saveData(newSubjects, newTarget) {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), { subjects: newSubjects, target: newTarget }, { merge: true });
  }

  const selected = subjects.find((s) => s.id === selectedId) || null;

  function addSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    const updated = [...subjects, { id: Date.now().toString(), name, records: [] }];
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

  function addRecord(subjectId, status) {
    const record = { id: Date.now().toString(), date: new Date().toISOString(), status };
    const updated = subjects.map((s) =>
      s.id === subjectId ? { ...s, records: [...s.records, record] } : s
    );
    setSubjects(updated);
    saveData(updated, target);
  }

  function undoLast(subjectId) {
    const updated = subjects.map((s) =>
      s.id === subjectId ? { ...s, records: s.records.slice(0, -1) } : s
    );
    setSubjects(updated);
    saveData(updated, target);
  }

  function deleteRecord(subjectId, recordId) {
    const updated = subjects.map((s) =>
      s.id === subjectId ? { ...s, records: s.records.filter((r) => r.id !== recordId) } : s
    );
    setSubjects(updated);
    saveData(updated, target);
  }

  function changeTarget(newTarget) {
    setTarget(newTarget);
    saveData(subjects, newTarget);
  }

  // ---------- Auth gate ----------
  if (authLoading) return <CenteredMessage text="Loading…" />;
  if (!user) return <Auth />;
  if (dataLoading) return <CenteredMessage text="Fetching your data…" />;

  const overallTotal = subjects.reduce((sum, s) => sum + s.records.length, 0);
  const overallAttended = subjects.reduce(
    (sum, s) => sum + s.records.filter((r) => r.status === 'attended').length, 0
  );
  const overallPercent = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : null;

  const sortedSubjects = [...subjects].sort((a, b) => {
    const pa = getStats(a, target).percent;
    const pb = getStats(b, target).percent;
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
        .bar-fill { transition: width 0.5s ease, background 0.5s ease; }
        .btn { transition: transform 0.12s ease, box-shadow 0.12s ease; border: none; cursor: pointer; }
        .btn:hover { transform: translateY(-2px); }
        .btn:active { transform: scale(0.97); }
        .subj-row { transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
        .subj-row:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(108,92,231,0.15); }
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
              <button
                className="btn"
                onClick={() => signOut(auth)}
                style={{ background: 'none', color: '#999', fontSize: 13, marginTop: 6 }}
              >
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
                {overallAttended} attended / {overallTotal} total classes across {subjects.length} subject{subjects.length === 1 ? '' : 's'}
              </div>
            </div>

            {sortedSubjects.length === 0 && (
              <p style={{ color: '#888', textAlign: 'center', margin: '30px 0' }}>
                No subjects yet — add your first one below 👇
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sortedSubjects.map((s) => {
                const stats = getStats(s, target);
                const color = colorForPercent(stats.percent, target);
                const pct = stats.percent ?? 0;
                return (
                  <div
                    key={s.id}
                    className="card subj-row"
                    onClick={() => setSelectedId(s.id)}
                    style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong style={{ fontSize: 15 }}>{s.name}</strong>
                      <span style={{ fontWeight: 700, color }}>
                        {stats.percent === null ? '—' : `${stats.percent.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ height: 8, background: '#F0F0F5', borderRadius: 6, overflow: 'hidden' }}>
                      <div className="bar-fill" style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6 }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                      {stats.attended}/{stats.total} classes
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="Subject name, e.g. Physics"
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd' }}
                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
              />
              <button
                className="btn" onClick={addSubject}
                style={{ padding: '0 20px', borderRadius: 10, color: '#fff', fontWeight: 600, background: 'linear-gradient(135deg, #6C5CE7, #00B4D8)' }}
              >
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
            onAttend={() => addRecord(selected.id, 'attended')}
            onSkip={() => addRecord(selected.id, 'skipped')}
            onUndo={() => undoLast(selected.id)}
            onDeleteRecord={(rid) => deleteRecord(selected.id, rid)}
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

function SubjectDetail({ subject, target, onBack, onDelete, onAttend, onSkip, onUndo, onDeleteRecord }) {
  const stats = getStats(subject, target);
  const color = colorForPercent(stats.percent, target);
  const pct = stats.percent ?? 0;
  const historyDesc = [...subject.records].reverse();

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

      <div style={{
        borderRadius: 18, padding: 22, textAlign: 'center', color: '#fff',
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
        boxShadow: `0 12px 26px ${color}55`,
      }}>
        <div style={{ fontSize: 42, fontWeight: 800 }}>
          {stats.percent === null ? '—' : `${stats.percent.toFixed(1)}%`}
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
          {stats.attended} attended / {stats.total} total
        </div>
        <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.25)', height: 8, borderRadius: 6, overflow: 'hidden' }}>
          <div className="bar-fill" style={{ height: '100%', width: `${pct}%`, background: '#fff', borderRadius: 6 }} />
        </div>
        <div style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>{stats.message}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn" onClick={onAttend} style={{
          flex: 1, padding: '14px 0', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15,
          background: 'linear-gradient(135deg, #22C55E, #16A34A)', boxShadow: '0 8px 18px rgba(34,197,94,0.35)',
        }}>
          ✓ I attended
        </button>
        <button className="btn" onClick={onSkip} style={{
          flex: 1, padding: '14px 0', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15,
          background: 'linear-gradient(135deg, #EF4444, #F59E0B)', boxShadow: '0 8px 18px rgba(239,68,68,0.35)',
        }}>
          ✕ I skipped
        </button>
      </div>

      <button className="btn" onClick={onUndo} style={{
        marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 10,
        background: '#fff', border: '1px solid #ddd', color: '#666', fontWeight: 500,
      }}>
        Undo last entry
      </button>

      <h3 style={{ fontSize: 15, marginTop: 26, marginBottom: 10, color: '#444' }}>History</h3>
      {historyDesc.length === 0 ? (
        <p style={{ color: '#999', fontSize: 13 }}>No entries yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {historyDesc.map((r) => (
            <div key={r.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#fff', borderRadius: 10, padding: '10px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            }}>
              <span style={{ fontSize: 13, color: '#555' }}>{formatDate(r.date)}</span>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                color: r.status === 'attended' ? '#16A34A' : '#DC2626',
                background: r.status === 'attended' ? '#DCFCE7' : '#FEE2E2',
              }}>
                {r.status === 'attended' ? 'Attended' : 'Skipped'}
              </span>
              <button className="btn" onClick={() => onDeleteRecord(r.id)} style={{ background: 'none', color: '#bbb', fontSize: 13, padding: '0 4px' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}