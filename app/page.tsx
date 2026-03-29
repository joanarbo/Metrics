import { Suspense } from "react";
import { HomePageClient } from "./home-page-client";

export const dynamic = "force-dynamic";

function HomeFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#07090c] font-mono text-sm text-zinc-600">
      …
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomePageClient />
    </Suspense>
  );
}
