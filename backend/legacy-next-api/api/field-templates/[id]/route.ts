import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth, getCurrentUser } from "@/lib/auth"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()

    if (!user?.is_admin) {
      return NextResponse.json({ error: "Only admins can delete templates" }, { status: 403 })
    }

    const { id } = await params

    await sql`DELETE FROM field_templates WHERE id = ${id} AND is_system = false`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Delete template error:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    const { name, description } = await request.json()

    if (!user?.is_admin) {
      return NextResponse.json({ error: "Only admins can update templates" }, { status: 403 })
    }

    const { id } = await params

    const result = await sql`
      UPDATE field_templates
      SET name = ${name}, description = ${description || null}
      WHERE id = ${id} AND is_system = false
      RETURNING *
    `

    return NextResponse.json({ template: result[0] })
  } catch (error) {
    console.error("[v0] Update template error:", error)
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params

    const template = await sql`
      SELECT * FROM field_templates WHERE id = ${id}
    `

    const fields = await sql`
      SELECT * FROM template_fields 
      WHERE template_id = ${id}
      ORDER BY display_order
    `

    return NextResponse.json({ template: template[0], fields })
  } catch (error) {
    console.error("[v0] Get template error:", error)
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 })
  }
}
