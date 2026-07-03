import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const [roles, shifts, statuses] = await Promise.all([
      sql`SELECT id, name FROM roles ORDER BY name ASC`,
      sql`SELECT id, name FROM shifts ORDER BY name ASC`,
      sql`SELECT id, name FROM statuses ORDER BY name ASC`,
    ])

    return Response.json({
      roles: roles || [],
      shifts: shifts || [],
      statuses: statuses || [],
    })
  } catch (error) {
    console.error("[v0] Get dropdowns error:", error)
    return Response.json(
      {
        roles: [],
        shifts: [
          { id: "1", name: "Day" },
          { id: "2", name: "Night" },
        ],
        statuses: [
          { id: "1", name: "Probation" },
          { id: "2", name: "Permanent" },
        ],
      },
      { status: 200 },
    )
  }
}
