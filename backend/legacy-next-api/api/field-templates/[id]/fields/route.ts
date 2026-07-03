import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id: templateId } = await params

    const fields = await sql`
      SELECT id, field_name, field_type, field_options, display_order
      FROM template_fields
      WHERE template_id = ${templateId}
      ORDER BY display_order ASC
    `

    return NextResponse.json({ fields })
  } catch (error) {
    console.error("[v0] Get template fields error:", error)
    return NextResponse.json({ error: "Failed to fetch template fields" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id: templateId } = await params
    const { field_name, field_type, field_options } = await request.json()

    if (!field_name.trim()) {
      return NextResponse.json({ error: "Field name required" }, { status: 400 })
    }

    // Get the next display order
    const maxOrder = await sql`
      SELECT MAX(display_order) as max_order
      FROM template_fields
      WHERE template_id = ${templateId}
    `

    const displayOrder = (maxOrder[0]?.max_order ?? -1) + 1

    const result = await sql`
      INSERT INTO template_fields (template_id, field_name, field_type, field_options, display_order)
      VALUES (${templateId}, ${field_name}, ${field_type}, ${field_options || null}, ${displayOrder})
      RETURNING *
    `

    return NextResponse.json({ field: result[0] })
  } catch (error: any) {
    console.error("[v0] Add template field error:", error)
    return NextResponse.json({ error: error.message || "Failed to add field" }, { status: 500 })
  }
}
