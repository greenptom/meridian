"use client";

import { useEffect, useState } from "react";

type Mode = "date" | "time" | "dateShort";

export function ClientTime({ iso, mode }: { iso: string; mode: Mode }) {
  const [localText, setLocalText] = useState<string | null>(null);

  useEffect(() => {
    setLocalText(format(iso, mode));
  }, [iso, mode]);

  return <>{localText ?? format(iso, mode, "UTC")}</>;
}

function format(iso: string, mode: Mode, tz?: string): string {
  const d = new Date(iso);
  const tzOpt = tz ? { timeZone: tz } : {};

  if (mode === "date") {
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...tzOpt,
    });
  }
  if (mode === "dateShort") {
    return d
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        ...tzOpt,
      })
      .toUpperCase();
  }
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...tzOpt,
  });
}
