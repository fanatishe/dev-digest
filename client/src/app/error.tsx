"use client";

/* Route-segment error boundary. Catches render/data errors thrown anywhere in
   the page subtree and offers a recovery path (`reset`). It renders INSIDE the
   root layout, so the next-intl provider and design-system tokens are available.
   The last-resort boundary for layout failures is `global-error.tsx`. */

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  React.useEffect(() => {
    // Surface for local debugging; a telemetry hook can be added here later.
    console.error(error);
  }, [error]);

  return <ErrorState fullScreen title={t("error.title")} body={t("error.body")} onRetry={reset} />;
}
