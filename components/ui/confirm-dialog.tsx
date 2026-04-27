"use client";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "neutral" | "caution" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center p-4"
      style={{ background: "rgba(20,15,5,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[420px] shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <div className="px-6 pt-5 pb-4">
          <div className="font-serif text-[22px] font-normal tracking-tight mb-2">
            {title}
          </div>
          <div className="text-[13px] text-[color:var(--color-ink-soft)] leading-relaxed">
            {message}
          </div>
        </div>
        <div
          className="px-6 py-4 border-t flex justify-end gap-2.5"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={busy}
            style={
              tone === "danger"
                ? {
                    background: "var(--color-accent)",
                    color: "var(--color-paper)",
                    borderColor: "var(--color-accent)",
                  }
                : tone === "caution"
                  ? {
                      background: "var(--color-warn)",
                      color: "var(--color-paper)",
                      borderColor: "var(--color-warn)",
                    }
                  : undefined
            }
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
