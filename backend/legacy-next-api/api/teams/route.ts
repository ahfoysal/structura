import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const teams = await sql`SELECT * FROM teams ORDER BY name ASC`
    return Response.json({ teams })
  } catch (error) {
    console.error("[v0] Get teams error:", error)
    return Response.json({ error: "Failed to fetch teams" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name } = await request.json()

    if (!name || typeof name !== "string") {
      return Response.json({ error: "Team name is required" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO teams (name) 
      VALUES (${name}) 
      RETURNING *
    `

    return Response.json({ team: result[0] })
  } catch (error: any) {
    console.error("[v0] Create team error:", error)
    if (error.message?.includes("unique")) {
      return Response.json({ error: "Team name already exists" }, { status: 400 })
    }
    return Response.json({ error: "Failed to create team" }, { status: 500 })
  }
}
