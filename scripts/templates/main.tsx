import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import { ErrorBoundary } from "./lib/ErrorBoundary.jsx";
import { PortfolioClerkProvider } from "./lib/portfolioClerk.jsx";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PortfolioClerkProvider publishableKey={publishableKey}>
        <App />
      </PortfolioClerkProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
