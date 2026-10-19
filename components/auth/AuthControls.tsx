"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { buttonClasses } from "@/components/ui/Button";

/** Sign-in or the account menu. Render only when Clerk is enabled. */
export function AuthControls({ block = false }: { block?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span aria-hidden="true" className="inline-block h-8 w-8" />;
  if (isSignedIn) return <UserButton />;
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className={buttonClasses({
          variant: "ghost",
          size: "sm",
          className: block ? "w-full" : undefined,
        })}
      >
        Sign in
      </button>
    </SignInButton>
  );
}
