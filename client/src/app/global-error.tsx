"use client";

/* Global error boundary — the LAST resort. Next.js renders this only when the
   ROOT layout itself throws, replacing it entirely. It must therefore render its
   own <html>/<body> and cannot rely on the next-intl provider or the design
   system's CSS being present — so keep it dependency-free with inline styles and
   literal copy. Everyday page errors are handled by `error.tsx` instead. */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "80px 24px",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0b0f",
          color: "#e6e6ea",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</div>
        <div style={{ fontSize: 14, color: "#a1a1ab", maxWidth: 380, lineHeight: 1.5 }}>
          The application failed to load. Please try again — if the problem persists,
          restart the DevDigest app.
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #2a2a33",
            background: "#16161c",
            color: "#e6e6ea",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
