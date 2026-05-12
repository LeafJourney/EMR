import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { z } from "zod";
import {
  deleteAnnotation,
  getStudy,
  listAnnotations,
  saveAnnotation,
} from "@/lib/domain/medical-imaging-store";
import type { ImagingAnnotation } from "@/lib/domain/medical-imaging";

interface Ctx {
  params: { id: string };
}

const ShapeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("circle"),
    cx: z.number(),
    cy: z.number(),
    r: z.number().positive(),
  }),
  z.object({
    kind: z.literal("rect"),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
  z.object({
    kind: z.literal("arrow"),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  }),
  z.object({ kind: z.literal("text"), x: z.number(), y: z.number() }),
]);

const AnnotationSchema = z.object({
  seriesId: z.string().min(1),
  frame: z.number().int().nonnegative(),
  shape: ShapeSchema,
  author: z.string().min(1).max(120),
  patientVisible: z.boolean(),
  note: z.string().max(2000).optional(),
  severity: z.enum(["normal", "minor", "significant", "critical"]),
});

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;

  const patientVisibleOnly =
    req.nextUrl.searchParams.get("scope") === "patient";
  const study = getStudy(params.id);
  if (!study) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    annotations: listAnnotations(params.id, { patientVisibleOnly }),
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;

  const study = getStudy(params.id);
  if (!study) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AnnotationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const annotation: ImagingAnnotation = {
    id: `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    studyId: params.id,
    createdAt: new Date().toISOString(),
    ...parsed.data,
  };
  saveAnnotation(annotation);
  return NextResponse.json({ annotation }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;

  const annId = req.nextUrl.searchParams.get("annotationId");
  if (!annId) {
    return NextResponse.json({ error: "missing_annotation_id" }, { status: 400 });
  }
  const ok = deleteAnnotation(annId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, studyId: params.id });
}
