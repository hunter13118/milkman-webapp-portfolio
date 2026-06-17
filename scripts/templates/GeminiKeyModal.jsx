import { useState } from "react";
import { geminiCapabilityMode, setByokGeminiKey } from "./geminiCapability.js";

export default function GeminiKeyModal({ open, onClose, onSaved, isTrusted }) {
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        background: "rgba(2,6,23,0.85)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#0f172a",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 12,
          padding: "1.25rem",
          color: "#e2e8f0",
        }}
      >
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Connect Gemini</h2>
        {isTrusted ? (
          <p style={{ color: "#86efac", fontSize: "0.85rem" }}>
            Trusted access — live Gemini runs via the server key. A personal key is optional.
          </p>
        ) : (
          <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Paste your Gemini API key for this session. Stored in sessionStorage only — proxied through
            the edge, never bundled in the app.
          </p>
        )}
        <input
          type={show ? "text" : "password"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="AIza…"
          style={{
            width: "100%",
            marginTop: "0.75rem",
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#020617",
            color: "#f8fafc",
            fontFamily: "monospace",
          }}
        />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          {geminiCapabilityMode() === "byok" && (
            <button
              type="button"
              onClick={() => {
                setByokGeminiKey(null);
                onSaved?.();
                onClose();
              }}
              style={btnSecondary}
            >
              Clear key
            </button>
          )}
          <button
            type="button"
            disabled={!val.trim()}
            onClick={() => {
              setByokGeminiKey(val.trim());
              onSaved?.();
              onClose();
            }}
            style={btnPrimary}
          >
            Use key
          </button>
        </div>
      </div>
    </div>
  );
}

const btnPrimary = {
  padding: "0.5rem 0.9rem",
  borderRadius: 8,
  border: "none",
  background: "#6366f1",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary = {
  padding: "0.5rem 0.9rem",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "transparent",
  color: "#cbd5e1",
  cursor: "pointer",
};
