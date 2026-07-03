import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"
import bcryptjs from "bcryptjs"

const sql = neon(process.env.DATABASE_URL!)

interface ImportEmployee {
  PL: string
  E_ID: string | number
  Name: string
  "Phone Number"?: string | number
  "Gitlab Username"?: string
  "Official Mail"?: string
  Role: string
  Team: string
  Shift: string
  Status: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user?.is_admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const employees: ImportEmployee[] = body.employees || []

    if (!Array.isArray(employees) || employees.length === 0) {
      return Response.json({ error: "No employees to import" }, { status: 400 })
    }

    const stream = new ReadableStream({
      async start(controller) {
        let created = 0
        let updated = 0
        let skipped = 0
        const errors: string[] = []
        const total = employees.length

        for (let idx = 0; idx < employees.length; idx++) {
          const emp = employees[idx]

          try {
            const employeeId = String(emp.E_ID).trim()
            const fullName = String(emp.Name).trim()
            const roleName = String(emp.Role).trim()
            const teamName = String(emp.Team).trim()
            const shiftName = String(emp.Shift).trim()
            const statusName = String(emp.Status).trim()

            if (!employeeId || !fullName || !roleName || !teamName || !shiftName || !statusName) {
              skipped++
              const progress = {
                current: idx + 1,
                total,
                created,
                updated,
                skipped,
                message: `Skipping ${fullName} - missing required fields`,
              }
              controller.enqueue(`data: ${JSON.stringify(progress)}\n\n`)
              await delay(1000)
              continue
            }

            const existing = await sql`SELECT id FROM users WHERE employee_id = ${employeeId}`
            const existingId = existing[0]?.id

            // Get or create team
            const teamResult = await sql`SELECT id FROM teams WHERE name = ${teamName}`
            let teamId = teamResult[0]?.id

            if (!teamId) {
              const newTeam = await sql`INSERT INTO teams (name) VALUES (${teamName}) RETURNING id`
              teamId = newTeam[0].id
            }

            // Get or create role
            const roleResult = await sql`SELECT id FROM roles WHERE name = ${roleName}`
            if (roleResult.length === 0) {
              await sql`INSERT INTO roles (name) VALUES (${roleName})`
            }

            // Get or create shift
            const shiftResult = await sql`SELECT id FROM shifts WHERE name = ${shiftName}`
            if (shiftResult.length === 0) {
              await sql`INSERT INTO shifts (name) VALUES (${shiftName})`
            }

            // Get or create status
            const statusResult = await sql`SELECT id FROM statuses WHERE name = ${statusName}`
            if (statusResult.length === 0) {
              await sql`INSERT INTO statuses (name) VALUES (${statusName})`
            }

            const email = emp["Official Mail"] || `${employeeId}@company.com`

            if (existingId) {
              await sql`
                UPDATE users SET
                  full_name = ${fullName},
                  phone_number = ${emp["Phone Number"]?.toString() || null},
                  gitlab_username = ${emp["Gitlab Username"] || null},
                  official_mail = ${emp["Official Mail"] || null},
                  role = ${roleName},
                  team_id = ${teamId},
                  shift = ${shiftName},
                  status = ${statusName},
                  is_project_lead = ${emp.PL === "TRUE" ? true : false},
                  email = ${email}
                WHERE id = ${existingId}
              `
              updated++
            } else {
              const hashedPassword = await bcryptjs.hash("123456", 10)
              await sql`
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
                  password_hash,
                  user_role,
                  is_admin
                ) VALUES (
                  ${employeeId},
                  ${fullName},
                  ${emp["Phone Number"]?.toString() || null},
                  ${emp["Gitlab Username"] || null},
                  ${emp["Official Mail"] || null},
                  ${roleName},
                  ${teamId},
                  ${shiftName},
                  ${statusName},
                  ${emp.PL === "TRUE" ? true : false},
                  ${email},
                  ${hashedPassword},
                  ${"employee"},
                  ${false}
                )
              `
              created++
            }

            const progress = {
              current: idx + 1,
              total,
              created,
              updated,
              skipped,
              message: `${existingId ? "Updated" : "Imported"} ${fullName}`,
            }
            controller.enqueue(`data: ${JSON.stringify(progress)}\n\n`)

            await delay(1000)
          } catch (err: any) {
            skipped++
            errors.push(`${emp.Name}: ${err.message}`)
            const progress = {
              current: idx + 1,
              total,
              created,
              updated,
              skipped,
              message: `Error: ${emp.Name} - ${err.message}`,
              error: true,
            }
            controller.enqueue(`data: ${JSON.stringify(progress)}\n\n`)
            await delay(1000)
          }
        }

        const completion = {
          complete: true,
          created,
          updated,
          skipped,
          errors: errors.length > 0 ? errors : undefined,
        }
        controller.enqueue(`data: ${JSON.stringify(completion)}\n\n`)
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error: any) {
    console.error("[v0] Bulk import error:", error)
    return Response.json({ error: error.message || "Failed to import employees" }, { status: 500 })
  }
}
