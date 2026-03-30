import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isClerkAuthSkipped } from "@/lib/auth-env";

export default function AccessDeniedPage() {
  if (isClerkAuthSkipped()) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#07090c] px-4 pb-16 text-center">
      <h1 className="text-lg font-medium text-zinc-200">Acceso no autorizado</h1>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
        Esta aplicación solo admite la cuenta <span className="text-zinc-400">me@joanarbo.com</span>.
        Cierra sesión e inicia con esa cuenta, o contacta al administrador.
      </p>
      <SignOutButton>
        <button
          type="button"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
        >
          Cerrar sesión
        </button>
      </SignOutButton>
    </div>
  );
}
