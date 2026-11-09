'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Logo from '@/components/Logo';
import { Button, FieldLabel, Input } from '@/components/ui';
import { API_URL, session } from '@/lib/api';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile.role === 'AGENT') throw new Error('The console is for managers. Agents use the TheTracker mobile app.');
      session.set(data);
      router.replace('/');
    } catch (err) {
      setError(err instanceof TypeError ? 'Cannot reach the server.' : (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6">
        <Logo />
        <div><h1 className="text-xl font-bold">Manager console</h1><p className="text-sm text-ink-3">Sign in to see your field team.</p></div>
        <FieldLabel text="Email"><Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></FieldLabel>
        <FieldLabel text="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></FieldLabel>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button busy={busy} className="w-full">Sign in</Button>
      </form>
    </main>
  );
}
