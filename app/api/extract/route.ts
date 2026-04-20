import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXTRACT_TOOL_SCHEMA,
  ExtractedShipment,
  MAX_UPLOAD_BYTES,
  SUPPORTED_PDF_MIME,
  isSupportedMime,
  meanConfidence,
} from "@/lib/extraction/schema";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/extraction/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type ExtractRequest = {
  storagePath?: string;
  filename?: string;
  mimeType?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ExtractRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { storagePath, filename, mimeType } = body;
  if (!storagePath || !filename || !mimeType) {
    return NextResponse.json(
      { error: "storagePath, filename, and mimeType are required" },
      { status: 400 },
    );
  }
  if (!isSupportedMime(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: fileBlob, error: downloadError } = await admin.storage
    .from("shipment-docs")
    .download(storagePath);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { error: `Could not read uploaded file: ${downloadError?.message ?? "unknown"}` },
      { status: 400 },
    );
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` },
      { status: 413 },
    );
  }
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }
  const anthropic = new Anthropic({ apiKey });

  const documentBlock =
    mimeType === SUPPORTED_PDF_MIME
      ? ({
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64,
          },
        })
      : ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
            data: base64,
          },
        });

  let extracted: ExtractedShipment;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL_SCHEMA],
      tool_choice: {
        type: "tool",
        name: "record_shipment_extraction",
        disable_parallel_tool_use: true,
      },
      messages: [
        {
          role: "user",
          content: [
            documentBlock,
            {
              type: "text",
              text: "Extract the shipment fields from this document using the record_shipment_extraction tool.",
            },
          ],
        },
      ],
    });

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolBlock) {
      return NextResponse.json(
        { error: "Model did not return a structured extraction" },
        { status: 502 },
      );
    }
    extracted = toolBlock.input as ExtractedShipment;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Extraction failed: ${err.message}` },
        { status: err.status ?? 502 },
      );
    }
    throw err;
  }

  const overallConfidence = meanConfidence(extracted);

  const { data: inserted, error: insertError } = await admin
    .from("shipment_documents")
    .insert({
      storage_path: storagePath,
      filename,
      mime_type: mimeType,
      file_size: arrayBuffer.byteLength,
      extracted_json: extracted,
      extraction_confidence: overallConfidence,
      extracted_at: new Date().toISOString(),
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: `Could not save document record: ${insertError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documentId: inserted.id,
    extracted,
    overallConfidence,
  });
}
