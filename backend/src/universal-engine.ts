type NodeRecord = {
  id: string
  name: string
  parent_id: string | null
}

type FieldRecord = {
  id: string
  key: string
  name: string
  field_type: string
  behavior: string
  expression?: string | null
}

type ValueRecord = {
  node_id: string
  field_key: string
  value: any
  value_number: string | number | null
  value_text: string | null
}

type RelationshipRecord = {
  key: string
  name?: string
  source_node_id: string
  target_node_id: string
}

export type CalculationContext = {
  node: NodeRecord
  nodes: NodeRecord[]
  fields: FieldRecord[]
  values: ValueRecord[]
  relationships: RelationshipRecord[]
}

export type CalculationOutput = {
  value: any
  status: "ok" | "error"
  error?: string
  trace: Array<Record<string, any>>
}

export class UniversalFormulaEngine {
  calculate(expression: string, context: CalculationContext): CalculationOutput {
    const trace: Array<Record<string, any>> = []

    try {
      let resolved = expression.trim()
      resolved = this.replaceAggregates(resolved, context, trace)
      resolved = this.replaceLookups(resolved, context, trace)
      resolved = this.replaceDirectRefs(resolved, context, trace)
      resolved = this.replaceIf(resolved, trace)

      const value = this.evaluateMathOrLiteral(resolved)
      return { value, status: "ok", trace }
    } catch (error: any) {
      return {
        value: null,
        status: "error",
        error: error?.message || "Formula failed",
        trace,
      }
    }
  }

  private replaceAggregates(expression: string, context: CalculationContext, trace: Array<Record<string, any>>) {
    return expression.replace(
      /\b(sum|avg|min|max|count)\((children|descendants|siblings|related\("([^"]+)"\))\.([a-zA-Z0-9_]+)\)/g,
      (_match, fn: string, scope: string, relationKey: string | undefined, fieldKey: string) => {
        const nodes = this.nodesForScope(scope, relationKey, context)
        const values = nodes.map((node) => this.numberValue(node.id, fieldKey, context)).filter((value) => Number.isFinite(value))
        const result = this.aggregate(fn, values)
        trace.push({ type: "aggregate", fn, scope, relationKey, fieldKey, nodeCount: nodes.length, values, result })
        return String(result)
      },
    )
  }

  private replaceLookups(expression: string, context: CalculationContext, trace: Array<Record<string, any>>) {
    return expression.replace(/\blookup\("([^"]+)",\s*"([^"]+)"\)/g, (_match, relationKey: string, fieldKey: string) => {
      const related = this.nodesForScope(`related("${relationKey}")`, relationKey, context)[0]
      const value = related ? this.rawValue(related.id, fieldKey, context) : null
      trace.push({ type: "lookup", relationKey, fieldKey, targetNode: related?.id || null, value })
      return this.literal(value)
    })
  }

  private replaceDirectRefs(expression: string, context: CalculationContext, trace: Array<Record<string, any>>) {
    return expression.replace(/\b(self|parent)\.([a-zA-Z0-9_]+)\b/g, (_match, scope: string, fieldKey: string) => {
      const node = scope === "self" ? context.node : context.nodes.find((candidate) => candidate.id === context.node.parent_id)
      const value = node ? this.rawValue(node.id, fieldKey, context) : null
      trace.push({ type: "direct", scope, fieldKey, node: node?.id || null, value })
      return this.literal(value)
    })
  }

  private replaceIf(expression: string, trace: Array<Record<string, any>>) {
    return expression.replace(/\bif\(([^,]+),([^,]+),([^)]+)\)/g, (_match, condition: string, trueValue: string, falseValue: string) => {
      const normalizedCondition = this.normalizeOperators(condition.trim())
      const allowed = this.assertSafeExpression(normalizedCondition)
      if (!allowed) throw new Error("Condition contains unsupported characters")
      const result = Function(`"use strict"; return (${normalizedCondition});`)()
      const selected = result ? trueValue.trim() : falseValue.trim()
      trace.push({ type: "if", condition: normalizedCondition, result: Boolean(result), selected })
      return selected
    })
  }

  private nodesForScope(scope: string, relationKey: string | undefined, context: CalculationContext) {
    if (scope === "children") {
      return context.nodes.filter((node) => node.parent_id === context.node.id)
    }
    if (scope === "descendants") {
      return this.descendants(context.node.id, context.nodes)
    }
    if (scope === "siblings") {
      return context.nodes.filter((node) => node.parent_id === context.node.parent_id && node.id !== context.node.id)
    }
    if (scope.startsWith("related(") && relationKey) {
      const normalizedRelationKey = this.keyFromName(relationKey)
      const relatedIds = context.relationships
        .filter((relationship) => relationship.key === normalizedRelationKey || relationship.key === relationKey || relationship.name === relationKey)
        .flatMap((relationship) => {
          if (relationship.source_node_id === context.node.id) return [relationship.target_node_id]
          if (relationship.target_node_id === context.node.id) return [relationship.source_node_id]
          return []
        })
      return context.nodes.filter((node) => relatedIds.includes(node.id))
    }
    return []
  }

  private descendants(nodeId: string, nodes: NodeRecord[]) {
    const output: NodeRecord[] = []
    const visit = (parentId: string) => {
      for (const node of nodes.filter((candidate) => candidate.parent_id === parentId)) {
        output.push(node)
        visit(node.id)
      }
    }
    visit(nodeId)
    return output
  }

  private rawValue(nodeId: string, fieldKey: string, context: CalculationContext) {
    const value = context.values.find((candidate) => candidate.node_id === nodeId && candidate.field_key === fieldKey)
    if (!value) return null
    if (value.value_number !== null && value.value_number !== undefined) return Number(value.value_number)
    if (value.value_text !== null && value.value_text !== undefined) return value.value_text
    return value.value
  }

  private numberValue(nodeId: string, fieldKey: string, context: CalculationContext) {
    const value = this.rawValue(nodeId, fieldKey, context)
    const numeric = typeof value === "number" ? value : Number(value)
    return Number.isFinite(numeric) ? numeric : Number.NaN
  }

  private aggregate(fn: string, values: number[]) {
    if (fn === "count") return values.length
    if (!values.length) return 0
    if (fn === "sum") return values.reduce((total, value) => total + value, 0)
    if (fn === "avg") return values.reduce((total, value) => total + value, 0) / values.length
    if (fn === "min") return Math.min(...values)
    if (fn === "max") return Math.max(...values)
    return 0
  }

  private literal(value: any) {
    if (value === null || value === undefined) return "0"
    if (typeof value === "number") return String(value)
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return String(numeric)
    return JSON.stringify(String(value))
  }

  private evaluateMathOrLiteral(expression: string) {
    const trimmed = expression.trim()
    if (/^".*"$/.test(trimmed)) return JSON.parse(trimmed)
    const normalized = this.normalizeOperators(trimmed)
    if (!this.assertSafeExpression(normalized)) {
      throw new Error("Formula contains unsupported characters")
    }
    // The expression is reduced to literals/operators by the resolver above.
    return Function(`"use strict"; return (${normalized});`)()
  }

  private normalizeOperators(expression: string) {
    return expression
      .replace(/\bAND\b/gi, "&&")
      .replace(/\bOR\b/gi, "||")
      .replace(/(?<![=!<>])=(?!=)/g, "===")
  }

  private keyFromName(name: string) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  }

  private assertSafeExpression(expression: string) {
    return /^[0-9+\-*/(). <>=!&|?:,"'\sA-Za-z_]+$/.test(expression)
  }
}
