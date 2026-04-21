export type ShipmentStatus = "draft" | "active" | "review" | "alert" | "archived";

export type FlagCode =
  | "NO_VAT_REG_FOR_DDP"
  | "VAT_QUERY_ON_HOLD"
  | "MISSING_COMMODITY_CODE"
  | "MISSING_INVOICE_VALUE"
  | "MISSING_IOR";

export type QuantityUnit =
  | "kg"
  | "g"
  | "lb"
  | "units"
  | "pallets"
  | "containers";

export type CustomsStatus =
  | "not_started"
  | "in_progress"
  | "cleared"
  | "held";

export interface Shipment {
  id: string;
  ref: string;
  origin_country: string | null;
  destination_country: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  haulier_id: string | null;
  haulier_name: string | null;
  incoterm: string | null;
  commodity_code: string | null;
  product_type: string | null;
  invoice_value: number | null;
  currency: string | null;
  ior_id: string | null;
  ior_name: string | null;
  reason: string | null;
  status: ShipmentStatus;
  flags: FlagCode[];
  po_number: string | null;
  quantity: number | null;
  quantity_unit: QuantityUnit | null;
  expected_landed_date: string | null;
  actual_landed_date: string | null;
  customs_status: CustomsStatus | null;
  freight_cost: number | null;
  insurance_cost: number | null;
  duty_cost: number | null;
  other_costs: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VatRegistration {
  country_code: string;
  registration_type: string;
  registration_date: string | null;
  vat_number: string;
  managed_by_avask: boolean;
  filing_period: string;
  status: string;
  comment: string | null;
}

export interface Incoterm {
  code: string;
  full_name: string;
  delivery_point: string;
  risk_transfer: string;
  cost_responsibility: string;
}

export interface CommodityCode {
  code: string;
  product_type: string;
  tariff_description: string;
}

export interface Haulier {
  id: string;
  name: string;
  primary_purpose: string | null;
  applicable_products: string | null;
  typical_incoterms: string | null;
}

export interface ShipmentDocument {
  id: string;
  shipment_id: string | null;
  storage_path: string;
  filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  extraction_confidence: number | null;
  extracted_at: string | null;
  created_at: string;
}

export type ShipmentEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "document_attached"
  | "document_extracted"
  | "note_added"
  | "landed"
  | "customs_cleared"
  | "customs_held"
  | "batch_created"
  | "batch_used";

export interface ShipmentEventChange {
  from: unknown;
  to: unknown;
}

export interface ShipmentEvent {
  id: string;
  shipment_id: string | null;
  batch_id: string | null;
  type: ShipmentEventType;
  summary: string | null;
  changes: Record<string, ShipmentEventChange> | null;
  payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface Organisation {
  id: string;
  name: string;
  created_at: string;
}

export interface Batch {
  id: string;
  batch_code: string;
  blend_name: string | null;
  roasted_date: string | null;
  quantity_produced: number | null;
  quantity_unit: QuantityUnit;
  notes: string | null;
  organisation_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentBatchUse {
  id: string;
  shipment_id: string;
  batch_id: string;
  quantity_used: number;
  quantity_unit: QuantityUnit;
  notes: string | null;
  organisation_id: string;
  created_at: string;
}

export type ShipmentBatchUseWithBatch = ShipmentBatchUse & {
  batch: Pick<
    Batch,
    "id" | "batch_code" | "blend_name" | "roasted_date" | "quantity_unit"
  > | null;
};
