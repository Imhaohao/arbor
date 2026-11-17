"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#0f1714", color: "#e8efe9" }}>
        <div style={{ maxWidth: "44ch", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Unable to load Arbor</h1>
          <p style={{ opacity: 0.75, lineHeight: 1.5 }}>Check your connection and try again in a moment.</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#e8efe9", color: "#0f1714", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
