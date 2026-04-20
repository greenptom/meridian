export function ComingSoon({
  title,
  italic,
  phase,
  description,
}: {
  title: string;
  italic: string;
  phase: string;
  description: string;
}) {
  return (
    <div>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            {title} <em className="text-[color:var(--color-ink-soft)]">{italic}</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {phase}
          </div>
        </div>
      </header>
      <div
        className="rounded-[10px] border p-16 text-center"
        style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
      >
        <div className="font-serif italic text-[48px] text-[color:var(--color-ink-faint)] mb-4 font-light">
          Soon.
        </div>
        <div className="text-[14px] text-[color:var(--color-ink-soft)] max-w-md mx-auto leading-relaxed">
          {description}
        </div>
      </div>
    </div>
  );
}
