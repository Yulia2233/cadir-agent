import { Box, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { apiRequest, ApiError, setCsrfToken } from '../api/client';
import type { UserProfile } from '../types';

type SessionResponse = {
  user: UserProfile;
  csrfToken: string;
};

export function AuthScreen({
  bootstrap,
  onAuthenticated,
}: {
  bootstrap: boolean;
  onAuthenticated: (user: UserProfile) => void;
}) {
  const [displayName, setDisplayName] = useState('CADIR Administrator');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiRequest<SessionResponse>(
        bootstrap ? '/api/auth/bootstrap' : '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            ...(bootstrap ? { displayName } : {}),
            email,
            password,
          }),
        },
      );
      setCsrfToken(response.csrfToken);
      onAuthenticated(response.user);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Authentication could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <Box size={26} aria-hidden="true" />
          <span>CADIR Agent</span>
        </div>
        <h1 id="auth-title">{bootstrap ? 'Create the first administrator' : 'Sign in'}</h1>
        <p>
          {bootstrap
            ? 'This one-time setup closes as soon as the administrator is created.'
            : 'Use your CADIR account to open the modeling workspace.'}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          {bootstrap && (
            <label>
              Display name
              <input
                autoComplete="name"
                maxLength={100}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={bootstrap ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={512}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error !== null && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary-command" disabled={busy} type="submit">
            <LogIn size={17} aria-hidden="true" />
            {busy ? 'Please wait' : bootstrap ? 'Create administrator' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
