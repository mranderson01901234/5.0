import { ClerkProvider } from "@clerk/clerk-react";
import { log } from "@/utils/logger";
import { getEnv } from "@/utils/env";

const { VITE_CLERK_PUBLISHABLE_KEY: pk } = getEnv();

const clerkAppearance = {
  baseTheme: "dark",
  variables: {
    colorPrimary: "#ffffff",
    colorBackground: "#0f0f0f",
    colorInputBackground: "#1a1a1a",
    colorInputText: "#ffffff",
    colorText: "#ffffff",
    colorTextSecondary: "#ffffff",
    borderRadius: "8px",
  },
  elements: {
    formButtonPrimary: "bg-white text-black hover:bg-white/90",
    card: "bg-[#0f0f0f] border border-white/10",
    headerTitle: "text-white",
    headerSubtitle: "text-white",
    headerTitleText: "text-white",
    headerSubtitleText: "text-white",
    socialButtonsBlockButton: "bg-[#1a1a1a] border border-white/10 text-white hover:bg-[#252525]",
    socialButtonsBlockButtonText: "text-white",
    formFieldInput: "bg-[#1a1a1a] text-white border-white/10",
    formFieldLabel: "text-white",
    formFieldLabelText: "text-white",
    formFieldSuccessText: "text-white",
    formFieldErrorText: "text-white",
    formFieldWarningText: "text-white",
    footerActionLink: "text-white hover:text-white/80",
    footerActionText: "text-white",
    identityPreviewText: "text-white",
    identityPreviewEditButton: "text-white hover:text-white/80",
    formResendCodeLink: "text-white hover:text-white/80",
    otpCodeFieldInput: "bg-[#1a1a1a] text-white border-white/10",
    alertText: "text-white",
    cardTitle: "text-white",
    cardSubtitle: "text-white",
    dividerLine: "bg-white/10",
    dividerText: "text-white",
    formButtonReset: "text-white hover:text-white/80",
    alternativeMethodsBlockButton: "text-white hover:text-white/80",
    alternativeMethodsBlockButtonText: "text-white",
    formFieldInputShowPasswordButton: "text-white",
    formFieldInputShowPasswordIcon: "text-white",
    // UserButton dropdown menu styling
    userButtonPopoverCard: "bg-[#0f0f0f] border border-white/10",
    userButtonPopoverActions: "text-white",
    userButtonPopoverActionButton: "text-white hover:bg-white/10",
    userButtonPopoverActionButtonText: "text-white",
    userButtonPopoverActionButtonIcon: "text-white",
    userButtonPopoverFooter: "text-white",
    userButtonPopoverMain: "text-white",
    userButtonPopoverMainIdentifier: "text-white",
    userButtonTrigger: "text-white",
    userButtonBox: "text-white",
    userButtonOuterIdentifier: "text-white",
    userPreview: "text-white",
    userPreviewTextContainer: "text-white",
    userPreviewMainIdentifier: "text-white",
    userPreviewSecondaryIdentifier: "text-white/70",
    menuButton: "text-white hover:bg-white/10",
    menuButtonText: "text-white",
    menuItem: "text-white hover:bg-white/10",
    menuItemText: "text-white",
    menuItemIcon: "text-white",
    clerkBox: "text-white",
    actionsRowButton: "text-white hover:bg-white/10",
    actionsRowButtonText: "text-white",
    badge: "text-white",
    badgeText: "text-white",
  },
};

export function WithClerk({ children }: { children: React.ReactNode }) {
  // pk is validated by getEnv() at startup, but this check provides a safety fallback
  if (!pk || pk.trim() === '') {
    log.warn("Missing VITE_CLERK_PUBLISHABLE_KEY; rendering without auth.");
    return <>{children}</>;
  }
  return (
    <ClerkProvider 
      publishableKey={pk} 
      appearance={clerkAppearance as any}
    >
      {children}
    </ClerkProvider>
  );
}

