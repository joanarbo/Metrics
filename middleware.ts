import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkAuthSkipped } from "@/lib/auth-env";
import { isAllowedClerkEmail } from "@/lib/clerk-allowlist";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-denied(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isClerkAuthSkipped()) {
    return;
  }

  if (isPublicRoute(req)) {
    return;
  }

  await auth.protect();

  const { userId } = await auth();
  if (!userId) {
    return;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  )?.emailAddress;

  if (!isAllowedClerkEmail(primary)) {
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
