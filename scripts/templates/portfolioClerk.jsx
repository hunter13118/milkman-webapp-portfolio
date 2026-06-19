import { ClerkProvider } from "@clerk/clerk-react";
import { clerkAfterAuthUrl } from "./portfolioAuth.jsx";

/**
 * Shared Clerk shell for /projects/* embeds.
 * Absolute redirect URLs + satelliteAutoSync=false avoid iOS handshake blank screens.
 */
export function PortfolioClerkProvider({ publishableKey, children }) {
  if (!publishableKey) return children;

  const authUrl = clerkAfterAuthUrl();

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl={authUrl}
      signInFallbackRedirectUrl={authUrl}
      signUpFallbackRedirectUrl={authUrl}
      satelliteAutoSync={false}
    >
      {children}
    </ClerkProvider>
  );
}
