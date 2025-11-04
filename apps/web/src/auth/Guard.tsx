import { SignedIn, SignedOut, useUser, SignInButton, SignUpButton } from "@clerk/clerk-react";
import { BrowserRouter } from "react-router-dom";
import MainChatLayout from "@/layouts/MainChatLayout";

export function Authed({ children }: { children: React.ReactNode }) {
  return <SignedIn>{children}</SignedIn>;
}

export function Unauthed() {
  return (
    <SignedOut>
      <BrowserRouter>
        <MainChatLayout />
        {/* Auth buttons in top right of header */}
        <div className="fixed right-6 top-0 h-16 flex items-center gap-3 z-[10001]">
          <SignInButton mode="modal">
            <button className="px-6 py-2.5 rounded-lg bg-white text-black font-medium text-sm transition-all duration-150 hover:bg-white/90">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="px-6 py-2.5 rounded-lg bg-white/10 text-white font-medium text-sm transition-all duration-150 hover:bg-white/15 border border-white/20">
              Start for free
            </button>
          </SignUpButton>
        </div>
      </BrowserRouter>
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

