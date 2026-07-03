import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const employees = await sql`
      SELECT u.*, t.name as team_name 
      FROM users u 
      LEFT JOIN teams t ON u.team_id = t.id 
      WHERE u.email != ${"admin@example.com"}
      ORDER BY u.full_name ASC
    `
    return Response.json({ employees })
  } catch (error) {
    console.error("[v0] Get employees error:", error)
    return Response.json({ error: "Failed to fetch employees" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      employee_id,
      full_name,
      phone_number,
      gitlab_username,
      official_mail,
      role,
      team_id,
      shift,
      status,
      is_project_lead,
    } = await request.json()

    // Validate required fields
    if (!employee_id || !full_name || !role || !team_id || !shift || !status) {
      return Response.json(
        { error: "Missing required fields: employee_id, full_name, role, team_id, shift, status" },
        { status: 400 },
      )
    }

    const result = await sql`
      INSERT INTO users (
        employee_id,
        full_name,
        phone_number,
        gitlab_username,
        official_mail,
        role,
        team_id,
        shift,
        status,
        is_project_lead,
        email,
        password_hash
      ) VALUES (
        ${employee_id},
        ${full_name},
        ${phone_number || null},
        ${gitlab_username || null},
        ${official_mail || null},
        ${role},
        ${team_id},
        ${shift},
        ${status},
        ${is_project_lead || false},
        ${official_mail || `${employee_id}@company.com`},
        ${"temp_password"}
      )
      RETURNING id, employee_id, full_name, role, team_id, shift, status, is_project_lead
    `

    return Response.json({ employee: result[0] })
  } catch (error: any) {
    console.error("[v0] Create employee error:", error)
    if (error.message?.includes("unique")) {
      return Response.json({ error: "Employee ID already exists" }, { status: 400 })
    }
    return Response.json({ error: "Failed to create employee" }, { status: 500 })
  }
}
