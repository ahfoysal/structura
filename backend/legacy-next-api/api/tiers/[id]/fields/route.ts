import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const fields = await sql`
      SELECT * FROM tier_fields 
      WHERE tier_id = ${id}
      ORDER BY display_order
    `
    return NextResponse.json({ fields })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch tier fields" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 })
    }

    const { id } = await params
    const { field_name, field_type = "string", field_options } = await request.json()

    const maxOrder = await sql`
      SELECT COALESCE(MAX(display_order), -1) as max_order 
      FROM tier_fields 
      WHERE tier_id = ${id}
    `

    const result = await sql`
      INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order)
      VALUES (${id}, ${field_name}, ${field_type}, ${field_options || null}, ${maxOrder[0].max_order + 1})
      RETURNING *
    `

    return NextResponse.json({ field: result[0] })
  } catch (error: any) {
    console.error("[v0] Add tier field error:", error)
    return NextResponse.json({ error: error.message || "Failed to add field" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const fieldId = searchParams.get("fieldId")

    if (!fieldId) {
      return NextResponse.json({ error: "Field ID required" }, { status: 400 })
    }

    console.log("[v0] Deleting field:", fieldId, "from tier:", id)

    await sql`DELETE FROM tier_fields WHERE id = ${fieldId} AND tier_id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Delete field error:", error)
    return NextResponse.json({ error: error.message || "Failed to delete field" }, { status: 500 })
  }
}
