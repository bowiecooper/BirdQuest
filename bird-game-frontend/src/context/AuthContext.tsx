import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';

interface SignUpArgs {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the initial session has been resolved. */
  loading: boolean;
  /** Returns true if a session was established immediately (email confirmation off). */
  signUp: (args: SignUpArgs) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async ({ email, password, username, displayName }: SignUpArgs) => {
    // username / display_name land in raw_user_meta_data, which the
    // handle_new_user() trigger reads to create the public.profiles row.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: displayName ?? null } },
    });
    if (error) throw error;
    return { needsEmailConfirmation: data.session === null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
