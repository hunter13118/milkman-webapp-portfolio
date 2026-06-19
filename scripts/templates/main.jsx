import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { ErrorBoundary } from "./lib/ErrorBoundary.jsx";
import { PortfolioClerkProvider } from "./lib/portfolioClerk.jsx";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <PortfolioClerkProvider publishableKey={publishableKey}>
        <App />
      </PortfolioClerkProvider>
    </ErrorBoundary>
  </StrictMode>,
);
