"use client";

import { useEffect } from "react";

/**
 * The last resort, when the root layout itself fails (Phase 157): no fonts,
 * providers or stylesheet can be trusted here, so it is plain and says it in
 * both languages. Next requires its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#ffffff",
          color: "#111827",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 320 }}>
          <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>Ada yang tidak beres</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 12px" }}>Data Anda aman. Coba lagi sebentar.</p>
          <h2 style={{ fontSize: 16, margin: "0 0 4px", fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px" }}>Your data is safe. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              width: "100%",
              border: 0,
              borderRadius: 12,
              background: "#171717",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Coba lagi · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
