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
  /* On a teacher-issued password: every route sends this account to /password
     until it chooses its own. */
  mustChangePassword: boolean;
  signIn: (username: string, password: string) => Promise<Identity>;
  signOut: () => void;
  passwordChanged: () => void;
}

const Ctx = createContext<AuthState | null>(null);

const ROLE_KEY = 'stemma.role';
const EMAIL_KEY = 'stemma.email';
const MUST_CHANGE_KEY = 'stemma.mustChangePassword';

function forget() {
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(MUST_CHANGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => tokens.access !== null);
  const [role, setRole] = useState<Role | null>(
    () => localStorage.getItem(ROLE_KEY) as Role | null,
  );
  const [email, setEmail] = useState<string | null>(
    () => localStorage.getItem(EMAIL_KEY),
  );
  const [mustChangePassword, setMustChange] = useState(
    () => localStorage.getItem(MUST_CHANGE_KEY) === '1',
  );

  /* The transport has already cleared the tokens by the time this fires; this
     drops the rest of the identity so Require redirects to /login. */
  useEffect(() => {
    function expire() {
      forget();
      setRole(null);
      setEmail(null);
      setMustChange(false);
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
      mustChangePassword,
      async signIn(username, password) {
        const id = await apiLogin(username, password);
        localStorage.setItem(ROLE_KEY, id.role);
        localStorage.setItem(EMAIL_KEY, id.email);
        if (id.mustChangePassword) localStorage.setItem(MUST_CHANGE_KEY, '1');
        else localStorage.removeItem(MUST_CHANGE_KEY);
        setRole(id.role);
        setEmail(id.email);
        setMustChange(id.mustChangePassword);
        setAuthed(true);
        return id;
      },
      signOut() {
        tokens.clear();
        forget();
        setRole(null);
        setEmail(null);
        setMustChange(false);
        setAuthed(false);
      },
      passwordChanged() {
        localStorage.removeItem(MUST_CHANGE_KEY);
        setMustChange(false);
      },
    }),
    [authed, role, email, mustChangePassword],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
