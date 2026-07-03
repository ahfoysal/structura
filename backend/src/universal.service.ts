import { Injectable } from "@nestjs/common"
import type { Request, Response } from "express"
import { PrismaService } from "./prisma.service"
import { UniversalFormulaEngine } from "./universal-engine"

@Injectable()
export class UniversalService {
  private readonly engine = new UniversalFormulaEngine()

  constructor(private readonly prisma: PrismaService) {}

  async canHandle(parts: string[]) {
    return ["workspaces", "models", "nodes", "node-types", "fields", "relation-types", "relationships"].includes(parts[0])
  }

  async handle(req: Request, res: Response, parts: string[]) {
    if (parts[0] === "workspaces") return this.workspaces(req, res, parts)
    if (parts[0] === "models") return this.models(req, res, parts)
    if (parts[0] === "nodes") return this.nodes(req, res, parts)
    if (parts[0] === "node-types") return this.nodeTypes(req, res, parts)
    if (parts[0] === "fields") return this.fields(req, res, parts)
    if (parts[0] === "relation-types") return this.relationTypes(req, res, parts)
    if (parts[0] === "relationships") return this.relationships(req, res, parts)
    return res.status(404).json({ error: "Not found" })
  }

  private async rows<T = any>(query: string, ...values: any[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(query, ...values)
  }

  private async one<T = any>(query: string, ...values: any[]): Promise<T | null> {
    const rows = await this.rows<T>(query, ...values)
    return rows[0] || null
  }

  private keyFromName(name: string) {
    return String(name || "field")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "field"
  }

  private async workspaces(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()

    if (parts.length === 1 && method === "GET") {
      const workspaces = await this.rows("SELECT * FROM workspaces ORDER BY updated_at DESC, created_at DESC")
      return res.json({ workspaces })
    }

    if (parts.length === 1 && method === "POST") {
      const workspace = await this.one(
        "INSERT INTO workspaces (name, description) VALUES ($1, $2) RETURNING *",
        req.body?.name || "Untitled Workspace",
        req.body?.description || null,
      )
      return res.json({ workspace })
    }

    if (parts.length === 2 && method === "PATCH") {
      const workspace = await this.one(
        `UPDATE workspaces SET
          name = COALESCE($1, name),
          description = $2,
          updated_at = NOW()
        WHERE id = $3::uuid
        RETURNING *`,
        req.body?.name || null,
        req.body?.description ?? null,
        parts[1],
      )
      return res.json({ workspace })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM workspaces WHERE id = $1::uuid", parts[1])
      return res.json({ success: true })
    }

    if (parts.length === 3 && parts[2] === "models" && method === "GET") {
      const models = await this.rows("SELECT * FROM data_models WHERE workspace_id = $1::uuid ORDER BY created_at ASC", parts[1])
      return res.json({ models })
    }

    if (parts.length === 3 && parts[2] === "models" && method === "POST") {
      const model = await this.one(
        "INSERT INTO data_models (workspace_id, name, description) VALUES ($1::uuid, $2, $3) RETURNING *",
        parts[1],
        req.body?.name || "Untitled Model",
        req.body?.description || null,
      )
      await this.bootstrapModel(model.id)
      return res.json({ model })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async models(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const modelId = parts[1]
    if (!modelId) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "PATCH") {
      const model = await this.one(
        `UPDATE data_models SET
          name = COALESCE($1, name),
          description = $2,
          updated_at = NOW()
        WHERE id = $3::uuid
        RETURNING *`,
        req.body?.name || null,
        req.body?.description ?? null,
        modelId,
      )
      return res.json({ model })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM data_models WHERE id = $1::uuid", modelId)
      return res.json({ success: true })
    }

    if (parts.length === 3 && parts[2] === "snapshot" && method === "GET") {
      return res.json(await this.snapshot(modelId))
    }

    if (parts.length === 3 && parts[2] === "node-types" && method === "GET") {
      const nodeTypes = await this.rows("SELECT * FROM node_types WHERE model_id = $1::uuid ORDER BY sort_order ASC, name ASC", modelId)
      return res.json({ nodeTypes })
    }

    if (parts.length === 3 && parts[2] === "node-types" && method === "POST") {
      const nodeType = await this.one(
        `INSERT INTO node_types (model_id, name, color, icon, sort_order)
         VALUES ($1::uuid, $2, $3, $4, $5)
         ON CONFLICT (model_id, name)
         DO UPDATE SET color = EXCLUDED.color, icon = EXCLUDED.icon, updated_at = NOW()
         RETURNING *`,
        modelId,
        req.body?.name || "Type",
        req.body?.color || "#2563eb",
        req.body?.icon || "box",
        Number(req.body?.sort_order || 0),
      )
      return res.json({ nodeType })
    }

    if (parts.length === 3 && parts[2] === "fields" && method === "GET") {
      const fields = await this.fieldsForModel(modelId)
      return res.json({ fields })
    }

    if (parts.length === 3 && parts[2] === "fields" && method === "POST") {
      const name = req.body?.name || "Field"
      const key = req.body?.key || this.keyFromName(name)
      const field = await this.one(
        `INSERT INTO dynamic_fields (
          model_id, node_type_id, name, key, field_type, behavior, config, required, hidden, locked, sort_order
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
        ON CONFLICT (model_id, key)
        DO UPDATE SET name = EXCLUDED.name, field_type = EXCLUDED.field_type, behavior = EXCLUDED.behavior,
          config = EXCLUDED.config, required = EXCLUDED.required, hidden = EXCLUDED.hidden,
          locked = EXCLUDED.locked, updated_at = NOW()
        RETURNING *`,
        modelId,
        req.body?.node_type_id || null,
        name,
        key,
        req.body?.field_type || "text",
        req.body?.behavior || "manual",
        JSON.stringify(req.body?.config || {}),
        Boolean(req.body?.required),
        Boolean(req.body?.hidden),
        Boolean(req.body?.locked),
        Number(req.body?.sort_order || 0),
      )
      if (req.body?.expression || ["formula", "rollup", "lookup"].includes(req.body?.behavior)) {
        await this.rows(
          "INSERT INTO formula_definitions (field_id, expression) VALUES ($1::uuid, $2) ON CONFLICT (field_id) DO UPDATE SET expression = EXCLUDED.expression, updated_at = NOW()",
          field.id,
          req.body?.expression || "0",
        )
      } else {
        await this.rows("DELETE FROM formula_definitions WHERE field_id = $1::uuid", field.id)
      }
      return res.json({ field })
    }

    if (parts.length === 3 && parts[2] === "nodes" && method === "GET") {
      const nodes = await this.nodesForModel(modelId)
      return res.json({ nodes })
    }

    if (parts.length === 3 && parts[2] === "nodes" && method === "POST") {
      const node = await this.createNode(modelId, req.body || {})
      return res.json({ node })
    }

    if (parts.length === 3 && parts[2] === "relation-types" && method === "GET") {
      const relationTypes = await this.rows("SELECT * FROM relation_types WHERE model_id = $1::uuid ORDER BY name ASC", modelId)
      return res.json({ relationTypes })
    }

    if (parts.length === 3 && parts[2] === "relation-types" && method === "POST") {
      const name = req.body?.name || "Related To"
      const relationType = await this.one(
        `INSERT INTO relation_types (model_id, name, key, cardinality, config)
         VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
         ON CONFLICT (model_id, key)
         DO UPDATE SET name = EXCLUDED.name, cardinality = EXCLUDED.cardinality, config = EXCLUDED.config, updated_at = NOW()
         RETURNING *`,
        modelId,
        name,
        req.body?.key || this.keyFromName(name),
        req.body?.cardinality || "many_to_many",
        JSON.stringify(req.body?.config || {}),
      )
      return res.json({ relationType })
    }

    if (parts.length === 3 && parts[2] === "calculate" && method === "POST") {
      const results = await this.recalculateModel(modelId)
      return res.json({ results })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async nodes(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const nodeId = parts[1]
    if (!nodeId) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "PATCH") {
      const existing = await this.one<any>("SELECT * FROM nodes WHERE id = $1::uuid", nodeId)
      const nextParentId = Object.prototype.hasOwnProperty.call(req.body || {}, "parent_id")
        ? req.body.parent_id || null
        : existing?.parent_id || null
      if (nextParentId === nodeId) return res.status(400).json({ error: "A node cannot be its own parent" })
      const parent = nextParentId ? await this.one<any>("SELECT * FROM nodes WHERE id = $1::uuid", nextParentId) : null
      const depth = nextParentId ? Number(parent?.depth || 0) + 1 : 0
      const path = nextParentId ? `${parent?.path || ""}/${nextParentId}` : ""
      const nextTypeId = Object.prototype.hasOwnProperty.call(req.body || {}, "node_type_id")
        ? req.body.node_type_id || null
        : existing?.node_type_id || null
      const node = await this.one(
        `UPDATE nodes SET
          name = COALESCE($1, name),
          node_type_id = $2::uuid,
          parent_id = $3::uuid,
          depth = $4,
          path = $5,
          updated_at = NOW()
        WHERE id = $6::uuid RETURNING *`,
        req.body?.name || null,
        nextTypeId,
        nextParentId,
        depth,
        path,
        nodeId,
      )
      await this.recalculateModel(node.model_id)
      return res.json({ node })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM nodes WHERE id = $1::uuid", nodeId)
      return res.json({ success: true })
    }

    if (parts.length === 3 && parts[2] === "values" && method === "GET") {
      const values = await this.rows(
        `SELECT fv.*, df.key as field_key, df.name as field_name, df.field_type, df.behavior
         FROM field_values fv
         JOIN dynamic_fields df ON df.id = fv.field_id
         WHERE fv.node_id = $1::uuid
         ORDER BY df.sort_order ASC, df.name ASC`,
        nodeId,
      )
      const calculations = await this.rows(
        `SELECT cr.*, df.key as field_key, df.name as field_name, df.field_type, df.behavior
         FROM calculation_results cr
         JOIN dynamic_fields df ON df.id = cr.field_id
         WHERE cr.node_id = $1::uuid`,
        nodeId,
      )
      return res.json({ values, calculations })
    }

    if (parts.length === 3 && parts[2] === "values" && method === "PUT") {
      const updates = Array.isArray(req.body?.values) ? req.body.values : [req.body]
      const saved = []
      for (const update of updates) {
        const field = update.field_id
          ? await this.one<any>("SELECT * FROM dynamic_fields WHERE id = $1::uuid", update.field_id)
          : await this.one<any>("SELECT * FROM dynamic_fields WHERE model_id = (SELECT model_id FROM nodes WHERE id = $1::uuid) AND key = $2", nodeId, update.field_key)
        if (!field) continue
        saved.push(await this.saveValue(nodeId, field, update.value))
      }
      const node = await this.one<any>("SELECT model_id FROM nodes WHERE id = $1::uuid", nodeId)
      if (node?.model_id) await this.recalculateModel(node.model_id)
      return res.json({ values: saved })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async nodeTypes(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const id = parts[1]
    if (!id) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "PATCH") {
      const nodeType = await this.one(
        `UPDATE node_types SET
          name = COALESCE($1, name),
          color = COALESCE($2, color),
          icon = COALESCE($3, icon),
          updated_at = NOW()
        WHERE id = $4::uuid RETURNING *`,
        req.body?.name || null,
        req.body?.color || null,
        req.body?.icon || null,
        id,
      )
      return res.json({ nodeType })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM node_types WHERE id = $1::uuid", id)
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async fields(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const id = parts[1]
    if (!id) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "PATCH") {
      const current = await this.one<any>("SELECT * FROM dynamic_fields WHERE id = $1::uuid", id)
      const name = req.body?.name || current?.name
      const key = req.body?.key || current?.key || this.keyFromName(name)
      const field = await this.one(
        `UPDATE dynamic_fields SET
          name = $1,
          key = $2,
          field_type = $3,
          behavior = $4,
          node_type_id = $5::uuid,
          config = $6::jsonb,
          required = $7,
          hidden = $8,
          locked = $9,
          updated_at = NOW()
        WHERE id = $10::uuid RETURNING *`,
        name,
        key,
        req.body?.field_type || current?.field_type || "text",
        req.body?.behavior || current?.behavior || "manual",
        req.body?.node_type_id ?? current?.node_type_id ?? null,
        JSON.stringify(req.body?.config || current?.config || {}),
        req.body?.required ?? current?.required ?? false,
        req.body?.hidden ?? current?.hidden ?? false,
        req.body?.locked ?? current?.locked ?? false,
        id,
      )
      if (req.body?.expression !== undefined || ["formula", "rollup", "lookup"].includes(field.behavior)) {
        await this.rows(
          "INSERT INTO formula_definitions (field_id, expression) VALUES ($1::uuid, $2) ON CONFLICT (field_id) DO UPDATE SET expression = EXCLUDED.expression, updated_at = NOW()",
          id,
          req.body?.expression || "0",
        )
      } else {
        await this.rows("DELETE FROM formula_definitions WHERE field_id = $1::uuid", id)
      }
      await this.recalculateModel(field.model_id)
      return res.json({ field })
    }

    if (parts.length === 2 && method === "DELETE") {
      const field = await this.one<any>("DELETE FROM dynamic_fields WHERE id = $1::uuid RETURNING model_id", id)
      if (field?.model_id) await this.recalculateModel(field.model_id)
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async relationTypes(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    const id = parts[1]
    if (!id) return res.status(404).json({ error: "Not found" })

    if (parts.length === 2 && method === "PATCH") {
      const current = await this.one<any>("SELECT * FROM relation_types WHERE id = $1::uuid", id)
      const name = req.body?.name || current?.name || "Related To"
      const relationType = await this.one(
        `UPDATE relation_types SET
          name = $1,
          key = $2,
          cardinality = $3,
          config = $4::jsonb,
          updated_at = NOW()
        WHERE id = $5::uuid RETURNING *`,
        name,
        req.body?.key || current?.key || this.keyFromName(name),
        req.body?.cardinality || current?.cardinality || "many_to_many",
        JSON.stringify(req.body?.config || current?.config || {}),
        id,
      )
      return res.json({ relationType })
    }

    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM relation_types WHERE id = $1::uuid", id)
      return res.json({ success: true })
    }

    return res.status(404).json({ error: "Not found" })
  }

  private async relationships(req: Request, res: Response, parts: string[]) {
    const method = req.method.toUpperCase()
    if (parts.length === 1 && method !== "POST") return res.status(404).json({ error: "Not found" })
    if (parts.length === 2 && method === "DELETE") {
      await this.rows("DELETE FROM node_relationships WHERE id = $1::uuid", parts[1])
      return res.json({ success: true })
    }
    if (method !== "POST" || parts.length !== 1) return res.status(404).json({ error: "Not found" })
    if (!req.body?.relation_type_id || !req.body?.source_node_id || !req.body?.target_node_id) {
      return res.status(400).json({ error: "Choose a connection type, source item, and target item" })
    }
    if (req.body.source_node_id === req.body.target_node_id) {
      return res.status(400).json({ error: "Choose a different item to connect" })
    }
    const connectionContext = await this.one<any>(
      `SELECT
        rt.model_id as relation_model_id,
        source.model_id as source_model_id,
        target.model_id as target_model_id
       FROM relation_types rt
       JOIN nodes source ON source.id = $2::uuid
       JOIN nodes target ON target.id = $3::uuid
       WHERE rt.id = $1::uuid`,
      req.body.relation_type_id,
      req.body.source_node_id,
      req.body.target_node_id,
    )
    if (!connectionContext) return res.status(400).json({ error: "Connection type or item was not found" })
    if (
      connectionContext.relation_model_id !== connectionContext.source_model_id ||
      connectionContext.relation_model_id !== connectionContext.target_model_id
    ) {
      return res.status(400).json({ error: "Both items must belong to the same board" })
    }
    const relationship = await this.one(
      `INSERT INTO node_relationships (relation_type_id, source_node_id, target_node_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb)
       ON CONFLICT (relation_type_id, source_node_id, target_node_id)
       DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = NOW()
       RETURNING *`,
      req.body?.relation_type_id,
      req.body?.source_node_id,
      req.body?.target_node_id,
      JSON.stringify(req.body?.metadata || {}),
    )
    const model = await this.one<any>(
      `SELECT rt.model_id
       FROM relation_types rt
       WHERE rt.id = $1::uuid`,
      req.body?.relation_type_id,
    )
    if (model?.model_id) await this.recalculateModel(model.model_id)
    return res.json({ relationship })
  }

  private async bootstrapModel(modelId: string) {
    const rootType = await this.one<any>(
      "INSERT INTO node_types (model_id, name, color, icon, sort_order) VALUES ($1::uuid, 'Item', '#2563eb', 'box', 0) RETURNING *",
      modelId,
    )
    await this.one(
      "INSERT INTO nodes (model_id, node_type_id, name, depth, sort_order) VALUES ($1::uuid, $2::uuid, 'Root', 0, 0) RETURNING *",
      modelId,
      rootType.id,
    )
    await this.rows(
      "INSERT INTO dynamic_fields (model_id, node_type_id, name, key, field_type, behavior, sort_order) VALUES ($1::uuid, NULL, 'Status', 'status', 'select', 'manual', 0)",
      modelId,
    )
    await this.rows(
      "INSERT INTO dynamic_fields (model_id, node_type_id, name, key, field_type, behavior, sort_order) VALUES ($1::uuid, NULL, 'Amount', 'amount', 'number', 'manual', 1)",
      modelId,
    )
    const total = await this.one<any>(
      "INSERT INTO dynamic_fields (model_id, node_type_id, name, key, field_type, behavior, sort_order) VALUES ($1::uuid, NULL, 'Children Total', 'children_total', 'number', 'rollup', 2) RETURNING *",
      modelId,
    )
    await this.rows("INSERT INTO formula_definitions (field_id, expression) VALUES ($1::uuid, 'sum(children.amount)')", total.id)
  }

  private async createNode(modelId: string, body: any) {
    const parent = body.parent_id ? await this.one<any>("SELECT * FROM nodes WHERE id = $1::uuid", body.parent_id) : null
    const order = await this.one<{ next_order: number }>(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM nodes WHERE model_id = $1::uuid AND parent_id IS NOT DISTINCT FROM $2::uuid",
      modelId,
      body.parent_id || null,
    )
    return this.one(
      `INSERT INTO nodes (model_id, node_type_id, parent_id, name, path, depth, sort_order, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      modelId,
      body.node_type_id || null,
      body.parent_id || null,
      body.name || "Untitled",
      parent ? `${parent.path || ""}/${parent.id}` : "",
      parent ? Number(parent.depth || 0) + 1 : 0,
      order?.next_order || 0,
      JSON.stringify(body.metadata || {}),
    )
  }

  private async saveValue(nodeId: string, field: any, value: any) {
    const numeric = ["number", "currency", "percentage", "rating"].includes(field.field_type) && value !== "" && value !== null ? Number(value) : null
    const text = typeof value === "string" ? value : value === null || value === undefined ? null : String(value)
    return this.one(
      `INSERT INTO field_values (node_id, field_id, value, value_text, value_number)
       VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5)
       ON CONFLICT (node_id, field_id)
       DO UPDATE SET value = EXCLUDED.value, value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number, updated_at = NOW()
       RETURNING *`,
      nodeId,
      field.id,
      JSON.stringify(value ?? null),
      text,
      Number.isFinite(numeric) ? numeric : null,
    )
  }

  private async snapshot(modelId: string) {
    const [model, nodeTypes, fields, nodes, values, relationTypes, relationships, calculations] = await Promise.all([
      this.one("SELECT * FROM data_models WHERE id = $1::uuid", modelId),
      this.rows("SELECT * FROM node_types WHERE model_id = $1::uuid ORDER BY sort_order ASC, name ASC", modelId),
      this.fieldsForModel(modelId),
      this.nodesForModel(modelId),
      this.rows(
        `SELECT fv.*, df.key as field_key
         FROM field_values fv JOIN dynamic_fields df ON df.id = fv.field_id
         WHERE df.model_id = $1::uuid`,
        modelId,
      ),
      this.rows("SELECT * FROM relation_types WHERE model_id = $1::uuid ORDER BY name ASC", modelId),
      this.rows(
        `SELECT nr.*, rt.key, rt.name,
          source.name as source_name,
          target.name as target_name
         FROM node_relationships nr
         JOIN relation_types rt ON rt.id = nr.relation_type_id
         JOIN nodes source ON source.id = nr.source_node_id
         JOIN nodes target ON target.id = nr.target_node_id
         WHERE rt.model_id = $1::uuid`,
        modelId,
      ),
      this.rows(
        `SELECT cr.*, df.key as field_key
         FROM calculation_results cr JOIN dynamic_fields df ON df.id = cr.field_id
         WHERE df.model_id = $1::uuid`,
        modelId,
      ),
    ])
    return { model, nodeTypes, fields, nodes, values, relationTypes, relationships, calculations }
  }

  private fieldsForModel(modelId: string) {
    return this.rows(
      `SELECT df.*, fd.expression
       FROM dynamic_fields df
       LEFT JOIN formula_definitions fd ON fd.field_id = df.id
       WHERE df.model_id = $1::uuid
       ORDER BY df.sort_order ASC, df.name ASC`,
      modelId,
    )
  }

  private nodesForModel(modelId: string) {
    return this.rows(
      `SELECT n.*, nt.name as node_type_name, nt.color as node_type_color
       FROM nodes n
       LEFT JOIN node_types nt ON nt.id = n.node_type_id
       WHERE n.model_id = $1::uuid
       ORDER BY n.depth ASC, n.sort_order ASC, n.created_at ASC`,
      modelId,
    )
  }

  private async recalculateModel(modelId: string) {
    const [nodes, fields, values, relationships] = await Promise.all([
      this.nodesForModel(modelId),
      this.fieldsForModel(modelId),
      this.rows<any>(
        `SELECT fv.node_id, df.key as field_key, fv.value, fv.value_number, fv.value_text
         FROM field_values fv
         JOIN dynamic_fields df ON df.id = fv.field_id
         WHERE df.model_id = $1::uuid`,
        modelId,
      ),
      this.rows<any>(
        `SELECT rt.key, rt.name, nr.source_node_id, nr.target_node_id
         FROM node_relationships nr
         JOIN relation_types rt ON rt.id = nr.relation_type_id
         WHERE rt.model_id = $1::uuid`,
        modelId,
      ),
    ])
    const formulaFields = fields.filter((field: any) => field.expression)
    const results = []
    for (const node of nodes as any[]) {
      for (const field of formulaFields as any[]) {
        const output = this.engine.calculate(field.expression, { node, nodes: nodes as any[], fields: fields as any[], values, relationships })
        const numeric = typeof output.value === "number" && Number.isFinite(output.value) ? output.value : null
        const result = await this.one(
          `INSERT INTO calculation_results (node_id, field_id, value, value_text, value_number, status, error, trace, calculated_at)
           VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5, $6, $7, $8::jsonb, NOW())
           ON CONFLICT (node_id, field_id)
           DO UPDATE SET value = EXCLUDED.value, value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
             status = EXCLUDED.status, error = EXCLUDED.error, trace = EXCLUDED.trace, calculated_at = NOW()
           RETURNING *`,
          node.id,
          field.id,
          JSON.stringify(output.value),
          output.value === null || output.value === undefined ? null : String(output.value),
          numeric,
          output.status,
          output.error || null,
          JSON.stringify(output.trace),
        )
        results.push(result)
      }
    }
    return results
  }
}
