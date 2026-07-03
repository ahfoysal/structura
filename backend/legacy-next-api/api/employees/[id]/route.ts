import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const updates = await request.json()

    const setClauses: string[] = []
    const values: any[] = []
    let paramCount = 1

    Object.entries(updates).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    values.push(id)

    const result = await sql.query(
      `UPDATE users SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
      values,
    )

    return Response.json({ employee: result[0] })
  } catch (error) {
    console.error("[v0] Update employee error:", error)
    return Response.json({ error: "Failed to update employee" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const updates = await request.json()

    const setClauses: string[] = []
    const values: any[] = []
    let paramCount = 1

    Object.entries(updates).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    values.push(id)

    const result = await sql.query(
      `UPDATE users SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
      values,
    )

    return Response.json({ employee: result[0] })
  } catch (error) {
    console.error("[v0] Update employee error:", error)
    return Response.json({ error: "Failed to update employee" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    await sql`DELETE FROM users WHERE id = ${id}`
    return Response.json({ success: true })
  } catch (error) {
    console.error("[v0] Delete employee error:", error)
    return Response.json({ error: "Failed to delete employee" }, { status: 500 })
  }
}
