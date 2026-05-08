export type ShipmentStatus =
  | "draft"
  | "active"
  | "review"
  | "alert"
  | "closed"
  | "archived";

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

export type ShipmentCategory =
  | "coffee"
  | "coffee_roasted"
  | "packaging"
  | "equipment"
  | "supplies"
  | "other";

export const SHIPMENT_CATEGORIES: ShipmentCategory[] = [
  "coffee",
  "coffee_roasted",
  "packaging",
  "equipment",
  "supplies",
  "other",
];

export const SHIPMENT_CATEGORY_LABELS: Record<ShipmentCategory, string> = {
  coffee: "Coffee",
  coffee_roasted: "Coffee (roasted)",
  packaging: "Packaging",
  equipment: "Equipment",
  supplies: "Supplies",
  other: "Other",
};

export type FxRateSource = "frankfurter" | "manual" | "needs_review";

export const FX_RATE_SOURCE_LABELS: Record<FxRateSource, string> = {
  frankfurter: "Frankfurter",
  manual: "Manual",
  needs_review: "Needs review",
};

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
  shipment_category: ShipmentCategory | null;
  invoice_value: number | null;
  currency: string | null;
  fx_rate_to_gbp: number | null;
  fx_rate_source: FxRateSource | null;
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
  archived_at: string | null;
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

export type JurisdictionStatus = "active" | "query_on_hold" | "not_registered";

export const JURISDICTION_STATUS_LABELS: Record<JurisdictionStatus, string> = {
  active: "Active",
  query_on_hold: "Query on hold",
  not_registered: "Not registered",
};

export interface Jurisdiction {
  id: string;
  country_code: string;
  country_name: string;
  vat_number: string | null;
  status: JurisdictionStatus;
  registered_date: string | null;
  notes: string | null;
  // Legacy columns — still in the DB, not written by new code.
  // Kept on the type so existing reads don't lose shape.
  registration_type: string | null;
  managed_by_avask: boolean | null;
  filing_period: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type JurisdictionEventType =
  | "created"
  | "updated"
  | "archived"
  | "restored";

export interface JurisdictionEvent {
  id: string;
  jurisdiction_id: string;
  type: JurisdictionEventType;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_by: string | null;
  created_at: string;
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
  country: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  // Legacy columns kept on the type so reads of pre-migration data
  // still type-check.
  primary_purpose: string | null;
  applicable_products: string | null;
  typical_incoterms: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  country: string | null;
  commodity_focus: string | null;
  notes: string | null;
  default_incoterm: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ior {
  id: string;
  name: string;
  country: string | null;
  eori_number: string | null;
  notes: string | null;
  // vat_country is the country whose VAT this IOR files in — kept
  // distinct from `country` (the entity's residency).
  vat_country: string | null;
  scenario_type: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReferenceEventType = "created" | "updated" | "archived" | "restored";

export interface HaulierEvent {
  id: string;
  haulier_id: string;
  type: ReferenceEventType;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_by: string | null;
  created_at: string;
}

export interface SupplierEvent {
  id: string;
  supplier_id: string;
  type: ReferenceEventType;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_by: string | null;
  created_at: string;
}

export interface IorEvent {
  id: string;
  ior_id: string;
  type: ReferenceEventType;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_by: string | null;
  created_at: string;
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
  | "archived"
  | "restored";

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

