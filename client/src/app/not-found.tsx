/* 404 boundary — rendered for unmatched routes and `notFound()` calls. Server
   component: it renders inside the root layout (design-system CSS + locale are
   available), reads copy via `getTranslations`, and links home with a native
   <Link> so it works without client JS. */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 10,
        minHeight: "60vh",
        padding: "80px 24px",
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 800, color: "var(--text-muted)" }}>404</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
        {t("notFound.title")}
      </div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 380, lineHeight: 1.5 }}>
        {t("notFound.body")}
      </div>
      <Link
        href="/"
        style={{
          marginTop: 12,
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        {t("notFound.cta")}
      </Link>
    </div>
  );
}
