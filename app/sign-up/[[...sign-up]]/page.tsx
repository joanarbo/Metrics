import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isClerkAuthSkipped } from "@/lib/auth-env";

export default function SignUpPage() {
  if (isClerkAuthSkipped()) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07090c] px-4 py-8">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        appearance={{
          variables: {
            colorPrimary: "#a1a1aa",
            colorBackground: "#18181b",
            colorInputBackground: "#09090b",
            colorInputText: "#fafafa",
          },
        }}
      />
    </div>
  );
}
