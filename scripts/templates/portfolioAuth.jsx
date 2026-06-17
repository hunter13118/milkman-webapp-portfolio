import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";

export const AUTH_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/";

export function AuthGate({ title, tagline, children }) {
  if (!AUTH_ENABLED) return children;

  return (
    <>
      <SignedOut>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            background: "radial-gradient(circle at top, #1e293b, #020617)",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{title}</h1>
            {tagline ? (
              <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>{tagline}</p>
            ) : null}
            <SignInButton mode="modal" forceRedirectUrl={base} signUpForceRedirectUrl={base}>
              <button
                type="button"
                style={{
                  padding: "0.65rem 1.25rem",
                  borderRadius: 8,
                  border: "none",
                  background: "#6366f1",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <div style={{ position: "fixed", top: 12, right: 12, zIndex: 9999 }}>
          <UserButton afterSignOutUrl={base} />
        </div>
        {children}
      </SignedIn>
    </>
  );
}
