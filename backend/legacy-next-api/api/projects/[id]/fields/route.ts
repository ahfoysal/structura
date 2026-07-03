import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const fields = await sql`
      SELECT * FROM project_fields 
      WHERE project_id = ${id}
      ORDER BY display_order
    `
    return NextResponse.json({ fields })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch fields" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const { field_name, field_type = "number" } = await request.json()

    const maxOrder = await sql`
      SELECT COALESCE(MAX(display_order), -1) as max_order 
      FROM project_fields 
      WHERE project_id = ${id}
    `

    const result = await sql`
      INSERT INTO project_fields (project_id, field_name, field_type, display_order)
      VALUES (${id}, ${field_name}, ${field_type}, ${maxOrder[0].max_order + 1})
      RETURNING *
    `

    return NextResponse.json({ field: result[0] })
  } catch (error: any) {
    console.error("[v0] Add field error:", error)
    return NextResponse.json({ error: error.message || "Failed to add field" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const fieldId = searchParams.get("fieldId")

    if (!fieldId) {
      return NextResponse.json({ error: "Field ID required" }, { status: 400 })
    }

    await sql`DELETE FROM project_fields WHERE id = ${fieldId}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete field" }, { status: 500 })
  }
}
