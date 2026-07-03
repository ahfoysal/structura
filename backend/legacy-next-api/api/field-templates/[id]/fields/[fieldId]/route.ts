import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  try {
    await requireAuth()
    const { id: templateId, fieldId } = await params

    await sql`
      DELETE FROM template_fields
      WHERE id = ${fieldId} AND template_id = ${templateId}
    `

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Delete template field error:", error)
    return NextResponse.json({ error: error.message || "Failed to delete field" }, { status: 500 })
  }
}
