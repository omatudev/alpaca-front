import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const GOOGLE_CLIENT_ID =
  "879038766799-lihogd5k6ed49n9gbv29min1mftfp78h.apps.googleusercontent.com";

interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: () => void;
          renderButton: (
            element: HTMLElement,
            config: Record<string, unknown>,
          ) => void;
          revoke: (email: string, callback: () => void) => void;
        };
      };
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem("jwt_token");
    const savedUser = localStorage.getItem("auth_user");
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("jwt_token");
        localStorage.removeItem("auth_user");
      }
    }
    setLoading(false);
  }, []);

  // Load Google Identity Services script
  useEffect(() => {
    if (document.getElementById("google-gis-script")) return;
    const script = document.createElement("script");
    script.id = "google-gis-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        const res = await fetch(`${backendUrl}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: response.credential }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("Auth failed:", err);
          return;
        }

        const data = await res.json();
        const authUser = {
          email: data.email,
          name: data.name,
          picture: data.picture,
        };
        setToken(data.token);
        setUser(authUser);
        localStorage.setItem("jwt_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(authUser));
      } catch (err) {
        console.error("Auth error:", err);
      }
    },
    [],
  );

  // Initialize Google Sign-In when script loads
  useEffect(() => {
    const initGoogle = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: true,
      });
    };

    if (window.google?.accounts) {
      initGoogle();
      return;
    }

    const script = document.getElementById("google-gis-script");
    if (script) {
      script.addEventListener("load", initGoogle);
      return () => script.removeEventListener("load", initGoogle);
    }
  }, [handleCredentialResponse]);

  const signIn = useCallback(() => {
    window.google?.accounts.id.prompt();
  }, []);

  const signOut = useCallback(() => {
    const email = user?.email;
    setUser(null);
    setToken(null);
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("auth_user");
    if (email) {
      window.google?.accounts.id.revoke(email, () => {});
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
