"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HaulierModal } from "./haulier-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveHaulier, restoreHaulier } from "@/lib/actions/hauliers";
import type { Haulier } from "@/lib/types";

export function HauliersView({ hauliers }: { hauliers: Haulier[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Haulier | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Haulier | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Haulier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { active, archived } = useMemo(() => {
    const a: Haulier[] = [];
    const arch: Haulier[] = [];
    for (const h of hauliers) (h.deleted_at ? arch : a).push(h);
    return { active: a, archived: arch };
  }, [hauliers]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(h: Haulier) {
    setEditing(h);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function confirmArchive() {
    if (!archiveTarget) return;
    const id = archiveTarget.id;
    startTransition(async () => {
      const result = await archiveHaulier(id);
      if (!result.ok) setError(result.error);
      setArchiveTarget(null);
      router.refresh();
    });
  }
  function confirmRestore() {
    if (!restoreTarget) return;
    const id = restoreTarget.id;
    startTransition(async () => {
      const result = await restoreHaulier(id);
      if (!result.ok) setError(result.error);
      setRestoreTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-4"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            Hauliers
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {active.length} active · {archived.length} archived
          </div>
        </div>
        <div className="flex gap-2.5">
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="text-lg leading-none">+</span> Add haulier
          </button>
        </div>
      </header>

      {error && (
        <div
          className="mb-4 p-3 rounded text-[12px] font-mono flex items-center justify-between"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline decoration-dotted underline-offset-2"
          >
            dismiss
          </button>
        </div>
      )}

      <HaulierTable rows={active} onEdit={openEdit} onArchive={setArchiveTarget} />

      {archived.length > 0 && (
        <div className="mt-8">
          <button
            className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] flex items-center gap-2"
            onClick={() => setShowArchived((v) => !v)}
          >
            <span>{showArchived ? "▾" : "▸"}</span>
            {archived.length} archived
          </button>
          {showArchived && (
            <div className="mt-4">
              <HaulierTable
                rows={archived}
                archived
                onRestore={setRestoreTarget}
              />
            </div>
          )}
        </div>
      )}

      <HaulierModal open={modalOpen} onClose={closeModal} editing={editing} />

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive haulier?"
        tone="caution"
        confirmLabel="Archive"
        busy={isPending}
        message={
          archiveTarget ? (
            <>
              <strong>{archiveTarget.name}</strong> will be hidden from
              active dropdowns. You can restore it later — archived rows
              are kept for audit. If shipments still reference this
              haulier, the archive will be blocked with a count.
            </>
          ) : null
        }
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        title="Restore haulier?"
        confirmLabel="Restore"
        busy={isPending}
        message={
          restoreTarget ? (
            <>
              <strong>{restoreTarget.name}</strong> will return to the
              active list.
            </>
          ) : null
        }
        onConfirm={confirmRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

function HaulierTable({
  rows,
  archived = false,
  onEdit,
  onArchive,
  onRestore,
}: {
  rows: Haulier[];
  archived?: boolean;
  onEdit?: (h: Haulier) => void;
  onArchive?: (h: Haulier) => void;
  onRestore?: (h: Haulier) => void;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="text-[13px] text-[color:var(--color-ink-faint)] italic px-4 py-8 text-center rounded border border-dashed"
        style={{ borderColor: "var(--color-line)" }}
      >
        {archived ? "No archived hauliers" : "No hauliers yet"}
      </div>
    );
  }
  return (
    <div
      className="rounded-[10px] border overflow-hidden"
      style={{
        background: "var(--color-card)",
        borderColor: "var(--color-line)",
        opacity: archived ? 0.75 : 1,
      }}
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Name", "Country", "Email", "Phone", "Notes", ""].map((h, i) => (
              <th
                key={i}
                className="text-left px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-[color:var(--color-ink-faint)] border-b"
                style={{
                  background: "var(--color-paper-warm)",
                  borderColor: "var(--color-line)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              style={{ borderBottom: "1px solid var(--color-line-soft)" }}
            >
              <td className="px-4 py-3.5 font-medium">{r.name}</td>
              <td className="px-4 py-3.5 font-mono text-[12px]">
                {r.country ?? "—"}
              </td>
              <td className="px-4 py-3.5 font-mono text-[12px] text-[color:var(--color-ink-soft)]">
                {r.contact_email ?? "—"}
              </td>
              <td className="px-4 py-3.5 font-mono text-[12px] text-[color:var(--color-ink-soft)]">
                {r.contact_phone ?? "—"}
              </td>
              <td className="px-4 py-3.5 text-[color:var(--color-ink-soft)] text-[12px]">
                {r.notes ?? "—"}
              </td>
              <td className="px-4 py-3.5 text-right">
                <div className="flex gap-2 justify-end">
                  {onEdit && (
                    <button
                      className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border hover:bg-[color:var(--color-paper-warm)]"
                      style={{ borderColor: "var(--color-line)" }}
                      onClick={() => onEdit(r)}
                    >
                      Edit
                    </button>
                  )}
                  {onArchive && (
                    <button
                      className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border hover:bg-[color:var(--color-paper-warm)]"
                      style={{
                        borderColor: "var(--color-line)",
                        color: "var(--color-accent)",
                      }}
                      onClick={() => onArchive(r)}
                    >
                      Archive
                    </button>
                  )}
                  {onRestore && (
                    <button
                      className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border hover:bg-[color:var(--color-paper-warm)]"
                      style={{ borderColor: "var(--color-line)" }}
                      onClick={() => onRestore(r)}
                    >
                      Restore
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
