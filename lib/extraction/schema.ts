export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
};

export type ExtractedShipment = {
  origin_country: ExtractedField<string>;
  destination_country: ExtractedField<string>;
  supplier_name: ExtractedField<string>;
  haulier_name: ExtractedField<string>;
  incoterm: ExtractedField<string>;
  commodity_code: ExtractedField<string>;
  invoice_value: ExtractedField<number>;
  currency: ExtractedField<string>;
  reason: ExtractedField<string>;
  po_number: ExtractedField<string>;
  quantity: ExtractedField<number>;
  quantity_unit: ExtractedField<string>;
  notes: string | null;
};

export const EXTRACTED_FIELDS = [
  "origin_country",
  "destination_country",
  "supplier_name",
  "haulier_name",
  "incoterm",
  "commodity_code",
  "invoice_value",
  "currency",
  "reason",
  "po_number",
  "quantity",
  "quantity_unit",
] as const;

export type ExtractedFieldName = (typeof EXTRACTED_FIELDS)[number];

const stringField = {
  type: "object",
  properties: {
    value: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: ["value", "confidence"],
  additionalProperties: false,
};

const numberField = {
  type: "object",
  properties: {
    value: { type: ["number", "null"] },
    confidence: { type: "number" },
  },
  required: ["value", "confidence"],
  additionalProperties: false,
};

import type Anthropic from "@anthropic-ai/sdk";

export const EXTRACT_TOOL_SCHEMA: Anthropic.Tool = {
  name: "record_shipment_extraction",
  description:
    "Record the shipment fields extracted from the supplied trade document. Return one entry per field with a value (or null if not present) and a confidence from 0.0 to 1.0.",
  input_schema: {
    type: "object",
    properties: {
      origin_country: stringField,
      destination_country: stringField,
      supplier_name: stringField,
      haulier_name: stringField,
      incoterm: stringField,
      commodity_code: stringField,
      invoice_value: numberField,
      currency: stringField,
      reason: stringField,
      po_number: stringField,
      quantity: numberField,
      quantity_unit: stringField,
      notes: { type: ["string", "null"] },
    },
    required: [
      "origin_country",
      "destination_country",
      "supplier_name",
      "haulier_name",
      "incoterm",
      "commodity_code",
      "invoice_value",
      "currency",
      "reason",
      "po_number",
      "quantity",
      "quantity_unit",
      "notes",
    ],
    additionalProperties: false,
  },
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const SUPPORTED_PDF_MIME = "application/pdf" as const;

export function isSupportedMime(mime: string) {
  return (
    mime === SUPPORTED_PDF_MIME ||
    (SUPPORTED_IMAGE_MIME as readonly string[]).includes(mime)
  );
}

export function meanConfidence(extracted: ExtractedShipment): number {
  const fields = EXTRACTED_FIELDS.map((k) => extracted[k].confidence);
  const sum = fields.reduce((a, b) => a + b, 0);
  return fields.length > 0 ? sum / fields.length : 0;
}
