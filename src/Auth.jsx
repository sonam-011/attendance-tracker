import React, { useState } from 'react';
import { auth } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';

export default function Auth() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // No need to redirect manually — App.jsx listens for auth state changes
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #F5F3FF 0%, #E0F7FA 50%, #FFF0F6 100%)',
      fontFamily: "'Poppins', 'Segoe UI', sans-serif", padding: 16,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 360,
        boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{
          fontSize: 24, fontWeight: 800, margin: '0 0 6px',
          background: 'linear-gradient(135deg, #6C5CE7, #00B4D8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          My Attendance
        </h1>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>
          {mode === 'login' ? 'Log in to see your data' : 'Create an account to get started'}
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #ddd', marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          minLength={6}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #ddd', marginBottom: 10 }}
        />

        {error && <p style={{ color: '#EF4444', fontSize: 13, margin: '4px 0 10px' }}>{error}</p>}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', color: '#fff',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
            background: 'linear-gradient(135deg, #6C5CE7, #00B4D8)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 14 }}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <span
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            style={{ color: '#6C5CE7', fontWeight: 600, cursor: 'pointer' }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </span>
        </p>
      </form>
    </div>
  );
}