"use client";

export function ShipmentsPageHeader({
  variant = "default",
  activeCount,
  flaggedCount,
  onNew,
}: {
  variant?: "default" | "drafts";
  activeCount: number;
  flaggedCount: number;
  onNew: () => void;
}) {
  const monthLabel = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const isDrafts = variant === "drafts";

  return (
    <header
      className="flex justify-between items-end pb-6 mb-7 border-b max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-4"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div>
        <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
          {isDrafts ? (
            <>
              Draft <em className="text-[color:var(--color-ink-soft)]">movements</em>
            </>
          ) : (
            <>
              Stock <em className="text-[color:var(--color-ink-soft)]">movements</em>
            </>
          )}
        </h1>
        <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
          {isDrafts
            ? "Awaiting review before they go active"
            : `${monthLabel} · ${activeCount} active · ${flaggedCount} flagged`}
        </div>
      </div>
      <div className="flex gap-2.5">
        {!isDrafts && (
          <button className="btn" disabled title="Phase 4">
            <span>Export to Excel</span>
          </button>
        )}
        <button className="btn btn-primary" onClick={onNew}>
          <span className="text-lg leading-none">+</span> Log movement
        </button>
      </div>
    </header>
  );
}
