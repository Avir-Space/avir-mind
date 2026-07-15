"use client";

/**
 * Root-level error boundary — catches errors in the root layout itself.
 * Must render its own <html>/<body>.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 500 }}>Something went wrong</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", marginTop: 8, fontSize: 14 }}>
            A critical error occurred. Please reload.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 20px",
              background: "#1019EC",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
