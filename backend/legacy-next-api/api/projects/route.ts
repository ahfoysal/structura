import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const MAX_RETRIES = 3
const RETRY_DELAY = 500

async function executeWithRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    if (error.message?.includes("Too Many Requests") && retries > 0) {
      const backoffDelay = RETRY_DELAY * (MAX_RETRIES - retries + 1)
      console.log(`[v0] Rate limited, retrying after ${backoffDelay}ms...`)
      await delay(backoffDelay)
      return executeWithRetry(fn, retries - 1)
    }
    throw error
  }
}

export async function GET() {
  try {
    await requireAuth()
    const projects = await sql`
      SELECT p.*, u.email as created_by_email
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `
    return NextResponse.json({ projects })
  } catch (error) {
    console.error("[v0] Get projects error:", error)
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] ===== POST /api/projects START =====")
    const user = await requireAuth()
    console.log("[v0] User authenticated:", user.id)

    const body = await request.json()
    console.log("[v0] Request body received:", JSON.stringify(body, null, 2))

    const { name, template, teamId, fields, columns, teamSource, roles } = body

    console.log("[v0] Parsed request data:", {
      name,
      template,
      teamId,
      fields: fields?.length,
      columns: columns?.length,
      teamSource,
      roles: roles?.length,
    })

    const projectResult = await sql`
      INSERT INTO projects (name, created_by)
      VALUES (${name}, ${user.id})
      RETURNING *
    `
    const project = projectResult[0]
    console.log("[v0] Project created:", project.id)

    if (template === "team-based" && teamId && fields) {
      console.log("[v0] Creating team-based hierarchy...")
      await createTeamBasedHierarchy(project.id, teamId, fields)
    } else if (template === "custom" && teamSource && fields) {
      console.log("[v0] Creating custom hierarchy with teamSource:", teamSource)
      await createCustomHierarchy(project.id, teamSource === "all" ? null : teamSource, fields)
    } else if (template === "role-based" && roles && fields) {
      console.log("[v0] Creating role-based hierarchy with roles:", roles)
      await createRoleBasedHierarchy(project.id, teamSource === "all" ? null : teamSource, roles, fields)
    } else {
      console.log("[v0] Creating simple project with no hierarchy")
    }

    console.log("[v0] Project creation complete, returning:", project.id)
    return NextResponse.json({ project })
  } catch (error) {
    console.error("[v0] Create project error:", error)
    return NextResponse.json({ error: "Failed to create project", details: String(error) }, { status: 500 })
  }
}

async function createTeamBasedHierarchy(projectId: string, teamId: string, fieldTemplateIds: string[]) {
  try {
    const membersData = await executeWithRetry(async () => {
      return await sql`
        SELECT e.id, e.employee_id, e.full_name, e.phone_number, e.gitlab_username, e.official_mail, r.name as role_name, e.role
        FROM users e
        LEFT JOIN roles r ON e.role = r.name
        WHERE e.team_id = ${teamId}::uuid
        ORDER BY e.role, e.full_name
      `
    })

    // Create team tier
    const teamTierResult = await executeWithRetry(async () => {
      return await sql`
        INSERT INTO tiers (project_id, name, level, allow_child_creation)
        VALUES (${projectId}, 'Team', 1, true)
        RETURNING *
      `
    })
    const teamTierId = teamTierResult[0].id
    console.log("[v0] ✓ Created team tier:", "Team", "with ID:", teamTierId)

    // Group members by role
    const membersByRole: Record<string, any[]> = {}
    membersData.forEach((member: any) => {
      const roleName = member.role_name || "Unassigned"
      if (!membersByRole[roleName]) {
        membersByRole[roleName] = []
      }
      membersByRole[roleName].push(member)
    })

    console.log("[v0] Members grouped by role:")
    for (const [roleName, members] of Object.entries(membersByRole)) {
      console.log(`[v0]   - ${roleName}: ${members.length} members (${members.map((m) => m.full_name).join(", ")})`)
    }

    // Create role tiers and member entries
    for (const [roleName, members] of Object.entries(membersByRole)) {
      await delay(300)

      console.log(`[v0] ===== Creating role tier: ${roleName} =====`)

      // Create role tier
      const roleTierResult = await executeWithRetry(async () => {
        return await sql`
          INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
          VALUES (${projectId}, ${teamTierId}, ${roleName}, 2, false)
          RETURNING *
        `
      })
      const roleTierId = roleTierResult[0].id

      // Create member tiers with pre-populated fields
      for (const member of members) {
        await delay(300)
        await createMemberTier(projectId, roleTierId, member, fieldTemplateIds)
      }
    }
  } catch (error) {
    console.error("[v0] Create team hierarchy error:", error)
    throw error
  }
}

async function createCustomHierarchy(projectId: string, teamId: string | null, fieldTemplateIds: string[]) {
  try {
    console.log("[v0] ===== CREATING CUSTOM HIERARCHY =====")
    console.log("[v0] Project ID:", projectId)
    console.log("[v0] Team ID:", teamId)
    console.log("[v0] Field Template IDs:", fieldTemplateIds)

    let teamsData: any[] = []

    if (teamId && teamId !== "all" && teamId !== "") {
      console.log("[v0] Fetching specific team:", teamId)
      teamsData = await executeWithRetry(async () => {
        return await sql`
          SELECT id, name FROM teams WHERE id = ${teamId}::uuid
        `
      })
    } else {
      console.log("[v0] Fetching all teams")
      teamsData = await executeWithRetry(async () => {
        return await sql`
          SELECT id, name FROM teams ORDER BY name
        `
      })
    }

    console.log("[v0] Teams fetched:", teamsData.length, "teams")

    if (!teamsData || teamsData.length === 0) {
      console.log("[v0] No teams found for custom hierarchy")
      return
    }

    for (const team of teamsData) {
      console.log("[v0] ===== Processing team:", team.name, "=====")

      // Fetch all members for this team
      const membersData = await executeWithRetry(async () => {
        return await sql`
          SELECT e.id, e.employee_id, e.full_name, e.phone_number, e.gitlab_username, e.official_mail, r.name as role_name, e.role
          FROM users e
          LEFT JOIN roles r ON e.role = r.name
          WHERE e.team_id = ${team.id}::uuid
          ORDER BY e.role, e.full_name
        `
      })

      console.log("[v0] Found", membersData.length, "members for team:", team.name)

      if (membersData.length === 0) {
        console.log("[v0] No members found for team:", team.name, "- skipping")
        continue
      }

      await delay(200)

      // Create team tier
      const teamTierResult = await executeWithRetry(async () => {
        return await sql`
          INSERT INTO tiers (project_id, name, level, allow_child_creation)
          VALUES (${projectId}, ${team.name}, 1, true)
          RETURNING id
        `
      })
      const teamTierId = teamTierResult[0].id
      console.log("[v0] ✓ Created team tier:", team.name, "with ID:", teamTierId)

      // Group members by role
      const membersByRole: Record<string, any[]> = {}
      membersData.forEach((member: any) => {
        const roleName = member.role_name || "Unassigned"
        if (!membersByRole[roleName]) {
          membersByRole[roleName] = []
        }
        membersByRole[roleName].push(member)
      })

      console.log("[v0] Members grouped by role:")
      for (const [roleName, members] of Object.entries(membersByRole)) {
        console.log(`[v0]   - ${roleName}: ${members.length} members (${members.map((m) => m.full_name).join(", ")})`)
      }

      for (const [roleName, members] of Object.entries(membersByRole)) {
        console.log(`[v0] ===== Creating role tier: ${roleName} =====`)
        await delay(200)

        // Create role tier
        const roleTierResult = await executeWithRetry(async () => {
          return await sql`
            INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
            VALUES (${projectId}::uuid, ${teamTierId}::uuid, ${roleName}, 2, true)
            RETURNING id, name
          `
        })
        const roleTier = roleTierResult[0]
        console.log("[v0] ✓ Created role tier:", roleTier.name, "with ID:", roleTier.id)

        if (!members || members.length === 0) {
          console.log("[v0] No members to create for role:", roleName)
          continue
        }

        console.log(`[v0] Creating ${members.length} member tiers for role ${roleName}`)

        for (const member of members) {
          await delay(250)

          const memberTierResult = await executeWithRetry(async () => {
            return await sql`
              INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
              VALUES (${projectId}::uuid, ${roleTier.id}::uuid, ${member.full_name}, 3, false)
              RETURNING id, name
            `
          })
          const memberTier = memberTierResult[0]
          console.log("[v0] ✓ Created member tier:", memberTier.name, "with ID:", memberTier.id)

          if (fieldTemplateIds && fieldTemplateIds.length > 0) {
            // Fetch all template fields for the selected templates
            const templateFieldsResult = await executeWithRetry(async () => {
              return await sql`
                SELECT id, template_id, field_name, field_type, field_options, display_order 
                FROM template_fields 
                WHERE template_id = ANY(${fieldTemplateIds}::uuid[])
                ORDER BY template_id, display_order
              `
            })

            if (templateFieldsResult && templateFieldsResult.length > 0) {
              console.log(`[v0] Adding ${templateFieldsResult.length} fields to member: ${memberTier.name}`)

              for (const field of templateFieldsResult) {
                if (!field.field_type) {
                  console.warn("[v0] Skipping field", field.field_name, "- no field_type")
                  continue
                }

                await delay(150)

                await executeWithRetry(async () => {
                  return await sql`
                    INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order)
                    VALUES (${memberTier.id}::uuid, ${field.field_name}, ${field.field_type}, ${field.field_options || null}, ${field.display_order || 0})
                  `
                })
              }
              console.log("[v0] ✓ Added", templateFieldsResult.length, "fields to member:", memberTier.name)
            }
          }
        }

        console.log("[v0] ✓ Completed role:", roleName, "with", members.length, "members")
      }

      console.log("[v0] ✓ Completed team:", team.name)
    }

    console.log("[v0] ===== CUSTOM HIERARCHY COMPLETED =====")
  } catch (error) {
    console.error("[v0] Create custom hierarchy error:", error)
    throw error
  }
}

async function createMemberTier(projectId: string, parentTierId: string, member: any, fieldTemplateIds: string[]) {
  try {
    const memberTierResult = await executeWithRetry(async () => {
      return await sql`
        INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
        VALUES (${projectId}, ${parentTierId}, ${member.full_name}, 3, false)
        RETURNING *
      `
    })
    const memberTierId = memberTierResult[0].id
    console.log("[v0] Created member tier:", memberTierId, "for:", member.full_name)

    for (const templateId of fieldTemplateIds) {
      const templateFieldsResult = await executeWithRetry(async () => {
        return await sql`
          SELECT id, field_name, field_type, field_options, display_order FROM template_fields WHERE template_id = ${templateId}::uuid
          ORDER BY display_order
        `
      })

      for (const field of templateFieldsResult) {
        if (!field.field_type) {
          console.warn("[v0] Template field", field.field_name, "has no field_type, skipping")
          continue
        }

        await delay(200)

        await executeWithRetry(async () => {
          return await sql`
            INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order)
            VALUES (${memberTierId}, ${field.field_name}, ${field.field_type}, ${field.field_options || null}, ${field.display_order || 0})
          `
        })
        console.log("[v0] Added field:", field.field_name, "type:", field.field_type, "to member tier:", memberTierId)
      }
    }
  } catch (error) {
    console.error("[v0] Create member tier error:", error)
    throw error
  }
}

async function createRoleBasedHierarchy(
  projectId: string,
  teamId: string | null,
  roleNames: string[],
  fieldTemplateIds: string[],
) {
  try {
    console.log("[v0] ===== CREATING ROLE-BASED HIERARCHY =====")
    console.log("[v0] Project ID:", projectId)
    console.log("[v0] Team ID:", teamId)
    console.log("[v0] Selected Roles:", roleNames)
    console.log("[v0] Field Template IDs:", fieldTemplateIds)

    let teamsData: any[] = []

    if (teamId && teamId !== "all" && teamId !== "") {
      console.log("[v0] Fetching specific team:", teamId)
      teamsData = await executeWithRetry(async () => {
        return await sql`
          SELECT id, name FROM teams WHERE id = ${teamId}::uuid
        `
      })
    } else {
      console.log("[v0] Fetching all teams")
      teamsData = await executeWithRetry(async () => {
        return await sql`
          SELECT id, name FROM teams ORDER BY name
        `
      })
    }

    console.log("[v0] Teams fetched:", teamsData.length, "teams")

    if (!teamsData || teamsData.length === 0) {
      console.log("[v0] No teams found for role-based hierarchy")
      return
    }

    for (const team of teamsData) {
      console.log("[v0] ===== Processing team:", team.name, "=====")

      // Fetch members for this team that match the selected roles
      const membersData = await executeWithRetry(async () => {
        return await sql`
          SELECT e.id, e.employee_id, e.full_name, e.phone_number, e.gitlab_username, e.official_mail, r.name as role_name, e.role
          FROM users e
          LEFT JOIN roles r ON e.role = r.name
          WHERE e.team_id = ${team.id}::uuid
            AND r.name = ANY(${roleNames}::text[])
          ORDER BY e.role, e.full_name
        `
      })

      console.log("[v0] Found", membersData.length, "members for team:", team.name, "with selected roles")

      if (membersData.length === 0) {
        console.log("[v0] No members found for team:", team.name, "with selected roles - skipping")
        continue
      }

      await delay(200)

      // Create team tier
      const teamTierResult = await executeWithRetry(async () => {
        return await sql`
          INSERT INTO tiers (project_id, name, level, allow_child_creation)
          VALUES (${projectId}, ${team.name}, 1, true)
          RETURNING id
        `
      })
      const teamTierId = teamTierResult[0].id
      console.log("[v0] ✓ Created team tier:", team.name, "with ID:", teamTierId)

      // Group members by role (only the selected roles)
      const membersByRole: Record<string, any[]> = {}
      membersData.forEach((member: any) => {
        const roleName = member.role_name || "Unassigned"
        if (roleNames.includes(roleName)) {
          if (!membersByRole[roleName]) {
            membersByRole[roleName] = []
          }
          membersByRole[roleName].push(member)
        }
      })

      console.log("[v0] Members grouped by selected roles:")
      for (const [roleName, members] of Object.entries(membersByRole)) {
        console.log(`[v0]   - ${roleName}: ${members.length} members (${members.map((m) => m.full_name).join(", ")})`)
      }

      // Create role tiers only for selected roles
      for (const roleName of roleNames) {
        const members = membersByRole[roleName]

        if (!members || members.length === 0) {
          console.log(`[v0] No members for role ${roleName} in team ${team.name} - skipping`)
          continue
        }

        console.log(`[v0] ===== Creating role tier: ${roleName} =====`)
        await delay(200)

        // Create role tier
        const roleTierResult = await executeWithRetry(async () => {
          return await sql`
            INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
            VALUES (${projectId}::uuid, ${teamTierId}::uuid, ${roleName}, 2, true)
            RETURNING id, name
          `
        })
        const roleTier = roleTierResult[0]
        console.log("[v0] ✓ Created role tier:", roleTier.name, "with ID:", roleTier.id)

        console.log(`[v0] Creating ${members.length} member tiers for role ${roleName}`)

        for (const member of members) {
          await delay(250)

          const memberTierResult = await executeWithRetry(async () => {
            return await sql`
              INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation)
              VALUES (${projectId}::uuid, ${roleTier.id}::uuid, ${member.full_name}, 3, false)
              RETURNING id, name
            `
          })
          const memberTier = memberTierResult[0]
          console.log("[v0] ✓ Created member tier:", memberTier.name, "with ID:", memberTier.id)

          if (fieldTemplateIds && fieldTemplateIds.length > 0) {
            // Fetch all template fields for the selected templates
            const templateFieldsResult = await executeWithRetry(async () => {
              return await sql`
                SELECT id, template_id, field_name, field_type, field_options, display_order 
                FROM template_fields 
                WHERE template_id = ANY(${fieldTemplateIds}::uuid[])
                ORDER BY template_id, display_order
              `
            })

            if (templateFieldsResult && templateFieldsResult.length > 0) {
              console.log(`[v0] Adding ${templateFieldsResult.length} fields to member: ${memberTier.name}`)

              for (const field of templateFieldsResult) {
                if (!field.field_type) {
                  console.warn("[v0] Skipping field", field.field_name, "- no field_type")
                  continue
                }

                await delay(150)

                await executeWithRetry(async () => {
                  return await sql`
                    INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order)
                    VALUES (${memberTier.id}::uuid, ${field.field_name}, ${field.field_type}, ${field.field_options || null}, ${field.display_order || 0})
                  `
                })
              }
              console.log("[v0] ✓ Added", templateFieldsResult.length, "fields to member:", memberTier.name)
            }
          }
        }

        console.log("[v0] ✓ Completed role:", roleName, "with", members.length, "members")
      }

      console.log("[v0] ✓ Completed team:", team.name)
    }

    console.log("[v0] ===== ROLE-BASED HIERARCHY COMPLETED =====")
  } catch (error) {
    console.error("[v0] Create role-based hierarchy error:", error)
    throw error
  }
}
