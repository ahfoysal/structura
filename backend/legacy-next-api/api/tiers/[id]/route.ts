import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const body = await request.json()

    if (body.name !== undefined) {
      await sql`UPDATE tiers SET name = ${body.name}, updated_at = NOW() WHERE id = ${id}`
    }

    if (body.allow_child_creation !== undefined) {
      await sql`UPDATE tiers SET allow_child_creation = ${body.allow_child_creation}, updated_at = NOW() WHERE id = ${id}`
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update tier" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params

    const tierIdsToDelete = await sql`
      WITH RECURSIVE tier_tree AS (
        SELECT id FROM tiers WHERE id = ${id}
        UNION ALL
        SELECT t.id FROM tiers t
        INNER JOIN tier_tree tt ON t.parent_id = tt.id
      )
      SELECT id FROM tier_tree
    `

    if (!tierIdsToDelete || tierIdsToDelete.length === 0) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 })
    }

    const tierIds = tierIdsToDelete.map((t: any) => t.id)

    // Delete tier_fields for all tiers in the hierarchy
    await sql`DELETE FROM tier_fields WHERE tier_id = ANY(${tierIds}::uuid[])`

    // Delete tier_data for all tiers in the hierarchy
    await sql`DELETE FROM tier_data WHERE tier_id = ANY(${tierIds}::uuid[])`

    // Delete all tiers in the hierarchy
    await sql`DELETE FROM tiers WHERE id = ANY(${tierIds}::uuid[])`

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete tier" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params

    // Fetch the tier to duplicate
    const tierResult = await sql`SELECT * FROM tiers WHERE id = ${id}`
    if (!tierResult || tierResult.length === 0) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 })
    }

    const tier = tierResult[0]

    // Fetch the entire tier hierarchy
    const allTiers = await sql`
      WITH RECURSIVE tier_tree AS (
        SELECT id, parent_id, name, level, allow_child_creation, project_id FROM tiers WHERE id = ${id}
        UNION ALL
        SELECT t.id, t.parent_id, t.name, t.level, t.allow_child_creation, t.project_id
        FROM tiers t
        INNER JOIN tier_tree tt ON t.parent_id = tt.id
      )
      SELECT * FROM tier_tree
    `

    if (!allTiers || allTiers.length === 0) {
      return NextResponse.json({ error: "Failed to collect tier structure" }, { status: 500 })
    }

    const sortedTiers = allTiers.sort((a: any, b: any) => {
      if (a.id === id) return -1 // root tier first
      if (b.id === id) return 1
      return a.level - b.level
    })

    const tierIds = allTiers.map((t: any) => t.id)
    const allFields = await sql`
      SELECT * FROM tier_fields 
      WHERE tier_id = ANY(${tierIds}::uuid[])
    `

    // Create tier map for tracking old ID -> new ID
    const tierMap = new Map<string, string>()

    for (const originalTier of sortedTiers) {
      const uniqueName = originalTier.id === id ? `${originalTier.name} Copy` : originalTier.name

      // For the root tier being duplicated, use its original parent
      // For child tiers, use the newly created parent from tierMap
      let newParentId: string | null = null
      if (originalTier.id === id) {
        newParentId = tier.parent_id
      } else if (originalTier.parent_id) {
        newParentId = tierMap.get(originalTier.parent_id) || null
      }

      const newTierResult = await sql`
        INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation, created_at, updated_at)
        VALUES (${tier.project_id}, ${newParentId}, ${uniqueName}, ${originalTier.level}, ${originalTier.allow_child_creation}, NOW(), NOW())
        RETURNING id
      `
      tierMap.set(originalTier.id, newTierResult[0].id)
    }

    // Copy all fields in batch
    if (allFields && allFields.length > 0) {
      for (const field of allFields) {
        const newTierId = tierMap.get(field.tier_id)
        if (newTierId) {
          await sql`
            INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order, created_at, updated_at)
            VALUES (${newTierId}, ${field.field_name}, ${field.field_type}, ${field.field_options}, ${field.display_order}, NOW(), NOW())
          `
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Duplicate tier error:", error)

    const errorMsg = error?.message || ""
    if (errorMsg.includes("is not valid JSON") || errorMsg.includes("Too Many") || errorMsg.includes("429")) {
      return NextResponse.json(
        { error: "Database is temporarily busy. Please try again in a moment." },
        { status: 503 },
      )
    }
    if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout")) {
      return NextResponse.json({ error: "Database connection failed. Please try again." }, { status: 503 })
    }

    return NextResponse.json({ error: errorMsg || "Failed to duplicate tier" }, { status: 500 })
  }
}
