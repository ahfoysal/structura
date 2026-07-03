const baseUrl = process.env.API_URL || "http://localhost:3100"

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${text}`)
  }
  return data
}

const suffix = Date.now()
const workspace = (await api("/api/workspaces", {
  method: "POST",
  body: JSON.stringify({ name: `Smoke Workspace ${suffix}` }),
})).workspace

const model = (await api(`/api/workspaces/${workspace.id}/models`, {
  method: "POST",
  body: JSON.stringify({ name: "Universal Smoke Model" }),
})).model

let snapshot = await api(`/api/models/${model.id}/snapshot`)
const root = snapshot.nodes.find((node) => node.name === "Root")
const amount = snapshot.fields.find((field) => field.key === "amount")

const childA = (await api(`/api/models/${model.id}/nodes`, {
  method: "POST",
  body: JSON.stringify({ name: "Child A", parent_id: root.id }),
})).node
const childB = (await api(`/api/models/${model.id}/nodes`, {
  method: "POST",
  body: JSON.stringify({ name: "Child B", parent_id: root.id }),
})).node

await api(`/api/nodes/${childA.id}/values`, {
  method: "PUT",
  body: JSON.stringify({ values: [{ field_id: amount.id, value: 10 }] }),
})
await api(`/api/nodes/${childB.id}/values`, {
  method: "PUT",
  body: JSON.stringify({ values: [{ field_id: amount.id, value: 15 }] }),
})

const dependsOn = (await api(`/api/models/${model.id}/relation-types`, {
  method: "POST",
  body: JSON.stringify({ name: "Depends On", key: "depends_on" }),
})).relationType

await api("/api/relationships", {
  method: "POST",
  body: JSON.stringify({
    relation_type_id: dependsOn.id,
    source_node_id: childA.id,
    target_node_id: childB.id,
  }),
})

await api(`/api/models/${model.id}/fields`, {
  method: "POST",
  body: JSON.stringify({
    name: "Related Amount",
    field_type: "number",
    behavior: "rollup",
    expression: 'sum(related("Depends On").amount)',
  }),
})

await api(`/api/models/${model.id}/calculate`, { method: "POST", body: "{}" })
snapshot = await api(`/api/models/${model.id}/snapshot`)

const rootTotal = snapshot.calculations.find((calc) => calc.node_id === root.id && calc.field_key === "children_total")
const childRelated = snapshot.calculations.find((calc) => calc.node_id === childA.id && calc.field_key === "related_amount")
const reverseRelated = snapshot.calculations.find((calc) => calc.node_id === childB.id && calc.field_key === "related_amount")

if (Number(rootTotal?.value_number) !== 25) {
  throw new Error(`Expected root children_total to equal 25, got ${rootTotal?.value_number}`)
}

if (Number(childRelated?.value_number) !== 15) {
  throw new Error(`Expected child related_amount to equal 15, got ${childRelated?.value_number}`)
}

if (Number(reverseRelated?.value_number) !== 10) {
  throw new Error(`Expected reverse related_amount to equal 10, got ${reverseRelated?.value_number}`)
}

console.log(JSON.stringify({
  ok: true,
  workspace: workspace.name,
  model: model.name,
  rootChildrenTotal: Number(rootTotal.value_number),
  relatedAmount: Number(childRelated.value_number),
  reverseRelatedAmount: Number(reverseRelated.value_number),
}, null, 2))
