"use client";

import { UserButton } from "@clerk/nextjs";
import { isClerkAuthSkipped } from "@/lib/auth-env";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const skip = isClerkAuthSkipped();

  if (skip) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="pointer-events-auto fixed z-100 max-sm:left-3 max-sm:right-auto max-sm:top-[max(0.75rem,env(safe-area-inset-top))] sm:right-[max(0.75rem,env(safe-area-inset-right))] sm:top-3">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "h-8 w-8",
            },
          }}
        />
      </div>
      {children}
    </>
  );
}
