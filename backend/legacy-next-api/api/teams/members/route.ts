import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()

    const teams = await sql`
      SELECT 
        t.id,
        t.name,
        COUNT(DISTINCT u.id) as member_count
      FROM teams t
      LEFT JOIN users u ON u.team_id = t.id
      GROUP BY t.id, t.name
      ORDER BY t.name ASC
    `

    // Get members for each team grouped by role
    const teamsWithMembers = await Promise.all(
      teams.map(async (team) => {
        const members = await sql`
          SELECT 
            id,
            full_name,
            email,
            role,
            employee_id,
            status,
            phone_number,
            is_project_lead
          FROM users
          WHERE team_id = ${team.id}
          ORDER BY role ASC, full_name ASC
        `

        // Group members by role
        const membersByRole: Record<string, any[]> = {}
        members.forEach((member) => {
          if (!membersByRole[member.role]) {
            membersByRole[member.role] = []
          }
          membersByRole[member.role].push(member)
        })

        return {
          ...team,
          membersByRole,
        }
      }),
    )

    return Response.json({ teams: teamsWithMembers })
  } catch (error) {
    console.error("[v0] Get teams with members error:", error)
    return Response.json({ error: "Failed to fetch teams" }, { status: 500 })
  }
}
