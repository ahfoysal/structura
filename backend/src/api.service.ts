import { Injectable } from "@nestjs/common"
import type { Request, Response } from "express"
import { Workbook } from "exceljs"
import { PrismaService } from "./prisma.service"
import { UniversalService } from "./universal.service"

type User = {
  id: string
  email: string
  is_admin: boolean
  user_role?: string
}

@Injectable()
export class ApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly universal: UniversalService,
  ) {}

  async handle(req: Request, res: Response) {
    try {
      const path = req.path.replace(/^\/api/, "")
      const method = req.method.toUpperCase()
      const parts = path.split("/").filter(Boolean)

      if (await this.universal.canHandle(parts)) return await this.universal.handle(req, res, parts)

      if (method === "POST" && path === "/auth/login") return await this.login(req, res)
      if (method === "POST" && path === "/auth/logout") return await this.logout(res)
      if (method === "GET" && path === "/auth/me") return await this.me(req, res)
      if (method === "GET" && path === "/dropdowns") return await this.dropdowns(res)

      if (parts[0] === "users") return await this.users(req, res, parts)
      if (parts[0] === "employees") return await this.employees(req, res, parts)
      if (parts[0] === "teams") return await this.teams(req, res, parts)
      if (parts[0] === "projects") return await this.projects(req, res, parts)
      if (parts[0] === "tiers") return await this.tiers(req, res, parts)
      if (parts[0] === "field-templates") return await this.fieldTemplates(req, res, parts)

      return res.status(404).json({ error: "Not found" })
    } catch (error: any) {
      console.error("[backend] API error:", error)
      return res.status(500).json({ error: error?.message || "Internal server error" })
    }
  }

  private async rows<T = any>(query: string, ...values: any[]): Promise<T[]> {
    return await this.prisma.$queryRawUnsafe<T[]>(query, ...values)
  }

  private async one<T = any>(query: string, ...values: any[]): Promise<T | null> {
    const rows = await this.rows<T>(query, ...values)
    return rows[0] || null
  }

  private async userFromRequest(req: Request): Promise<User | null> {
    const cookieHeader = req.headers.cookie || ""
    const userId = cookieHeader
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("user_id="))
      ?.split("=")[1]

    if (!userId) return null
    return await this.one<User>("SELECT id, email, is_admin, user_role FROM users WHERE id = $1::uuid", decodeURIComponent(userId))
  }

  private async requireAuth(req: Request, admin = false) {
    const user = await this.userFromRequest(req)
    if (!user) {
      const error = new Error("Unauthorized")
      ;(error as any).status = 401
      throw error
    }
    if (admin && !user.is_admin) {
      const error = new Error("Admin access required")
      ;(error as any).status = 403
      throw error
    }
    return user
  }

  private async login(req: Request, res: Response) {
    const { email, employeeId, password, loginType } = req.body || {}
    let user: any

    if (loginType === "employee") {
      user = await this.one(
        "SELECT id, email, is_admin, employee_id, password_hash, user_role FROM users WHERE employee_id = $1",
        employeeId,
      )
      if (!user || password !== "123456") return res.status(401).json({ error: "Invalid credentials" })
    } else {
      user = await this.one("SELECT id, email, is_admin, password_hash, user_role FROM users WHERE email = $1", email)
      if (!user || user.password_hash !== password) return res.status(401).json({ error: "Invalid credentials" })
    }

    res.cookie("user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    })

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin,
        user_role: user.user_role || (user.is_admin ? "admin" : "user"),
      },
    })
  }

  private logout(res: Response) {
    res.clearCookie("user_id")
    return res.json({ success: true })
  }

  private async me(req: Request, res: Response) {
    const user = await this.userFromRequest(req)
    return res.json({ user })
  }

  private async dropdowns(res: Response) {
    const [roles, shifts, statuses] = await Promise.all([
      this.rows("SELECT id, name FROM roles ORDER BY name ASC"),
      this.rows("SELECT id, name FROM shifts ORDER BY name ASC"),
      this.rows("SELECT id, name FROM statuses ORDER BY name ASC"),
    ])
    return res.json({ roles, shifts, statuses })
  }

  private async users(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const current = await this.requireAuth(req, true)

    if (parts.length === 1 && method === "GET") {
      const users = await this.rows("SELECT id, email, is_admin, created_at FROM users ORDER BY created_at DESC")
      return res.json({ users })
    }

    if (parts.length === 1 && method === "POST") {
      const { email, password, is_admin } = req.body || {}
      const existing = await this.one("SELECT id FROM users WHERE email = $1", email)
      if (existing) return res.status(400).json({ error: "User already exists" })
      const user = await this.one(
        "INSERT INTO users (email, password_hash, is_admin, user_role) VALUES ($1, $2, $3, $4) RETURNING id, email, is_admin, created_at",
        email,
        password,
        Boolean(is_admin),
        is_admin ? "admin" : "employee",
      )
      return res.json({ user })
    }

    if (parts.length === 2 && method === "PATCH") {
      const { is_admin } = req.body || {}
      const user = await this.one(
        "UPDATE users SET is_admin = $1, user_role = $2 WHERE id = $3::uuid RETURNING id, email, is_admin",
        Boolean(is_admin),
        is_admin ? "admin" : "employee",
        parts[1],
      )
      return res.json({ user })
    }

    if (parts.length === 2 && method === "DELETE") {
      if (current.id === parts[1]) return res.status(400).json({ error: "Cannot delete your own account" })
      await this.rows("DELETE FROM users WHERE id = $1::uuid", parts[1])
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async employees(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    await this.requireAuth(req, true)

    if (parts[1] === "bulk-import" && method === "POST") return await this.bulkImportEmployees(req, res)

    if (parts.length === 1 && method === "GET") {
      const employees = await this.rows(
        `SELECT u.*, t.name as team_name
         FROM users u
         LEFT JOIN teams t ON u.team_id = t.id
         WHERE u.email != 'admin@example.com'
         ORDER BY u.full_name ASC`,
      )
      return res.json({ employees })
    }

    if (parts.length === 1 && method === "POST") {
      const body = req.body || {}
      if (!body.employee_id || !body.full_name || !body.role || !body.team_id || !body.shift || !body.status) {
        return res.status(400).json({ error: "Missing required fields: employee_id, full_name, role, team_id, shift, status" })
      }
      const employee = await this.one(
        `INSERT INTO users (
          employee_id, full_name, phone_number, gitlab_username, official_mail, role, team_id, shift, status,
          is_project_lead, email, password_hash, user_role, is_admin
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10,$11,$12,'employee',false)
        RETURNING id, employee_id, full_name, role, team_id, shift, status, is_project_lead`,
        body.employee_id,
        body.full_name,
        body.phone_number || null,
        body.gitlab_username || null,
        body.official_mail || null,
        body.role,
        body.team_id,
        body.shift,
        body.status,
        Boolean(body.is_project_lead),
        body.official_mail || `${body.employee_id}@company.com`,
        "123456",
      )
      return res.json({ employee })
    }

    if (parts.length === 2 && ["PATCH", "PUT"].includes(method)) {
      const employee = await this.updateUser(parts[1], req.body || {})
      return res.json({ employee })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM users WHERE id = $1::uuid", parts[1])
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async updateUser(id: string, updates: Record<string, any>) {
    const allowed = [
      "employee_id",
      "full_name",
      "phone_number",
      "gitlab_username",
      "official_mail",
      "role",
      "team_id",
      "shift",
      "status",
      "is_project_lead",
      "email",
      "is_admin",
      "user_role",
    ]
    const entries = Object.entries(updates).filter(([key]) => allowed.includes(key))
    if (!entries.length) return await this.one("SELECT * FROM users WHERE id = $1::uuid", id)
    const setSql = entries.map(([key], index) => `${key} = $${index + 1}`).join(", ")
    const values = entries.map(([, value]) => value)
    values.push(id)
    return await this.one(`UPDATE users SET ${setSql}, updated_at = NOW() WHERE id = $${values.length}::uuid RETURNING *`, ...values)
  }

  private async bulkImportEmployees(req: Request, res: Response) {
    const employees = Array.isArray(req.body?.employees) ? req.body.employees : []
    if (!employees.length) return res.status(400).json({ error: "No employees to import" })

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (let idx = 0; idx < employees.length; idx++) {
      const emp = employees[idx]
      try {
        const employeeId = String(emp.E_ID || "").trim()
        const fullName = String(emp.Name || "").trim()
        const roleName = String(emp.Role || "").trim()
        const teamName = String(emp.Team || "").trim()
        const shiftName = String(emp.Shift || "").trim()
        const statusName = String(emp.Status || "").trim()
        if (!employeeId || !fullName || !roleName || !teamName || !shiftName || !statusName) {
          skipped++
          res.write(`data: ${JSON.stringify({ current: idx + 1, total: employees.length, created, updated, skipped, message: `Skipping ${fullName || employeeId} - missing required fields` })}\n\n`)
          continue
        }

        const team = await this.one<{ id: string }>(
          "INSERT INTO teams (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
          teamName,
        )
        await this.rows("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", roleName)
        await this.rows("INSERT INTO shifts (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", shiftName)
        await this.rows("INSERT INTO statuses (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", statusName)

        const existing = await this.one<{ id: string }>("SELECT id FROM users WHERE employee_id = $1", employeeId)
        const email = emp["Official Mail"] || `${employeeId}@company.com`
        if (existing) {
          await this.updateUser(existing.id, {
            full_name: fullName,
            phone_number: emp["Phone Number"]?.toString() || null,
            gitlab_username: emp["Gitlab Username"] || null,
            official_mail: emp["Official Mail"] || null,
            role: roleName,
            team_id: team?.id,
            shift: shiftName,
            status: statusName,
            is_project_lead: emp.PL === "TRUE",
            email,
          })
          updated++
        } else {
          await this.rows(
            `INSERT INTO users (
              employee_id, full_name, phone_number, gitlab_username, official_mail, role, team_id, shift, status,
              is_project_lead, email, password_hash, user_role, is_admin
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10,$11,'123456','employee',false)`,
            employeeId,
            fullName,
            emp["Phone Number"]?.toString() || null,
            emp["Gitlab Username"] || null,
            emp["Official Mail"] || null,
            roleName,
            team?.id,
            shiftName,
            statusName,
            emp.PL === "TRUE",
            email,
          )
          created++
        }
        res.write(`data: ${JSON.stringify({ current: idx + 1, total: employees.length, created, updated, skipped, message: `${existing ? "Updated" : "Imported"} ${fullName}` })}\n\n`)
      } catch (error: any) {
        skipped++
        errors.push(`${emp.Name}: ${error.message}`)
        res.write(`data: ${JSON.stringify({ current: idx + 1, total: employees.length, created, updated, skipped, message: `Error: ${emp.Name} - ${error.message}`, error: true })}\n\n`)
      }
    }

    res.write(`data: ${JSON.stringify({ complete: true, created, updated, skipped, errors: errors.length ? errors : undefined })}\n\n`)
    return res.end()
  }

  private async teams(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()

    if (parts[1] === "members" && method === "GET") {
      await this.requireAuth(req)
      const teams = await this.rows(
        `SELECT t.id, t.name, COALESCE(json_agg(u.*) FILTER (WHERE u.id IS NOT NULL), '[]') as members
         FROM teams t
         LEFT JOIN users u ON u.team_id = t.id
         GROUP BY t.id
         ORDER BY t.name ASC`,
      )
      return res.json({ teams })
    }

    await this.requireAuth(req, method !== "GET")

    if (parts.length === 1 && method === "GET") {
      const teams = await this.rows("SELECT * FROM teams ORDER BY name ASC")
      return res.json({ teams })
    }

    if (parts.length === 1 && method === "POST") {
      const team = await this.one("INSERT INTO teams (name) VALUES ($1) RETURNING *", req.body?.name)
      return res.json({ team })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM teams WHERE id = $1::uuid", parts[1])
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async projects(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const user = await this.requireAuth(req)

    if (parts.length === 1 && method === "GET") {
      const projects = await this.rows("SELECT * FROM projects ORDER BY created_at DESC")
      return res.json({ projects })
    }

    if (parts.length === 1 && method === "POST") {
      const project = await this.one(
        "INSERT INTO projects (name, created_by) VALUES ($1, $2::uuid) RETURNING *",
        req.body?.name,
        user.id,
      )
      return res.json({ project })
    }

    const projectId = parts[1]
    if (!projectId) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM projects WHERE id = $1::uuid", projectId)
      return res.json({ success: true })
    }

    if (parts.length === 2 && method === "POST") {
      const project = await this.one("UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2::uuid RETURNING *", req.body?.name, projectId)
      return res.json({ project })
    }

    if (parts[2] === "tiers") return await this.projectTiers(req, res, projectId)
    if (parts[2] === "fields") return await this.projectFields(req, res, projectId)
    if (parts[2] === "export" && method === "GET") return await this.exportProject(res, projectId)

    return res.status(404).json({ error: "Not found" })
  }

  private async projectTiers(req: Request, res: Response, projectId: string) {
    const method = req.method.toUpperCase()

    if (method === "GET") {
      const tiers = await this.rows("SELECT * FROM tiers WHERE project_id = $1::uuid ORDER BY level ASC, display_order ASC, created_at ASC", projectId)
      return res.json({ tiers })
    }

    if (method === "POST") {
      const { name, parent_id, allow_child_creation = true, allow_field_management = false, tier_color = null } = req.body || {}
      const parent = parent_id ? await this.one<any>("SELECT level FROM tiers WHERE id = $1::uuid", parent_id) : null
      const level = parent ? Number(parent.level) + 1 : 0
      const order = await this.one<{ next_order: number }>(
        "SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tiers WHERE project_id = $1::uuid AND parent_id IS NOT DISTINCT FROM $2::uuid",
        projectId,
        parent_id || null,
      )
      const tier = await this.one(
        `INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation, allow_field_management, tier_color, display_order)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        projectId,
        parent_id || null,
        name,
        level,
        Boolean(allow_child_creation),
        Boolean(allow_field_management),
        tier_color,
        order?.next_order || 0,
      )
      return res.json({ tier })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async projectFields(req: Request, res: Response, projectId: string) {
    const method = req.method.toUpperCase()
    if (method === "GET") {
      const fields = await this.rows("SELECT * FROM tier_fields WHERE tier_id IN (SELECT id FROM tiers WHERE project_id = $1::uuid) ORDER BY display_order", projectId)
      return res.json({ fields })
    }
    return res.status(410).json({ error: "Project fields are replaced by tier fields" })
  }

  private async tiers(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    await this.requireAuth(req)
    const tierId = parts[1]
    if (!tierId) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "PATCH") {
      const body = req.body || {}
      if (body.name !== undefined) await this.rows("UPDATE tiers SET name = $1, updated_at = NOW() WHERE id = $2::uuid", body.name, tierId)
      if (body.allow_child_creation !== undefined) await this.rows("UPDATE tiers SET allow_child_creation = $1, updated_at = NOW() WHERE id = $2::uuid", Boolean(body.allow_child_creation), tierId)
      return res.json({ success: true })
    }

    if (parts.length === 2 && method === "DELETE") return await this.deleteTier(res, tierId)
    if (parts.length === 2 && method === "POST") return await this.duplicateTier(res, tierId)
    if (parts[2] === "reorder" && method === "PATCH") return await this.reorderTier(req, res, tierId)
    if (parts[2] === "fields") return await this.tierFields(req, res, parts, tierId)
    if (parts[2] === "data") return await this.tierData(req, res, tierId)
    if (parts[2] === "import-template" && method === "POST") return await this.importTemplate(req, res, tierId)
    if (parts[2] === "export" && method === "GET") return await this.exportTier(res, tierId)

    return res.status(404).json({ error: "Not found" })
  }

  private async tierFields(req: Request, res: Response, parts: string[], tierId: string) {
    const method = req.method.toUpperCase()

    if (method === "GET") {
      const fields = await this.rows("SELECT * FROM tier_fields WHERE tier_id = $1::uuid ORDER BY display_order", tierId)
      return res.json({ fields })
    }

    if (method === "POST") {
      const order = await this.one<{ next_order: number }>("SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tier_fields WHERE tier_id = $1::uuid", tierId)
      const field = await this.one(
        `INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        tierId,
        req.body?.field_name,
        req.body?.field_type || "string",
        req.body?.field_options || null,
        order?.next_order || 0,
      )
      return res.json({ field })
    }

    if (method === "DELETE") {
      const fieldId = parts[3] || String(req.query.fieldId || "")
      if (!fieldId) return res.status(400).json({ error: "Field ID required" })
      await this.rows("DELETE FROM tier_fields WHERE id = $1::uuid AND tier_id = $2::uuid", fieldId, tierId)
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async tierData(req: Request, res: Response, tierId: string) {
    const method = req.method.toUpperCase()
    if (method === "GET") {
      const data = await this.rows("SELECT field_id, value, text_value FROM tier_data WHERE tier_id = $1::uuid", tierId)
      return res.json({ data })
    }

    if (method === "PUT") {
      const { field_id, value, field_type } = req.body || {}
      if (["string", "text", "date", "dropdown"].includes(field_type)) {
        await this.rows(
          `INSERT INTO tier_data (tier_id, field_id, text_value, value)
           VALUES ($1::uuid, $2::uuid, $3, NULL)
           ON CONFLICT (tier_id, field_id) DO UPDATE SET text_value = $3, value = NULL, updated_at = NOW()`,
          tierId,
          field_id,
          value ?? "",
        )
      } else {
        await this.rows(
          `INSERT INTO tier_data (tier_id, field_id, value, text_value)
           VALUES ($1::uuid, $2::uuid, $3, NULL)
           ON CONFLICT (tier_id, field_id) DO UPDATE SET value = $3, text_value = NULL, updated_at = NOW()`,
          tierId,
          field_id,
          value === "" || value === null || value === undefined ? null : Number(value),
        )
      }
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async deleteTier(res: Response, tierId: string) {
    const ids = await this.rows<{ id: string }>(
      `WITH RECURSIVE tier_tree AS (
        SELECT id FROM tiers WHERE id = $1::uuid
        UNION ALL
        SELECT t.id FROM tiers t INNER JOIN tier_tree tt ON t.parent_id = tt.id
      ) SELECT id FROM tier_tree`,
      tierId,
    )
    if (!ids.length) return res.status(404).json({ error: "Tier not found" })
    await this.rows("DELETE FROM tiers WHERE id = ANY($1::uuid[])", ids.map((tier) => tier.id))
    return res.json({ success: true })
  }

  private async duplicateTier(res: Response, tierId: string) {
    const root = await this.one<any>("SELECT * FROM tiers WHERE id = $1::uuid", tierId)
    if (!root) return res.status(404).json({ error: "Tier not found" })
    const clone = await this.one<any>(
      `INSERT INTO tiers (project_id, parent_id, name, level, allow_child_creation, allow_field_management, tier_color, display_order)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) RETURNING *`,
      root.project_id,
      root.parent_id,
      `${root.name} Copy`,
      root.level,
      root.allow_child_creation,
      root.allow_field_management,
      root.tier_color,
      root.display_order + 1,
    )
    const fields = await this.rows<any>("SELECT * FROM tier_fields WHERE tier_id = $1::uuid", tierId)
    for (const field of fields) {
      await this.rows(
        "INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order) VALUES ($1::uuid,$2,$3,$4,$5)",
        clone.id,
        field.field_name,
        field.field_type,
        field.field_options,
        field.display_order,
      )
    }
    return res.json({ success: true })
  }

  private async reorderTier(req: Request, res: Response, tierId: string) {
    const { newIndex, parentId, newParentId } = req.body || {}
    const targetParent = newParentId !== undefined ? newParentId : parentId
    await this.rows("UPDATE tiers SET parent_id = $1::uuid WHERE id = $2::uuid", targetParent || null, tierId)
    const siblings = await this.rows<{ id: string }>(
      "SELECT id FROM tiers WHERE parent_id IS NOT DISTINCT FROM $1::uuid ORDER BY display_order ASC, created_at ASC",
      targetParent || null,
    )
    const reordered = siblings.filter((sibling) => sibling.id !== tierId)
    reordered.splice(Number(newIndex), 0, { id: tierId })
    for (let i = 0; i < reordered.length; i++) {
      await this.rows("UPDATE tiers SET display_order = $1 WHERE id = $2::uuid", i, reordered[i].id)
    }
    return res.json({ success: true })
  }

  private async importTemplate(req: Request, res: Response, tierId: string) {
    const fields = await this.rows<any>(
      "SELECT field_name, field_type, field_options, display_order FROM template_fields WHERE template_id = $1::uuid ORDER BY display_order ASC",
      req.body?.templateId,
    )
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index]
      await this.rows(
        "INSERT INTO tier_fields (tier_id, field_name, field_type, field_options, display_order) VALUES ($1::uuid,$2,$3,$4,$5)",
        tierId,
        field.field_name,
        field.field_type,
        field.field_options || null,
        index,
      )
    }
    return res.json({ success: true, fieldsAdded: fields.length })
  }

  private async fieldTemplates(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const user = await this.requireAuth(req)

    if (parts.length === 1 && method === "GET") {
      const templates = await this.rows("SELECT * FROM field_templates ORDER BY is_system DESC, created_at DESC")
      return res.json({ templates })
    }

    if (parts.length === 1 && method === "POST") {
      const template = await this.one(
        "INSERT INTO field_templates (name, description, created_by, is_system) VALUES ($1,$2,$3::uuid,false) RETURNING *",
        req.body?.name,
        req.body?.description || null,
        user.id,
      )
      return res.json({ template })
    }

    const id = parts[1]
    if (parts.length === 2 && method === "GET") {
      const template = await this.one("SELECT * FROM field_templates WHERE id = $1::uuid", id)
      return res.json({ template })
    }
    if (parts.length === 2 && method === "PUT") {
      const template = await this.one("UPDATE field_templates SET name = $1, description = $2, updated_at = NOW() WHERE id = $3::uuid RETURNING *", req.body?.name, req.body?.description || null, id)
      return res.json({ template })
    }
    if (parts.length === 2 && method === "DELETE") {
      const current = await this.requireAuth(req, true)
      if (!current.is_admin) return res.status(403).json({ error: "Only admins can delete templates" })
      await this.rows("DELETE FROM field_templates WHERE id = $1::uuid AND is_system = false", id)
      return res.json({ success: true })
    }

    if (parts[2] === "fields") {
      if (parts.length === 3 && method === "GET") {
        const fields = await this.rows("SELECT id, field_name, field_type, field_options, display_order FROM template_fields WHERE template_id = $1::uuid ORDER BY display_order ASC", id)
        return res.json({ fields })
      }
      if (parts.length === 3 && method === "POST") {
        const order = await this.one<{ next_order: number }>("SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM template_fields WHERE template_id = $1::uuid", id)
        const field = await this.one(
          "INSERT INTO template_fields (template_id, field_name, field_type, field_options, display_order) VALUES ($1::uuid,$2,$3,$4,$5) RETURNING *",
          id,
          req.body?.field_name,
          req.body?.field_type || "string",
          req.body?.field_options || null,
          order?.next_order || 0,
        )
        return res.json({ field })
      }
      if (parts.length === 4 && method === "DELETE") {
        await this.rows("DELETE FROM template_fields WHERE id = $1::uuid AND template_id = $2::uuid", parts[3], id)
        return res.json({ success: true })
      }
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async exportProject(res: Response, projectId: string) {
    const tiers = await this.rows<any>("SELECT id FROM tiers WHERE project_id = $1::uuid ORDER BY level, display_order", projectId)
    return await this.writeWorkbook(res, tiers.map((tier) => tier.id), `project-export-${Date.now()}.xlsx`)
  }

  private async exportTier(res: Response, tierId: string) {
    const tiers = await this.rows<any>(
      `WITH RECURSIVE tier_tree AS (
        SELECT id FROM tiers WHERE id = $1::uuid
        UNION ALL
        SELECT t.id FROM tiers t JOIN tier_tree tt ON t.parent_id = tt.id
      ) SELECT id FROM tier_tree`,
      tierId,
    )
    return await this.writeWorkbook(res, tiers.map((tier) => tier.id), `tier-export-${Date.now()}.xlsx`)
  }

  private async writeWorkbook(res: Response, tierIds: string[], filename: string) {
    const workbook = new Workbook()
    for (const tierId of tierIds) {
      const tier = await this.one<any>("SELECT name FROM tiers WHERE id = $1::uuid", tierId)
      if (!tier) continue
      const fields = await this.rows<any>("SELECT id, field_name FROM tier_fields WHERE tier_id = $1::uuid ORDER BY display_order", tierId)
      const data = await this.rows<any>("SELECT field_id, value, text_value FROM tier_data WHERE tier_id = $1::uuid", tierId)
      const worksheet = workbook.addWorksheet(String(tier.name).substring(0, 31))
      worksheet.addRow(fields.map((field) => field.field_name))
      worksheet.addRow(fields.map((field) => {
        const value = data.find((row) => row.field_id === field.id)
        return value ? value.text_value ?? value.value ?? "" : ""
      }))
      worksheet.getRow(1).font = { bold: true }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    return res.send(Buffer.from(buffer))
  }
}
