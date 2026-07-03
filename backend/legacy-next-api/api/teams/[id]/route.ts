import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    await sql`DELETE FROM teams WHERE id = ${id}`
    return Response.json({ success: true })
  } catch (error) {
    console.error("[v0] Delete team error:", error)
    return Response.json({ error: "Failed to delete team" }, { status: 500 })
  }
}
