import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()

    if (!user?.is_admin) {
      return NextResponse.json({ error: "Only admins can delete projects" }, { status: 403 })
    }

    const { id } = await params

    // Delete project and all cascading data
    await sql`DELETE FROM projects WHERE id = ${id}`

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Delete project error:", error)
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()

    if (!user?.is_admin) {
      return NextResponse.json({ error: "Only admins can duplicate projects" }, { status: 403 })
    }

    const { id } = await params
    const { name } = await request.json()

    // Get original project
    const original = await sql`SELECT * FROM projects WHERE id = ${id}`

    if (!original.length) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Create new project
    const newProject = await sql`
      INSERT INTO projects (name, created_by)
      VALUES (${name}, ${user.id})
      RETURNING *
    `

    const newProjectId = newProject[0].id

    // Get all tiers from original project
    const originalTiers = await sql`
      SELECT * FROM tiers WHERE project_id = ${id} ORDER BY parent_id, display_order
    `

    // Map old tier IDs to new tier IDs
    const tierMap = new Map()
    const fieldMap = new Map() // Map old field IDs to new field IDs

    // Create tiers in order (parents first)
    for (const tier of originalTiers) {
      const newParentId = tier.parent_id ? tierMap.get(tier.parent_id) : null

      const newTier = await sql`
        INSERT INTO tiers (
          project_id, parent_id, name, allow_child_creation, display_order, created_at, updated_at
        )
        VALUES (
          ${newProjectId}, ${newParentId}, ${tier.name}, ${tier.allow_child_creation}, ${tier.display_order}, NOW(), NOW()
        )
        RETURNING id
      `

      tierMap.set(tier.id, newTier[0].id)

      const tierFields = await sql`
        SELECT * FROM tier_fields WHERE tier_id = ${tier.id}
      `

      for (const field of tierFields) {
        const newField = await sql`
          INSERT INTO tier_fields (
            tier_id, field_name, field_type, display_order, created_at, updated_at
          )
          VALUES (
            ${newTier[0].id}, ${field.field_name}, ${field.field_type}, ${field.display_order}, NOW(), NOW()
          )
          RETURNING id
        `

        fieldMap.set(field.id, newField[0].id) // Store mapping of old field ID to new field ID
      }

      const tierData = await sql`
        SELECT * FROM tier_data WHERE tier_id = ${tier.id}
      `

      for (const data of tierData) {
        const newFieldId = fieldMap.get(data.field_id)

        if (newFieldId) {
          await sql`
            INSERT INTO tier_data (
              tier_id, field_id, text_value, value, created_at, updated_at
            )
            VALUES (
              ${newTier[0].id}, ${newFieldId}, ${data.text_value}, ${data.value}, NOW(), NOW()
            )
          `
        }
      }
    }

    return NextResponse.json({ project: newProject[0] })
  } catch (error: any) {
    console.error("[v0] Duplicate project error:", error)
    return NextResponse.json({ error: "Failed to duplicate project" }, { status: 500 })
  }
}
