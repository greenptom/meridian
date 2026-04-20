export type ShipmentStatus = "draft" | "active" | "review" | "alert" | "archived";

export type FlagCode =
  | "NO_VAT_REG_FOR_DDP"
  | "VAT_QUERY_ON_HOLD"
  | "MISSING_COMMODITY_CODE"
  | "MISSING_INVOICE_VALUE"
  | "MISSING_IOR";

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
