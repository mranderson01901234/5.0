import React from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { Menu } from 'lucide-react';

interface MobileHeaderProps {
  onMenuClick: () => void;
  title?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onMenuClick, title = 'Chat' }) => {
  return (
    <header className="m-topbar">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="m-title text-base font-semibold">{title}</div>
      </div>

      <div className="flex items-center gap-2">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="text-xs px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="text-xs px-3 py-1.5 bg-[#7c5cff] rounded-lg hover:bg-[#6a4dd9] transition-colors">
              Sign up
            </button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
              },
            }}
          />
        </SignedIn>
      </div>
    </header>
  );
};
