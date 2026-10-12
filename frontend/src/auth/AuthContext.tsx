import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin, SESSION_EXPIRED, tokens, type Identity, type Role } from '../api/client';

/* Accounts are institution-issued: no sign-up, no self-serve register, and
   password reset goes through teacher/IT rather than an email flow.
   See design/CLAUDE.md.

   Neither role nor email is ever asked for — both arrive from /api/token/ and
   are claims on the token. The login screen has no role picker by design. */

export type { Role };

interface AuthState {
  authed: boolean;
  role: Role | null;
  email: string | null;
  signIn: (username: string, password: string) => Promise<Identity>;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

const ROLE_KEY = 'stemma.role';
const EMAIL_KEY = 'stemma.email';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => tokens.access !== null);
  const [role, setRole] = useState<Role | null>(
    () => localStorage.getItem(ROLE_KEY) as Role | null,
  );
  const [email, setEmail] = useState<string | null>(
    () => localStorage.getItem(EMAIL_KEY),
  );

  /* The transport has already cleared the tokens by the time this fires; this
     drops the rest of the identity so Require redirects to /login. */
  useEffect(() => {
    function expire() {
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(EMAIL_KEY);
      setRole(null);
      setEmail(null);
      setAuthed(false);
    }
    window.addEventListener(SESSION_EXPIRED, expire);
    return () => window.removeEventListener(SESSION_EXPIRED, expire);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      authed,
      role,
      email,
      async signIn(username, password) {
        const id = await apiLogin(username, password);
        localStorage.setItem(ROLE_KEY, id.role);
        localStorage.setItem(EMAIL_KEY, id.email);
        setRole(id.role);
        setEmail(id.email);
        setAuthed(true);
        return id;
      },
      signOut() {
        tokens.clear();
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(EMAIL_KEY);
        setRole(null);
        setEmail(null);
        setAuthed(false);
      },
    }),
    [authed, role, email],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
