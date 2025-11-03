import { SignedIn, SignedOut, SignIn, useUser } from "@clerk/clerk-react";

export function Authed({ children }: { children: React.ReactNode }) {
  return <SignedIn>{children}</SignedIn>;
}

export function Unauthed() {
  return (
    <SignedOut>
      <div className="mx-auto max-w-md p-6 flex flex-col items-center justify-center min-h-screen">
        <SignIn routing="hash" signUpUrl="#/sign-up" />
      </div>
    </SignedOut>
  );
}

export function UserHeader() {
  const { user } = useUser();
  return (
    <div className="text-xs text-[var(--muted)]">
      {user?.primaryEmailAddress?.emailAddress}
    </div>
  );
}

