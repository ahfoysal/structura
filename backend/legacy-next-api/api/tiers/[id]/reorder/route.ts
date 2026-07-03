import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { newIndex, parentId, newParentId } = await request.json()

    console.log("[v0] Reorder tier:", { id, newIndex, parentId, newParentId })

    const sql = neon(process.env.DATABASE_URL!)

    const isChangingParent = newParentId !== undefined && newParentId !== parentId

    if (isChangingParent) {
      console.log("[v0] Moving tier to new parent:", newParentId)
      // Update the parent_id first
      await sql`UPDATE tiers SET parent_id = ${newParentId || null} WHERE id = ${id}`

      // Get old siblings (excluding the moved tier)
      const oldSiblings = await sql`
        SELECT id, display_order FROM tiers 
        WHERE parent_id IS NOT DISTINCT FROM ${parentId || null}
        AND id != ${id}
        ORDER BY display_order ASC
      `

      // Reorder old siblings
      for (let i = 0; i < oldSiblings.length; i++) {
        await sql`UPDATE tiers SET display_order = ${i} WHERE id = ${oldSiblings[i].id}`
      }

      // Get new siblings (including the moved tier)
      const newSiblings = await sql`
        SELECT id, display_order FROM tiers 
        WHERE parent_id IS NOT DISTINCT FROM ${newParentId || null}
        ORDER BY display_order ASC
      `

      // Insert the moved tier at the new index
      const reorderedNewSiblings = newSiblings.filter((s: any) => s.id !== id)
      reorderedNewSiblings.splice(newIndex, 0, { id })

      // Update display_order for all new siblings
      for (let i = 0; i < reorderedNewSiblings.length; i++) {
        await sql`UPDATE tiers SET display_order = ${i} WHERE id = ${reorderedNewSiblings[i].id}`
      }
    } else {
      console.log("[v0] Reordering within same parent")

      const siblings = await sql`
        SELECT id, display_order FROM tiers 
        WHERE parent_id IS NOT DISTINCT FROM ${parentId || null}
        ORDER BY display_order ASC
      `

      console.log("[v0] Siblings before reorder:", siblings)

      if (!siblings.length) {
        return Response.json({ error: "No siblings found" }, { status: 400 })
      }

      const currentIndex = siblings.findIndex((s: any) => s.id === id)
      if (currentIndex === -1) {
        return Response.json({ error: "Tier not found in siblings" }, { status: 404 })
      }

      // Remove the tier from its current position
      const reorderedSiblings = [...siblings]
      const [movedTier] = reorderedSiblings.splice(currentIndex, 1)

      // Insert it at the new position
      reorderedSiblings.splice(newIndex, 0, movedTier)

      console.log(
        "[v0] Siblings after reorder:",
        reorderedSiblings.map((s: any) => ({ id: s.id, newOrder: reorderedSiblings.indexOf(s) })),
      )

      // Update display_order for all siblings
      for (let i = 0; i < reorderedSiblings.length; i++) {
        await sql`UPDATE tiers SET display_order = ${i} WHERE id = ${reorderedSiblings[i].id}`
      }
    }

    console.log("[v0] Reorder completed successfully")
    return Response.json({ success: true })
  } catch (error) {
    console.error("[v0] Reorder tier error:", error)
    return Response.json({ error: "Failed to reorder tier" }, { status: 500 })
  }
}
