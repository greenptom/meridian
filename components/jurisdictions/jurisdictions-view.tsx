"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JurisdictionModal } from "./jurisdiction-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  archiveJurisdiction,
  restoreJurisdiction,
} from "@/lib/actions/jurisdictions";
import {
  JURISDICTION_STATUS_LABELS,
  type Jurisdiction,
  type JurisdictionStatus,
} from "@/lib/types";

function statusPillClass(status: JurisdictionStatus): string {
  switch (status) {
    case "active":
      return "status status-active";
    case "query_on_hold":
      return "status status-review";
    case "not_registered":
      return "status status-archived";
  }
}

export function JurisdictionsView({
  jurisdictions,
}: {
  jurisdictions: Jurisdiction[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Jurisdiction | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Jurisdiction | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Jurisdiction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);

  const { active, archived } = useMemo(() => {
    const a: Jurisdiction[] = [];
    const arch: Jurisdiction[] = [];
    for (const j of jurisdictions) {
      (j.deleted_at ? arch : a).push(j);
    }
    return { active: a, archived: arch };
  }, [jurisdictions]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(j: Jurisdiction) {
    setEditing(j);
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
      const result = await archiveJurisdiction(id);
      if (!result.ok) {
        setError(result.error);
      }
      setArchiveTarget(null);
      router.refresh();
    });
  }

  function confirmRestore() {
    if (!restoreTarget) return;
    const id = restoreTarget.id;
    startTransition(async () => {
      const result = await restoreJurisdiction(id);
      if (!result.ok) {
        setError(result.error);
      }
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
            VAT <em className="text-[color:var(--color-ink-soft)]">registrations</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {active.length} active · {archived.length} archived
          </div>
        </div>
        <div className="flex gap-2.5">
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="text-lg leading-none">+</span> Add jurisdiction
          </button>
        </div>
      </header>

      {error && (
        <div
          className="mb-4 p-3 rounded text-[12px] font-mono"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
        >
          {error}
        </div>
      )}

      <JurisdictionTable
        rows={active}
        onEdit={openEdit}
        onArchive={(j) => setArchiveTarget(j)}
      />

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
              <JurisdictionTable
                rows={archived}
                archived
                onRestore={(j) => setRestoreTarget(j)}
              />
            </div>
          )}
        </div>
      )}

      <JurisdictionModal
        open={modalOpen}
        onClose={closeModal}
        editing={editing}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive jurisdiction?"
        tone="danger"
        confirmLabel="Archive"
        busy={isPending}
        message={
          archiveTarget ? (
            <>
              <strong>{archiveTarget.country_name}</strong> ({archiveTarget.country_code})
              will be hidden from active lists. You can restore it later —
              archived rows are kept for audit.
            </>
          ) : null
        }
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        title="Restore jurisdiction?"
        confirmLabel="Restore"
        busy={isPending}
        message={
          restoreTarget ? (
            <>
              <strong>{restoreTarget.country_name}</strong> ({restoreTarget.country_code})
              will return to the active list. If another jurisdiction with
              the same country code is already active, you'll need to
              archive that one first.
            </>
          ) : null
        }
        onConfirm={confirmRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

function JurisdictionTable({
  rows,
  archived = false,
  onEdit,
  onArchive,
  onRestore,
}: {
  rows: Jurisdiction[];
  archived?: boolean;
  onEdit?: (j: Jurisdiction) => void;
  onArchive?: (j: Jurisdiction) => void;
  onRestore?: (j: Jurisdiction) => void;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="text-[13px] text-[color:var(--color-ink-faint)] italic px-4 py-8 text-center rounded border border-dashed"
        style={{ borderColor: "var(--color-line)" }}
      >
        {archived ? "No archived jurisdictions" : "No jurisdictions yet"}
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
              {[
                "Country",
                "VAT number",
                "Status",
                "Registered",
                "Notes",
                "",
              ].map((h, i) => (
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
                <td className="px-4 py-3.5">
                  <span className="font-mono font-medium">
                    {r.country_code}
                  </span>{" "}
                  <span className="text-[color:var(--color-ink-soft)]">
                    · {r.country_name}
                  </span>
                </td>
                <td className="px-4 py-3.5 font-mono text-[12px]">
                  {r.vat_number ?? "—"}
                </td>
                <td className="px-4 py-3.5">
                  <span className={statusPillClass(r.status)}>
                    {JURISDICTION_STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3.5 font-mono text-[12px] text-[color:var(--color-ink-soft)]">
                  {r.registered_date ?? "—"}
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
