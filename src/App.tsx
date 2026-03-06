import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Dashboard from "./pages/Dashboard";
import TestConsole from "./pages/TestConsole";
import { useAuth } from "./hooks/useAuth";

function LoginScreen() {
  const { signIn } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);

  // Poll until window.google is available, then render the button
  useEffect(() => {
    if (window.google?.accounts) {
      setGisReady(true);
      return;
    }
    const id = setInterval(() => {
      if (window.google?.accounts) {
        setGisReady(true);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!gisReady || !btnRef.current) return;
    window.google!.accounts.id.renderButton(btnRef.current, {
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: "signin_with",
    });
  }, [gisReady]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 gap-6">
      <div className="text-white text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Broker</h1>
        <p className="text-neutral-400 text-sm">Inicia sesión para continuar</p>
      </div>

      {/* Google rendered button — visible once GIS loads */}
      <div ref={btnRef} style={{ minHeight: 44 }} />

      {/* Fallback if GIS never loads */}
      {!gisReady && (
        <button
          onClick={signIn}
          className="px-6 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors"
        >
          Iniciar sesión con Google
        </button>
      )}
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/test" element={<TestConsole />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
      <SpeedInsights />
    </BrowserRouter>
  );
}
