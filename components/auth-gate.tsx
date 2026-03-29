"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import {
  isNetlifyAuthSkipped,
  logoutAndReload,
  openNetlifyLogin,
  openNetlifyRecover,
  setupNetlifyIdentity,
} from "@/lib/identity";

type GatePhase = "loading" | "signedOut" | "signedIn";

function BootstrapScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07090c] font-mono text-sm text-zinc-600">
      …
    </div>
  );
}

function LoginScreen({
  errorMessage,
  onDismissError,
}: {
  errorMessage: string | null;
  onDismissError: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#07090c] px-4 pb-16 font-mono text-sm text-zinc-400">
      <p className="max-w-md text-center text-zinc-500">
        Inicia sesión para ver el panel
      </p>
      <div className="max-w-md space-y-2 text-center text-[11px] leading-relaxed text-zinc-600">
        <p>
          Si <strong className="font-medium text-zinc-500">ya confirmaste el correo</strong>, pulsa
          «Iniciar sesión» e introduce el <strong className="font-medium text-zinc-500">mismo email y
          contraseña</strong> que registraste (el enlace del correo solo confirma la cuenta).
        </p>
        <p>
          Si en Netlify tienes <strong className="font-medium text-zinc-500">solo invitaciones</strong>,
          un admin debe invitarte en{" "}
          <span className="text-zinc-500">Identity → Invite users</span>; registrarte solo desde el
          formulario puede no bastar.
        </p>
        <p>Usa siempre la URL <strong className="text-zinc-500">https://</strong> del sitio (no http).</p>
      </div>
      {errorMessage ? (
        <div
          role="alert"
          className="max-w-md rounded border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-left text-[11px] text-rose-200/95"
        >
          <p className="font-medium text-rose-100">No se pudo completar el acceso</p>
          <p className="mt-1 wrap-break-word text-rose-200/90">{errorMessage}</p>
          <button
            type="button"
            className="mt-2 text-[10px] text-rose-300 underline-offset-2 hover:underline"
            onClick={onDismissError}
          >
            Cerrar aviso
          </button>
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
        <button
          type="button"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
          onClick={() => {
            onDismissError();
            openNetlifyLogin();
          }}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-400 hover:underline"
          onClick={() => {
            onDismissError();
            openNetlifyRecover();
          }}
        >
          Olvidé mi contraseña
        </button>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const skip = isNetlifyAuthSkipped();
  const [phase, setPhase] = useState<GatePhase>(skip ? "signedIn" : "loading");
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    if (skip) return;

    const connect = () => {
      if (typeof window === "undefined" || !window.netlifyIdentity) return false;
      setupNetlifyIdentity({
        onUser: (user) => {
          setPhase(user ? "signedIn" : "signedOut");
          if (user) setIdentityError(null);
        },
        onError: (message) => {
          setIdentityError(message);
          setPhase("signedOut");
        },
      });
      return true;
    };

    if (connect()) return;

    const poll = window.setInterval(() => {
      if (connect()) window.clearInterval(poll);
    }, 50);

    const timeout = window.setTimeout(() => window.clearInterval(poll), 15_000);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [skip]);

  if (skip) {
    return <>{children}</>;
  }

  return (
    <>
      <Script
        src="https://identity.netlify.com/v1/netlify-identity-widget.js"
        strategy="afterInteractive"
      />
      {phase === "loading" ? <BootstrapScreen /> : null}
      {phase === "signedOut" ? (
        <LoginScreen
          errorMessage={identityError}
          onDismissError={() => setIdentityError(null)}
        />
      ) : null}
      {phase === "signedIn" ? (
        <>
          <div className="pointer-events-auto fixed z-100 max-sm:left-3 max-sm:right-auto max-sm:top-[max(0.75rem,env(safe-area-inset-top))] sm:right-[max(0.75rem,env(safe-area-inset-right))] sm:top-3">
            <button
              type="button"
              className="touch-manipulation text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              onClick={() => logoutAndReload()}
            >
              Cerrar sesión
            </button>
          </div>
          {children}
        </>
      ) : null}
    </>
  );
}
