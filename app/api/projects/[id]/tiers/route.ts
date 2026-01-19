import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolvedParams = await params
    const projectId = resolvedParams?.id

    if (!projectId) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    const tiers = await sql`
      SELECT * FROM tiers
      WHERE project_id = ${projectId}
      ORDER BY level, created_at
    `

    // Fetch ALL tier data in a single query instead of one query per tier
    const tierIds = tiers.map((t: any) => t.id)
    
    let allTierData: any[] = []
    if (tierIds.length > 0) {
      allTierData = await sql`
        SELECT tier_id, field_id, value, text_value FROM tier_data
        WHERE tier_id = ANY(${tierIds})
      `
    }

    // Group tier data by tier_id in memory
    const tierDataMap: Record<string, any[]> = {}
    for (const data of allTierData) {
      if (!tierDataMap[data.tier_id]) {
        tierDataMap[data.tier_id] = []
      }
      tierDataMap[data.tier_id].push({
        field_id: data.field_id,
        value: data.value,
        text_value: data.text_value,
      })
    }

    // Map tiers with their data
    const tiersWithData = tiers.map((tier: any) => ({
      ...tier,
      data: tierDataMap[tier.id] || [],
    }))

    return NextResponse.json({ tiers: tiersWithData })
  } catch (error) {
    console.error("[v0] Get tiers error:", error)
    return NextResponse.json({ error: "Failed to fetch tiers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolvedParams = await params
    const projectId = resolvedParams?.id

    if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
      console.log("[v0] Invalid project_id:", projectId)
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    const body = await request.json()
    const { name, parent_id, allow_child_creation = true } = body

    console.log("[v0] POST /api/projects/${projectId}/tiers - parent_id type:", typeof parent_id, "value:", parent_id)

    if (parent_id !== undefined && parent_id !== null) {
      if (typeof parent_id !== "string" || parent_id.trim() === "") {
        console.log("[v0] Invalid parent_id format:", parent_id)
        return NextResponse.json({ error: "Invalid parent_id format" }, { status: 400 })
      }
      if (parent_id === "undefined" || parent_id === "") {
        console.log("[v0] parent_id is invalid string value:", parent_id)
        return NextResponse.json({ error: "Invalid parent_id: cannot be undefined or empty" }, { status: 400 })
      }
    }

    if (parent_id && !user?.is_admin) {
      const parent = await sql`
        SELECT allow_child_creation FROM tiers WHERE id = ${parent_id}
      `
      if (parent[0] && !parent[0].allow_child_creation) {
        return NextResponse.json({ error: "Parent tier does not allow child creation" }, { status: 403 })
      }
    }

    let level = 0
    if (parent_id && typeof parent_id === "string" && parent_id.length > 0) {
      console.log("[v0] Fetching parent tier with id:", parent_id)
      const parentTier = await sql`SELECT level FROM tiers WHERE id = ${parent_id}`

      if (!parentTier || parentTier.length === 0) {
        console.log("[v0] Parent tier not found for id:", parent_id)
        return NextResponse.json({ error: "Parent tier not found" }, { status: 404 })
      }

      level = parentTier[0].level + 1
    }

    console.log("[v0] Creating tier with - project_id:", projectId, "parent_id:", parent_id || null, "level:", level)

    const result = await sql`
      INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
      VALUES (${projectId}, ${parent_id || null}, ${name}, ${level}, ${allow_child_creation})
      RETURNING *
    `

    return NextResponse.json({ tier: result[0] })
  } catch (error: any) {
    console.error("[v0] Create tier error:", error)
    return NextResponse.json({ error: error.message || "Failed to create tier" }, { status: 500 })
  }
}
