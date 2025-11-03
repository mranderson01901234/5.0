import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

export default function TopBar(){
  return (
    <header className="fixed left-[48px] right-0 top-0 z-50 flex h-16 items-center justify-end px-6">
      <div className="flex items-center gap-3">
        <SignedOut>
          {/* Sign in/up handled by Unauthed component in App.tsx */}
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}

