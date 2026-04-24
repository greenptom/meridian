"use client";

import { useMemo, useState } from "react";
import type {
  Shipment,
  Incoterm,
  CommodityCode,
  ShipmentDocument,
  ShipmentEvent,
} from "@/lib/types";
import { KpiStrip } from "./kpi-strip";
import { ShipmentsPageHeader } from "./page-header";
import { ShipmentsTable } from "./shipments-table";
import { IntakeModal } from "./intake-modal";

export function ShipmentsView({
  shipments,
  incoterms,
  commodityCodes,
  documents,
  events,
  headerVariant = "default",
}: {
  shipments: Shipment[];
  incoterms: Incoterm[];
  commodityCodes: CommodityCode[];
  documents: ShipmentDocument[];
  events: ShipmentEvent[];
  headerVariant?: "default" | "drafts";
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);

  const documentsByShipment = useMemo(() => {
    const map = new Map<string, ShipmentDocument[]>();
    for (const d of documents) {
      if (!d.shipment_id) continue;
      const bucket = map.get(d.shipment_id) ?? [];
      bucket.push(d);
      map.set(d.shipment_id, bucket);
    }
    return map;
  }, [documents]);

  const eventsByShipment = useMemo(() => {
    const map = new Map<string, ShipmentEvent[]>();
    for (const e of events) {
      if (!e.shipment_id) continue;
      const bucket = map.get(e.shipment_id) ?? [];
      bucket.push(e);
      map.set(e.shipment_id, bucket);
    }
    return map;
  }, [events]);

  const activeCount = shipments.filter((s) => s.status === "active").length;
  const flaggedCount = shipments.filter(
    (s) => s.status === "alert" || (s.flags?.length ?? 0) > 0,
  ).length;

  function openCreate() {
    setEditing(null);
    setFocusField(null);
    setModalOpen(true);
  }

  function openEdit(shipment: Shipment, focus?: string) {
    setEditing(shipment);
    setFocusField(focus ?? null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFocusField(null);
  }

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function onExport() {
    if (isExporting) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const res = await fetch("/api/export/xlsx");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ??
        `meridian-shipments-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer the revoke one tick so the browser's download handler
      // has time to take a reference to the blob before we release it.
      // Synchronous revoke races with WebKit/Safari and can produce
      // 0-byte files intermittently.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <ShipmentsPageHeader
        variant={headerVariant}
        activeCount={activeCount}
        flaggedCount={flaggedCount}
        onNew={openCreate}
        onExport={headerVariant === "default" ? onExport : undefined}
        isExporting={isExporting}
      />
      {exportError && (
        <div
          className="mb-4 p-3 rounded text-[12px] font-mono"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
        >
          Export failed: {exportError}
        </div>
      )}
      {headerVariant === "default" && <KpiStrip shipments={shipments} />}
      <ShipmentsTable
        shipments={shipments}
        documentsByShipment={documentsByShipment}
        eventsByShipment={eventsByShipment}
        onEdit={openEdit}
        hideFilters={headerVariant === "drafts"}
      />
      <IntakeModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={closeModal}
        incoterms={incoterms}
        commodityCodes={commodityCodes}
        editingShipment={editing}
        focusField={focusField}
      />
    </>
  );
}
