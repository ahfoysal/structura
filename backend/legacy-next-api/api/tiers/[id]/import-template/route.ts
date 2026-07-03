import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { templateId } = await request.json()
    const { id: tierId } = await params

    console.log("[v0] Importing template:", templateId, "to tier:", tierId)

    // Get template fields
    const fields = await sql`
      SELECT field_name, field_type, field_options, display_order
      FROM template_fields
      WHERE template_id = ${templateId}
      ORDER BY display_order ASC
    `

    console.log("[v0] Found", fields.length, "fields in template")

    // Add each field to the tier
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index]
      console.log("[v0] Importing field:", field.field_name)

      await sql`
        INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order, created_at, updated_at)
        VALUES (${tierId}, ${field.field_name}, ${field.field_type}, ${field.field_options || null}, ${index}, NOW(), NOW())
      `
    }

    console.log("[v0] Successfully imported", fields.length, "fields")
    return NextResponse.json({ success: true, fieldsAdded: fields.length })
  } catch (error: any) {
    console.error("[v0] Import template error:", error)
    return NextResponse.json({ error: error.message || "Failed to import template" }, { status: 500 })
  }
}
