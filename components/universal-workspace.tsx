"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LoginForm } from "@/components/login-form"
import {
  BookOpen,
  Boxes,
  Calculator,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  GitBranch,
  LayoutDashboard,
  Link2,
  ListTree,
  LogOut,
  Network,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Trash2,
  Wand2,
  X,
} from "lucide-react"

type User = {
  id: string
  email: string
  is_admin: boolean
}

type Workspace = {
  id: string
  name: string
  description?: string | null
}

type Model = {
  id: string
  workspace_id: string
  name: string
  description?: string | null
}

type NodeType = {
  id: string
  name: string
  color?: string | null
}

type DynamicField = {
  id: string
  name: string
  key: string
  node_type_id?: string | null
  field_type: string
  behavior: string
  expression?: string | null
}

type NodeItem = {
  id: string
  name: string
  parent_id: string | null
  depth: number
  node_type_id?: string | null
  node_type_name?: string | null
  node_type_color?: string | null
  children?: NodeItem[]
}

type FieldValue = {
  node_id: string
  field_id: string
  field_key: string
  value: any
  value_text?: string | null
  value_number?: string | number | null
}

type RelationType = {
  id: string
  name: string
  key: string
  cardinality?: string
}

type Relationship = {
  id: string
  key: string
  name?: string
  source_node_id: string
  target_node_id: string
  source_name?: string
  target_name?: string
}

type CalculationResult = {
  node_id: string
  field_id: string
  field_key: string
  value: any
  value_text?: string | null
  value_number?: string | number | null
  status: "ok" | "error"
  error?: string | null
  trace?: Array<Record<string, any>>
}

type Snapshot = {
  model: Model | null
  nodeTypes: NodeType[]
  fields: DynamicField[]
  nodes: NodeItem[]
  values: FieldValue[]
  relationTypes: RelationType[]
  relationships: Relationship[]
  calculations: CalculationResult[]
}

type ViewMode = "workspace" | "fields" | "connections" | "calculations" | "settings"
type Inspector =
  | { type: "item" }
  | { type: "field"; field: DynamicField | null }
  | { type: "connection"; relationType: RelationType | null }
  | { type: "settings" }
  | { type: "calculation" }
  | null

const fieldTypes = ["text", "number", "currency", "percentage", "date", "select", "boolean", "reference", "formula", "rollup", "lookup", "status"]
const behaviors = ["manual", "inherited", "formula", "rollup", "lookup", "reference"]
const calculatedBehaviors = ["formula", "rollup", "lookup"]

const templates = [
  { name: "Company / Teams", board: "Company Operating System", description: "Teams, people, budgets, ownership, and reporting." },
  { name: "Project / Tasks", board: "Project Command Center", description: "Milestones, work items, blockers, owners, and progress." },
  { name: "CRM / Clients", board: "Client Workspace", description: "Accounts, contacts, deals, renewals, and touchpoints." },
  { name: "Inventory", board: "Inventory System", description: "Products, suppliers, stock levels, locations, and cost." },
  { name: "Budget", board: "Budget Planner", description: "Departments, line items, spend, rollups, and forecasts." },
  { name: "Blank System", board: "My Board", description: "Start with a clean board and shape it yourself." },
]

const navItems: Array<{ id: ViewMode; label: string; icon: typeof LayoutDashboard }> = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "fields", label: "Fields", icon: TableProperties },
  { id: "connections", label: "Connections", icon: Network },
  { id: "calculations", label: "Calculations", icon: BookOpen },
  { id: "settings", label: "Settings", icon: Settings },
]

function buildTree(nodes: NodeItem[]) {
  const map = new Map(nodes.map((node) => [node.id, { ...node, children: [] as NodeItem[] }]))
  const roots: NodeItem[] = []
  for (const node of nodes) {
    const mapped = map.get(node.id)!
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children!.push(mapped)
    } else {
      roots.push(mapped)
    }
  }
  return roots
}

function valueForField(nodeId: string, field: DynamicField, snapshot: Snapshot | null) {
  if (!snapshot) return ""
  const calculated = snapshot.calculations.find((value) => value.node_id === nodeId && value.field_id === field.id)
  if (calculated) return calculated.value_number ?? calculated.value_text ?? calculated.value ?? ""
  const manual = snapshot.values.find((value) => value.node_id === nodeId && value.field_id === field.id)
  return manual?.value_number ?? manual?.value_text ?? manual?.value ?? ""
}

function traceForField(nodeId: string, field: DynamicField, snapshot: Snapshot | null) {
  return snapshot?.calculations.find((value) => value.node_id === nodeId && value.field_id === field.id)
}

function formatFieldType(type: string) {
  const labels: Record<string, string> = {
    text: "Text",
    number: "Number",
    currency: "Money",
    percentage: "Percent",
    date: "Date",
    select: "Select",
    boolean: "Yes / No",
    reference: "Reference",
    formula: "Formula",
    rollup: "Rollup",
    lookup: "Lookup",
    status: "Status",
  }
  return labels[type] || type
}

function formulaFieldKey(fields: DynamicField[]) {
  return fields.find((field) => ["number", "currency", "percentage"].includes(field.field_type) && field.behavior === "manual")?.key || fields[0]?.key || "amount"
}

function NodeTree({
  nodes,
  selectedId,
  onSelect,
  onRename,
  onAddChild,
  onDelete,
  onDropNode,
  draggingId,
  dropTargetId,
  setDraggingId,
  setDropTargetId,
}: {
  nodes: NodeItem[]
  selectedId?: string
  onSelect: (node: NodeItem) => void
  onRename: (node: NodeItem, name: string) => void
  onAddChild: (node: NodeItem) => void
  onDelete: (node: NodeItem) => void
  onDropNode: (draggedId: string, targetParentId: string | null) => void
  draggingId: string | null
  dropTargetId: string | null
  setDraggingId: (id: string | null) => void
  setDropTargetId: (id: string | null) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            draggable={editingId !== node.id}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", node.id)
              event.dataTransfer.effectAllowed = "move"
              setDraggingId(node.id)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setDropTargetId(null)
            }}
            onDragOver={(event) => {
              if (draggingId && draggingId !== node.id) {
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                setDropTargetId(node.id)
              }
            }}
            onDragLeave={() => {
              if (dropTargetId === node.id) setDropTargetId(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              const draggedId = event.dataTransfer.getData("text/plain")
              if (draggedId && draggedId !== node.id) onDropNode(draggedId, node.id)
              setDraggingId(null)
              setDropTargetId(null)
            }}
            className={`group flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm transition ${
              selectedId === node.id ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-700 hover:bg-white"
            } ${dropTargetId === node.id ? "ring-2 ring-emerald-400 ring-offset-1" : ""} ${draggingId === node.id ? "opacity-50" : ""}`}
          >
            <button
              onClick={() => onSelect(node)}
              onDoubleClick={() => {
                setEditingId(node.id)
                setEditingName(node.name)
                onSelect(node)
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: node.node_type_color || "#0f766e" }} />
              {editingId === node.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onRename(node, editingName)
                      setEditingId(null)
                    }
                    if (event.key === "Escape") setEditingId(null)
                  }}
                  onBlur={() => {
                    if (editingName.trim() && editingName !== node.name) onRename(node, editingName)
                    setEditingId(null)
                  }}
                  className="h-7 min-w-0 border-white/40 bg-white text-zinc-950"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
              )}
              {!!node.children?.length && <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />}
            </button>
            {editingId !== node.id && (
              <div className={`flex shrink-0 gap-1 ${selectedId === node.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className={`h-7 w-7 ${selectedId === node.id ? "hover:bg-white/20 hover:text-white" : ""}`}
                  onClick={() => {
                    setEditingId(node.id)
                    setEditingName(node.name)
                    onSelect(node)
                  }}
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" className={`h-7 w-7 ${selectedId === node.id ? "hover:bg-white/20 hover:text-white" : ""}`} onClick={() => onAddChild(node)} title="Add child">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" className={`h-7 w-7 ${selectedId === node.id ? "hover:bg-white/20 hover:text-white" : ""}`} onClick={() => onDelete(node)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {!!node.children?.length && (
            <div className="ml-4 border-l border-zinc-200 pl-2">
              <NodeTree
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
                onRename={onRename}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onDropNode={onDropNode}
                draggingId={draggingId}
                dropTargetId={dropTargetId}
                setDraggingId={setDraggingId}
                setDropTargetId={setDropTargetId}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function UniversalWorkspace() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null)
  const [draftValues, setDraftValues] = useState<Record<string, any>>({})
  const [message, setMessage] = useState("")
  const [activeView, setActiveView] = useState<ViewMode>("workspace")
  const [commandOpen, setCommandOpen] = useState(false)
  const [inspector, setInspector] = useState<Inspector>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const [workspaceName, setWorkspaceName] = useState("My Space")
  const [modelName, setModelName] = useState("My Board")
  const [workspaceEditName, setWorkspaceEditName] = useState("")
  const [workspaceEditDescription, setWorkspaceEditDescription] = useState("")
  const [modelEditName, setModelEditName] = useState("")
  const [modelEditDescription, setModelEditDescription] = useState("")
  const [nodeName, setNodeName] = useState("New Item")
  const [nodeTypeName, setNodeTypeName] = useState("Item")
  const [quickFieldName, setQuickFieldName] = useState("New Detail")
  const [quickFieldType, setQuickFieldType] = useState("text")
  const [relationName, setRelationName] = useState("Related To")
  const [selectedTargetNodeId, setSelectedTargetNodeId] = useState("")
  const [selectedRelationTypeId, setSelectedRelationTypeId] = useState("")
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null)

  const [fieldDraft, setFieldDraft] = useState({ name: "", field_type: "text", behavior: "manual", expression: "" })
  const [relationDraft, setRelationDraft] = useState({ name: "" })
  const [calcName, setCalcName] = useState("Total")
  const [calcOperation, setCalcOperation] = useState("sum")
  const [calcSource, setCalcSource] = useState("children")
  const [calcFieldKey, setCalcFieldKey] = useState("amount")
  const [calcRelationName, setCalcRelationName] = useState("Related To")

  const tree = useMemo(() => buildTree(snapshot?.nodes || []), [snapshot])
  const flatFilteredNodes = useMemo(() => {
    if (!snapshot || !searchTerm.trim()) return []
    const term = searchTerm.trim().toLowerCase()
    return snapshot.nodes.filter((node) => node.name.toLowerCase().includes(term))
  }, [snapshot, searchTerm])
  const fieldsForSelectedNode = useMemo(() => {
    if (!snapshot || !selectedNode) return []
    return snapshot.fields.filter((field) => !field.node_type_id || field.node_type_id === selectedNode.node_type_id)
  }, [snapshot, selectedNode])
  const childItems = useMemo(() => {
    if (!snapshot || !selectedNode) return []
    return snapshot.nodes.filter((node) => node.parent_id === selectedNode.id)
  }, [snapshot, selectedNode])
  const connectionsForSelectedNode = useMemo(() => {
    if (!snapshot || !selectedNode) return []
    return snapshot.relationships.filter(
      (relationship) => relationship.source_node_id === selectedNode.id || relationship.target_node_id === selectedNode.id,
    )
  }, [snapshot, selectedNode])
  const calculationFields = useMemo(() => snapshot?.fields.filter((field) => calculatedBehaviors.includes(field.behavior)) || [], [snapshot])
  const calculationFormula = useMemo(() => {
    if (calcSource === "related") return `${calcOperation}(related("${calcRelationName || "Related To"}").${calcFieldKey || "amount"})`
    return `${calcOperation}(${calcSource}.${calcFieldKey || "amount"})`
  }, [calcFieldKey, calcOperation, calcRelationName, calcSource])

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (user) loadWorkspaces()
  }, [user])

  useEffect(() => {
    if (selectedWorkspace) {
      loadModels(selectedWorkspace.id)
      setWorkspaceEditName(selectedWorkspace.name)
      setWorkspaceEditDescription(selectedWorkspace.description || "")
    }
  }, [selectedWorkspace])

  useEffect(() => {
    if (selectedModel) {
      loadSnapshot(selectedModel.id)
      setModelEditName(selectedModel.name)
      setModelEditDescription(selectedModel.description || "")
    }
  }, [selectedModel])

  useEffect(() => {
    if (snapshot?.nodes?.length && !selectedNode) setSelectedNode(snapshot.nodes[0])
  }, [snapshot, selectedNode])

  useEffect(() => {
    if (!selectedNode || !snapshot) return
    const next: Record<string, any> = {}
    for (const field of snapshot.fields) next[field.id] = valueForField(selectedNode.id, field, snapshot)
    setDraftValues(next)
  }, [selectedNode, snapshot])

  useEffect(() => {
    if (!snapshot) return
    if (!selectedRelationTypeId && snapshot.relationTypes[0]?.id) setSelectedRelationTypeId(snapshot.relationTypes[0].id)
    setCalcFieldKey((current) => current || formulaFieldKey(snapshot.fields))
  }, [snapshot, selectedRelationTypeId])

  useEffect(() => {
    if (!snapshot || !selectedNode) return
    const targetStillValid = snapshot.nodes.some((node) => node.id === selectedTargetNodeId && node.id !== selectedNode.id)
    if (!targetStillValid) setSelectedTargetNodeId(snapshot.nodes.find((node) => node.id !== selectedNode.id)?.id || "")
  }, [snapshot, selectedNode, selectedTargetNodeId])

  useEffect(() => {
    if (inspector?.type === "field") {
      setFieldDraft({
        name: inspector.field?.name || quickFieldName,
        field_type: inspector.field?.field_type || quickFieldType,
        behavior: inspector.field?.behavior || "manual",
        expression: inspector.field?.expression || "sum(children.amount)",
      })
    }
    if (inspector?.type === "connection") setRelationDraft({ name: inspector.relationType?.name || relationName || "Related To" })
  }, [inspector, quickFieldName, quickFieldType, relationName])

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(""), 3500)
    return () => window.clearTimeout(timeout)
  }, [message])

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    }).catch(() => null)

    if (!response) {
      setMessage("Could not reach the server")
      return null
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(data.error || "Request failed")
      return null
    }
    return data
  }

  async function checkAuth() {
    try {
      const data = await request("/api/auth/me")
      if (!data) return
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setAuthLoading(false)
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
    setSelectedWorkspace(null)
    setSelectedModel(null)
    setSnapshot(null)
    setSelectedNode(null)
  }

  async function loadWorkspaces() {
    const data = await request("/api/workspaces")
    if (!data) return
    setWorkspaces(data.workspaces || [])
    if (!selectedWorkspace && data.workspaces?.[0]) setSelectedWorkspace(data.workspaces[0])
  }

  async function loadModels(workspaceId: string) {
    const data = await request(`/api/workspaces/${workspaceId}/models`)
    if (!data) return
    setModels(data.models || [])
    if (!selectedModel && data.models?.[0]) setSelectedModel(data.models[0])
  }

  async function loadSnapshot(modelId = selectedModel?.id) {
    if (!modelId) return
    const data = await request(`/api/models/${modelId}/snapshot`)
    if (!data) return
    setSnapshot(data)
    setSelectedNode((current) => data.nodes.find((node: NodeItem) => node.id === current?.id) || data.nodes[0] || null)
  }

  async function createWorkspace(name = workspaceName) {
    const data = await request("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    if (!data) return null
    setMessage("Space created")
    await loadWorkspaces()
    setSelectedWorkspace(data.workspace)
    return data.workspace as Workspace
  }

  async function createModel(name = modelName) {
    let workspace = selectedWorkspace
    if (!workspace) workspace = await createWorkspace(workspaceName)
    if (!workspace) return null
    const data = await request(`/api/workspaces/${workspace.id}/models`, {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    if (!data) return null
    setMessage("Board created")
    await loadModels(workspace.id)
    setSelectedModel(data.model)
    setActiveView("workspace")
    return data.model as Model
  }

  async function createBoardFromTemplate(boardName: string) {
    setCommandOpen(false)
    setModelName(boardName)
    await createModel(boardName)
  }

  async function updateWorkspace() {
    if (!selectedWorkspace) return
    const data = await request(`/api/workspaces/${selectedWorkspace.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: workspaceEditName, description: workspaceEditDescription }),
    })
    if (!data) return
    setMessage("Space updated")
    setSelectedWorkspace(data.workspace)
    await loadWorkspaces()
  }

  async function deleteWorkspace() {
    if (!selectedWorkspace) return
    if (!confirm(`Delete space "${selectedWorkspace.name}" and all boards inside it?`)) return
    const data = await request(`/api/workspaces/${selectedWorkspace.id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Space deleted")
    setSelectedWorkspace(null)
    setSelectedModel(null)
    setSnapshot(null)
    setSelectedNode(null)
    await loadWorkspaces()
  }

  async function updateModel() {
    if (!selectedModel || !selectedWorkspace) return
    const data = await request(`/api/models/${selectedModel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: modelEditName, description: modelEditDescription }),
    })
    if (!data) return
    setMessage("Board updated")
    setSelectedModel(data.model)
    await loadModels(selectedWorkspace.id)
    await loadSnapshot(data.model.id)
  }

  async function deleteModel() {
    if (!selectedModel || !selectedWorkspace) return
    if (!confirm(`Delete board "${selectedModel.name}"?`)) return
    const data = await request(`/api/models/${selectedModel.id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Board deleted")
    setSelectedModel(null)
    setSnapshot(null)
    setSelectedNode(null)
    await loadModels(selectedWorkspace.id)
  }

  async function createNodeType() {
    if (!selectedModel) return
    const data = await request(`/api/models/${selectedModel.id}/node-types`, {
      method: "POST",
      body: JSON.stringify({ name: nodeTypeName, color: "#0f766e" }),
    })
    if (!data) return
    setMessage("Type created")
    await loadSnapshot()
  }

  async function deleteNodeType(id: string) {
    if (!confirm("Delete this type? Items using it will become untyped.")) return
    const data = await request(`/api/node-types/${id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Type deleted")
    await loadSnapshot()
  }

  async function createFieldFromPayload(payload: Partial<DynamicField> & { expression?: string | null }) {
    if (!selectedModel) return null
    const data = await request(`/api/models/${selectedModel.id}/fields`, {
      method: "POST",
      body: JSON.stringify({
        name: payload.name || "New Detail",
        field_type: payload.field_type || "text",
        behavior: payload.behavior || "manual",
        expression: calculatedBehaviors.includes(payload.behavior || "") ? payload.expression || "0" : undefined,
      }),
    })
    if (!data) return null
    setMessage("Field added")
    await loadSnapshot()
    return data.field as DynamicField
  }

  async function createQuickField() {
    const field = await createFieldFromPayload({ name: quickFieldName, field_type: quickFieldType, behavior: "manual" })
    if (!field) return
    setQuickFieldName("New Detail")
    setInspector({ type: "field", field })
    setActiveView("workspace")
    setCommandOpen(false)
  }

  async function saveFieldDraft() {
    if (!selectedModel) return
    if (inspector?.type === "field" && inspector.field) {
      const data = await request(`/api/fields/${inspector.field.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: fieldDraft.name,
          field_type: fieldDraft.field_type,
          behavior: fieldDraft.behavior,
          expression: calculatedBehaviors.includes(fieldDraft.behavior) ? fieldDraft.expression : undefined,
        }),
      })
      if (!data) return
      setMessage("Field updated")
      await loadSnapshot()
      setInspector({ type: "field", field: data.field })
      return
    }
    const created = await createFieldFromPayload(fieldDraft)
    if (created) setInspector({ type: "field", field: created })
  }

  async function deleteField(id: string) {
    if (!confirm("Delete this field and its values/calculations?")) return
    const data = await request(`/api/fields/${id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Field deleted")
    if (inspector?.type === "field" && inspector.field?.id === id) setInspector(null)
    await loadSnapshot()
  }

  async function createNode(parentId?: string | null, name = nodeName) {
    if (!selectedModel) return null
    const data = await request(`/api/models/${selectedModel.id}/nodes`, {
      method: "POST",
      body: JSON.stringify({
        name: name || "New Item",
        parent_id: parentId === undefined ? selectedNode?.id || null : parentId,
        node_type_id: snapshot?.nodeTypes[0]?.id || null,
      }),
    })
    if (!data) return null
    setMessage("Item created")
    await loadSnapshot()
    setSelectedNode(data.node)
    setActiveView("workspace")
    return data.node as NodeItem
  }

  async function updateSelectedNode(updates: Record<string, any>) {
    if (!selectedNode) return
    const data = await request(`/api/nodes/${selectedNode.id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    })
    if (!data) return
    setMessage("Item updated")
    await loadSnapshot()
    setSelectedNode(data.node)
  }

  async function renameNodeFromTree(node: NodeItem, name: string) {
    const data = await request(`/api/nodes/${node.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    })
    if (!data) return
    setMessage("Item renamed")
    await loadSnapshot()
    setSelectedNode(data.node)
  }

  async function addChildFromTree(node: NodeItem) {
    setSelectedNode(node)
    await createNode(node.id, "New Item")
  }

  async function deleteNodeFromTree(node: NodeItem) {
    if (!confirm(`Delete "${node.name}" and its children?`)) return
    const data = await request(`/api/nodes/${node.id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Item deleted")
    if (selectedNode?.id === node.id) setSelectedNode(null)
    await loadSnapshot()
  }

  function isDescendant(candidateParentId: string | null, draggedId: string) {
    if (!candidateParentId || !snapshot) return false
    let current = snapshot.nodes.find((node) => node.id === candidateParentId)
    while (current) {
      if (current.id === draggedId) return true
      current = snapshot.nodes.find((node) => node.id === current?.parent_id)
    }
    return false
  }

  async function moveNodeFromTree(draggedId: string, targetParentId: string | null) {
    if (draggedId === targetParentId) return
    if (isDescendant(targetParentId, draggedId)) {
      setMessage("Cannot move an item into one of its own children")
      return
    }
    const data = await request(`/api/nodes/${draggedId}`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: targetParentId }),
    })
    if (!data) return
    setMessage(targetParentId ? "Item moved" : "Item moved to the top level")
    await loadSnapshot()
    setSelectedNode(data.node)
  }

  async function deleteSelectedNode() {
    if (!selectedNode) return
    await deleteNodeFromTree(selectedNode)
  }

  async function createRelationType(name = relationName) {
    if (!selectedModel) return null
    const data = await request(`/api/models/${selectedModel.id}/relation-types`, {
      method: "POST",
      body: JSON.stringify({ name: name || "Related To" }),
    })
    if (!data) return null
    setMessage("Connection type created")
    await loadSnapshot()
    if (data.relationType?.id) setSelectedRelationTypeId(data.relationType.id)
    return data.relationType as RelationType
  }

  async function saveRelationDraft() {
    if (inspector?.type === "connection" && inspector.relationType) {
      const data = await request(`/api/relation-types/${inspector.relationType.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: relationDraft.name }),
      })
      if (!data) return
      setMessage("Connection type updated")
      await loadSnapshot()
      setInspector({ type: "connection", relationType: data.relationType })
      return
    }
    const created = await createRelationType(relationDraft.name)
    if (created) setInspector({ type: "connection", relationType: created })
  }

  async function deleteRelationType(id: string) {
    if (!confirm("Delete this connection type and its connections?")) return
    const data = await request(`/api/relation-types/${id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Connection type deleted")
    setInspector(null)
    await loadSnapshot()
  }

  async function createRelationship() {
    if (!selectedModel || !selectedNode) return
    let relationTypeId = selectedRelationTypeId
    if (!relationTypeId) {
      const created = await createRelationType(relationName)
      relationTypeId = created?.id || ""
    }
    if (!relationTypeId) return
    if (!selectedTargetNodeId) {
      setMessage("Choose another item to connect")
      return
    }
    const data = await request("/api/relationships", {
      method: "POST",
      body: JSON.stringify({
        relation_type_id: relationTypeId,
        source_node_id: selectedNode.id,
        target_node_id: selectedTargetNodeId,
      }),
    })
    if (!data) return
    setMessage("Items connected")
    setCommandOpen(false)
    await loadSnapshot()
  }

  async function deleteRelationship(id: string) {
    const data = await request(`/api/relationships/${id}`, { method: "DELETE" })
    if (!data) return
    setMessage("Connection removed")
    await loadSnapshot()
  }

  async function saveValues() {
    if (!selectedNode) return
    const values = fieldsForSelectedNode
      .filter((field) => !calculatedBehaviors.includes(field.behavior))
      .map((field) => ({ field_id: field.id, value: draftValues[field.id] ?? "" }))
    const data = await request(`/api/nodes/${selectedNode.id}/values`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    })
    if (!data) return
    setMessage("Details saved")
    await loadSnapshot()
  }

  async function recalculate() {
    if (!selectedModel) return
    const data = await request(`/api/models/${selectedModel.id}/calculate`, { method: "POST", body: JSON.stringify({}) })
    if (!data) return
    setMessage("Board recalculated")
    await loadSnapshot()
  }

  async function createCalculationField() {
    const field = await createFieldFromPayload({
      name: calcName || "New Calculation",
      field_type: "number",
      behavior: "rollup",
      expression: calculationFormula,
    })
    if (!field) return
    setInspector({ type: "field", field })
    setActiveView("fields")
  }

  const boardStats = [
    { label: "Items", value: snapshot?.nodes.length || 0 },
    { label: "Fields", value: snapshot?.fields.length || 0 },
    { label: "Connections", value: snapshot?.relationships.length || 0 },
    { label: "Calculations", value: calculationFields.length },
  ]

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">Loading workspace...</div>
  }

  if (!user) return <LoginForm onLogin={checkAuth} />

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <div className={`grid min-h-screen ${inspector ? "xl:grid-cols-[300px_minmax(0,1fr)_380px]" : "xl:grid-cols-[300px_minmax(0,1fr)]"}`}>
        <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-zinc-200 bg-[#fbfbf8] p-4 xl:block">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">Structure Builder</h1>
              <p className="text-xs text-zinc-500">Build any system.</p>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-zinc-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search items"
              className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="mb-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>Spaces</span>
              <Button size="icon-sm" variant="ghost" onClick={() => createWorkspace()} title="Create space">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => {
                    setSelectedWorkspace(workspace)
                    setSelectedModel(null)
                    setSnapshot(null)
                    setSelectedNode(null)
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                    selectedWorkspace?.id === workspace.id ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-white"
                  }`}
                >
                  {workspace.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>Boards</span>
              <Button size="icon-sm" variant="ghost" onClick={() => createModel()} title="Create board">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model)
                    setSelectedNode(null)
                    setActiveView("workspace")
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                    selectedModel?.id === model.id ? "bg-emerald-50 font-medium text-emerald-950 ring-1 ring-emerald-200" : "text-zinc-700 hover:bg-white"
                  }`}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>Items</span>
              <Button size="icon-sm" variant="ghost" onClick={() => createNode(null)} disabled={!selectedModel} title="Add root item">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div
              onDragOver={(event) => {
                if (draggingNodeId) {
                  event.preventDefault()
                  setDropTargetNodeId("__root__")
                }
              }}
              onDragLeave={() => {
                if (dropTargetNodeId === "__root__") setDropTargetNodeId(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const draggedId = event.dataTransfer.getData("text/plain")
                if (draggedId) moveNodeFromTree(draggedId, null)
                setDraggingNodeId(null)
                setDropTargetNodeId(null)
              }}
              className={`rounded-lg p-1 ${dropTargetNodeId === "__root__" ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
            >
              {searchTerm.trim() ? (
                <div className="space-y-1">
                  {flatFilteredNodes.map((node) => (
                    <button key={node.id} onClick={() => setSelectedNode(node)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white">
                      <CircleDot className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="truncate">{node.name}</span>
                    </button>
                  ))}
                  {!flatFilteredNodes.length && <p className="px-2 py-3 text-sm text-zinc-500">No items found.</p>}
                </div>
              ) : tree.length ? (
                <NodeTree
                  nodes={tree}
                  selectedId={selectedNode?.id}
                  onSelect={setSelectedNode}
                  onRename={renameNodeFromTree}
                  onAddChild={addChildFromTree}
                  onDelete={deleteNodeFromTree}
                  onDropNode={moveNodeFromTree}
                  draggingId={draggingNodeId}
                  dropTargetId={dropTargetNodeId}
                  setDraggingId={setDraggingNodeId}
                  setDropTargetId={setDropTargetNodeId}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-4 text-sm text-zinc-500">Create a board to start.</p>
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#f7f7f4]/95 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{selectedWorkspace?.name || "New space"}</p>
                <h2 className="truncate text-xl font-semibold">{selectedModel?.name || "Create your first board"}</h2>
              </div>
              <div className="relative flex items-center gap-2">
                {message && <div className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-900 md:block">{message}</div>}
                <Button variant="outline" onClick={recalculate} disabled={!selectedModel} className="bg-white">
                  <RefreshCcw className="h-4 w-4" />
                  Recalculate
                </Button>
                <Button onClick={() => setCommandOpen((value) => !value)} className="bg-zinc-950 text-white hover:bg-zinc-800">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
                <Button variant="outline" onClick={() => setInspector({ type: "settings" })} className="bg-white" title="Project settings">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={logout} title="Logout">
                  <LogOut className="h-4 w-4" />
                </Button>
                {commandOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[360px] rounded-lg border border-zinc-200 bg-white p-3 shadow-xl">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Add anything</p>
                        <p className="text-xs text-zinc-500">Smart actions for the current board.</p>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => setCommandOpen(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-lg border border-zinc-200 p-3">
                        <Label>Item name</Label>
                        <Input value={nodeName} onChange={(event) => setNodeName(event.target.value)} className="mt-2" />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={() => createNode(null)} disabled={!selectedModel} className="bg-white">
                            <ListTree className="h-4 w-4" />
                            Root item
                          </Button>
                          <Button onClick={() => createNode(selectedNode?.id)} disabled={!selectedModel || !selectedNode}>
                            <GitBranch className="h-4 w-4" />
                            Child item
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <button
                          onClick={() => {
                            createModel()
                            setCommandOpen(false)
                          }}
                          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-left hover:bg-zinc-50"
                        >
                          <LayoutDashboard className="h-4 w-4 text-zinc-700" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Add board</span>
                            <span className="block text-xs text-zinc-500">Create another system inside this space.</span>
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            createWorkspace()
                            setCommandOpen(false)
                          }}
                          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-left hover:bg-zinc-50"
                        >
                          <Boxes className="h-4 w-4 text-zinc-700" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Add space</span>
                            <span className="block text-xs text-zinc-500">Start a separate area for another team or client.</span>
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setInspector({ type: "field", field: null })
                            setCommandOpen(false)
                          }}
                          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-left hover:bg-zinc-50"
                        >
                          <TableProperties className="h-4 w-4 text-emerald-600" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Add field</span>
                            <span className="block text-xs text-zinc-500">Text, number, date, status, reference, and more.</span>
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setInspector({ type: "connection", relationType: null })
                            setActiveView("connections")
                            setCommandOpen(false)
                          }}
                          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-left hover:bg-zinc-50"
                        >
                          <Link2 className="h-4 w-4 text-sky-600" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Add connection</span>
                            <span className="block text-xs text-zinc-500">Relate this item to another item.</span>
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setInspector({ type: "calculation" })
                            setActiveView("calculations")
                            setCommandOpen(false)
                          }}
                          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-left hover:bg-zinc-50"
                        >
                          <Calculator className="h-4 w-4 text-amber-600" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Add calculation</span>
                            <span className="block text-xs text-zinc-500">Sum, count, average, lookup, and roll up.</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                      activeView === item.id ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:bg-white/70 hover:text-zinc-950"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </header>

          <div className="mx-auto max-w-6xl px-4 py-6">
            {!selectedModel ? (
              <StartView onCreateBoard={createBoardFromTemplate} modelName={modelName} setModelName={setModelName} createModel={() => createModel()} />
            ) : (
              <>
                {activeView === "workspace" && (
                  <WorkspaceView
                    snapshot={snapshot}
                    selectedNode={selectedNode}
                    setSelectedNode={setSelectedNode}
                    fieldsForSelectedNode={fieldsForSelectedNode}
                    childItems={childItems}
                    connectionsForSelectedNode={connectionsForSelectedNode}
                    draftValues={draftValues}
                    setDraftValues={setDraftValues}
                    saveValues={saveValues}
                    updateSelectedNode={updateSelectedNode}
                    deleteSelectedNode={deleteSelectedNode}
                    createNode={createNode}
                    deleteField={deleteField}
                    openField={(field) => setInspector({ type: "field", field })}
                    openItem={() => setInspector({ type: "item" })}
                    createRelationship={createRelationship}
                    deleteRelationship={deleteRelationship}
                    selectedRelationTypeId={selectedRelationTypeId}
                    setSelectedRelationTypeId={setSelectedRelationTypeId}
                    selectedTargetNodeId={selectedTargetNodeId}
                    setSelectedTargetNodeId={setSelectedTargetNodeId}
                  />
                )}
                {activeView === "fields" && (
                  <FieldsView snapshot={snapshot} openField={(field) => setInspector({ type: "field", field })} deleteField={deleteField} addField={() => setInspector({ type: "field", field: null })} />
                )}
                {activeView === "connections" && (
                  <ConnectionsView
                    snapshot={snapshot}
                    selectedNode={selectedNode}
                    relationName={relationName}
                    setRelationName={setRelationName}
                    createRelationType={createRelationType}
                    openRelation={(relationType) => setInspector({ type: "connection", relationType })}
                    deleteRelationType={deleteRelationType}
                    selectedRelationTypeId={selectedRelationTypeId}
                    setSelectedRelationTypeId={setSelectedRelationTypeId}
                    selectedTargetNodeId={selectedTargetNodeId}
                    setSelectedTargetNodeId={setSelectedTargetNodeId}
                    createRelationship={createRelationship}
                    deleteRelationship={deleteRelationship}
                  />
                )}
                {activeView === "calculations" && (
                  <CalculationsView
                    snapshot={snapshot}
                    calcName={calcName}
                    setCalcName={setCalcName}
                    calcOperation={calcOperation}
                    setCalcOperation={setCalcOperation}
                    calcSource={calcSource}
                    setCalcSource={setCalcSource}
                    calcFieldKey={calcFieldKey}
                    setCalcFieldKey={setCalcFieldKey}
                    calcRelationName={calcRelationName}
                    setCalcRelationName={setCalcRelationName}
                    calculationFormula={calculationFormula}
                    createCalculationField={createCalculationField}
                    openField={(field) => setInspector({ type: "field", field })}
                  />
                )}
                {activeView === "settings" && (
                  <SettingsView
                    selectedWorkspace={selectedWorkspace}
                    selectedModel={selectedModel}
                    workspaceEditName={workspaceEditName}
                    setWorkspaceEditName={setWorkspaceEditName}
                    workspaceEditDescription={workspaceEditDescription}
                    setWorkspaceEditDescription={setWorkspaceEditDescription}
                    modelEditName={modelEditName}
                    setModelEditName={setModelEditName}
                    modelEditDescription={modelEditDescription}
                    setModelEditDescription={setModelEditDescription}
                    updateWorkspace={updateWorkspace}
                    updateModel={updateModel}
                    deleteWorkspace={deleteWorkspace}
                    deleteModel={deleteModel}
                    nodeTypeName={nodeTypeName}
                    setNodeTypeName={setNodeTypeName}
                    createNodeType={createNodeType}
                    deleteNodeType={deleteNodeType}
                    nodeTypes={snapshot?.nodeTypes || []}
                  />
                )}
              </>
            )}
          </div>
        </section>

        {inspector && (
          <InspectorPanel
            inspector={inspector}
            setInspector={setInspector}
            selectedNode={selectedNode}
            snapshot={snapshot}
            fieldDraft={fieldDraft}
            setFieldDraft={setFieldDraft}
            saveFieldDraft={saveFieldDraft}
            deleteField={deleteField}
            relationDraft={relationDraft}
            setRelationDraft={setRelationDraft}
            saveRelationDraft={saveRelationDraft}
            deleteRelationType={deleteRelationType}
            modelEditName={modelEditName}
            setModelEditName={setModelEditName}
            modelEditDescription={modelEditDescription}
            setModelEditDescription={setModelEditDescription}
            updateModel={updateModel}
            updateSelectedNode={updateSelectedNode}
            setSelectedNode={setSelectedNode}
            calcName={calcName}
            setCalcName={setCalcName}
            calculationFormula={calculationFormula}
            createCalculationField={createCalculationField}
          />
        )}
      </div>

      {message && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-lg xl:hidden">{message}</div>}
    </main>
  )
}

function StartView({
  onCreateBoard,
  modelName,
  setModelName,
  createModel,
}: {
  onCreateBoard: (name: string) => void
  modelName: string
  setModelName: (name: string) => void
  createModel: () => void
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 max-w-2xl">
        <Badge variant="outline" className="mb-3 bg-white">
          <Sparkles className="h-3 w-3" />
          Universal builder
        </Badge>
        <h2 className="text-4xl font-semibold tracking-tight">What are you building?</h2>
        <p className="mt-3 text-lg text-zinc-600">Start from a familiar system or create a blank board. You can change everything later.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <button key={template.name} onClick={() => onCreateBoard(template.board)} className="rounded-lg border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Boxes className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{template.name}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{template.description}</p>
          </button>
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <Label>Custom board name</Label>
        <div className="mt-2 flex gap-2">
          <Input value={modelName} onChange={(event) => setModelName(event.target.value)} />
          <Button onClick={createModel}>Create board</Button>
        </div>
      </div>
    </div>
  )
}

function WorkspaceView({
  snapshot,
  selectedNode,
  setSelectedNode,
  fieldsForSelectedNode,
  childItems,
  connectionsForSelectedNode,
  draftValues,
  setDraftValues,
  saveValues,
  updateSelectedNode,
  deleteSelectedNode,
  createNode,
  deleteField,
  openField,
  openItem,
  createRelationship,
  deleteRelationship,
  selectedRelationTypeId,
  setSelectedRelationTypeId,
  selectedTargetNodeId,
  setSelectedTargetNodeId,
}: {
  snapshot: Snapshot | null
  selectedNode: NodeItem | null
  setSelectedNode: (node: NodeItem | null) => void
  fieldsForSelectedNode: DynamicField[]
  childItems: NodeItem[]
  connectionsForSelectedNode: Relationship[]
  draftValues: Record<string, any>
  setDraftValues: React.Dispatch<React.SetStateAction<Record<string, any>>>
  saveValues: () => void
  updateSelectedNode: (updates: Record<string, any>) => void
  deleteSelectedNode: () => void
  createNode: (parentId?: string | null, name?: string) => void
  deleteField: (id: string) => void
  openField: (field: DynamicField) => void
  openItem: () => void
  createRelationship: () => void
  deleteRelationship: (id: string) => void
  selectedRelationTypeId: string
  setSelectedRelationTypeId: (id: string) => void
  selectedTargetNodeId: string
  setSelectedTargetNodeId: (id: string) => void
}) {
  if (!selectedNode) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
        <ListTree className="mx-auto mb-4 h-10 w-10 text-zinc-400" />
        <h3 className="text-xl font-semibold">Select or create an item</h3>
        <p className="mt-2 text-zinc-600">Items are the things inside your board.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
              <ListTree className="h-4 w-4" />
              {selectedNode.node_type_name || "Item"}
            </div>
            <Input
              value={selectedNode.name}
              onChange={(event) => setSelectedNode({ ...selectedNode, name: event.target.value })}
              className="h-auto border-0 bg-transparent px-0 py-0 text-4xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openItem} className="bg-white">
              <PanelRightOpen className="h-4 w-4" />
              Edit
            </Button>
            <Button onClick={() => updateSelectedNode({ name: selectedNode.name, node_type_id: selectedNode.node_type_id, parent_id: selectedNode.parent_id })}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button variant="outline" onClick={deleteSelectedNode} className="bg-white text-red-700 hover:text-red-800">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="Children" value={childItems.length} />
          <Stat label="Fields" value={fieldsForSelectedNode.length} />
          <Stat label="Connections" value={connectionsForSelectedNode.length} />
          <Stat label="Depth" value={selectedNode.depth} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Details</h3>
            <p className="text-sm text-zinc-500">Fields stay editable and removable.</p>
          </div>
          <Button onClick={saveValues}>
            <Check className="h-4 w-4" />
            Save details
          </Button>
        </div>
        {fieldsForSelectedNode.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {fieldsForSelectedNode.map((field) => {
              const calculated = traceForField(selectedNode.id, field, snapshot)
              const isCalculated = calculatedBehaviors.includes(field.behavior)
              return (
                <div key={field.id} className="rounded-lg border border-zinc-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <button onClick={() => openField(field)} className="min-w-0 truncate text-left text-sm font-medium hover:underline">
                      {field.name}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">
                        {formatFieldType(field.field_type)}
                      </Badge>
                      <Button size="icon-sm" variant="ghost" onClick={() => openField(field)} title="Edit field">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => deleteField(field.id)} title="Remove field">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isCalculated ? (
                    <div className="rounded-md bg-zinc-100 px-3 py-2 font-mono text-sm">{String(valueForField(selectedNode.id, field, snapshot) || 0)}</div>
                  ) : (
                    <Input
                      type={["number", "currency", "percentage"].includes(field.field_type) ? "number" : "text"}
                      value={draftValues[field.id] ?? ""}
                      onChange={(event) => setDraftValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    />
                  )}
                  {calculated?.error && <p className="mt-2 text-xs text-red-600">{calculated.error}</p>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">Add a field to start collecting details.</div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Child items</h3>
            <Button variant="outline" onClick={() => createNode(selectedNode.id, "New Item")} className="bg-white">
              <Plus className="h-4 w-4" />
              Add child
            </Button>
          </div>
          <div className="space-y-2">
            {childItems.map((node) => (
              <button key={node.id} onClick={() => setSelectedNode(node)} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-3 text-left hover:bg-zinc-50">
                <span className="truncate font-medium">{node.name}</span>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </button>
            ))}
            {!childItems.length && <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">No children yet.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Connections</h3>
            <Button onClick={createRelationship} disabled={!selectedTargetNodeId}>
              <Link2 className="h-4 w-4" />
              Connect
            </Button>
          </div>
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <select className="h-10 rounded-md border bg-white px-3 text-sm" value={selectedRelationTypeId} onChange={(event) => setSelectedRelationTypeId(event.target.value)}>
              <option value="">Related To</option>
              {snapshot?.relationTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <select className="h-10 rounded-md border bg-white px-3 text-sm" value={selectedTargetNodeId} onChange={(event) => setSelectedTargetNodeId(event.target.value)}>
              <option value="">Choose item</option>
              {snapshot?.nodes
                .filter((node) => node.id !== selectedNode.id)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            {connectionsForSelectedNode.map((relationship) => {
              const isOutgoing = relationship.source_node_id === selectedNode.id
              return (
                <div key={relationship.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-3 text-sm">
                  <span className="min-w-0 truncate">
                    {isOutgoing ? selectedNode.name : relationship.source_name || "Other item"} {" -> "} {relationship.name || relationship.key} {" -> "}
                    {isOutgoing ? relationship.target_name || "Other item" : selectedNode.name}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => deleteRelationship(relationship.id)} title="Remove connection">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
            {!connectionsForSelectedNode.length && <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">No connections yet.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function FieldsView({
  snapshot,
  openField,
  deleteField,
  addField,
}: {
  snapshot: Snapshot | null
  openField: (field: DynamicField) => void
  deleteField: (id: string) => void
  addField: () => void
}) {
  return (
    <div className="space-y-5">
      <PageTitle icon={TableProperties} title="Fields" subtitle="Shape the information every item can hold." action={<Button onClick={addField}><Plus className="h-4 w-4" />Add field</Button>} />
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_150px_150px_1fr_110px] border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <span>Name</span>
          <span>Type</span>
          <span>Behavior</span>
          <span>Expression</span>
          <span className="text-right">Actions</span>
        </div>
        {snapshot?.fields.map((field) => (
          <div key={field.id} className="grid grid-cols-[1.2fr_150px_150px_1fr_110px] items-center border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0">
            <button onClick={() => openField(field)} className="truncate text-left font-medium hover:underline">{field.name}</button>
            <span>{formatFieldType(field.field_type)}</span>
            <span className="capitalize">{field.behavior}</span>
            <span className="truncate font-mono text-xs text-zinc-500">{field.expression || "-"}</span>
            <span className="flex justify-end gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => openField(field)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => deleteField(field.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </span>
          </div>
        ))}
        {!snapshot?.fields.length && <div className="p-8 text-center text-sm text-zinc-500">No fields yet.</div>}
      </div>
    </div>
  )
}

function ConnectionsView({
  snapshot,
  selectedNode,
  relationName,
  setRelationName,
  createRelationType,
  openRelation,
  deleteRelationType,
  selectedRelationTypeId,
  setSelectedRelationTypeId,
  selectedTargetNodeId,
  setSelectedTargetNodeId,
  createRelationship,
  deleteRelationship,
}: {
  snapshot: Snapshot | null
  selectedNode: NodeItem | null
  relationName: string
  setRelationName: (name: string) => void
  createRelationType: (name?: string) => void
  openRelation: (relationType: RelationType) => void
  deleteRelationType: (id: string) => void
  selectedRelationTypeId: string
  setSelectedRelationTypeId: (id: string) => void
  selectedTargetNodeId: string
  setSelectedTargetNodeId: (id: string) => void
  createRelationship: () => void
  deleteRelationship: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <PageTitle icon={Network} title="Connections" subtitle="Define how items relate, then connect real items together." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold">Connection types</h3>
          <div className="mb-4 flex gap-2">
            <Input value={relationName} onChange={(event) => setRelationName(event.target.value)} />
            <Button onClick={() => createRelationType(relationName)}><Plus className="h-4 w-4" />Create</Button>
          </div>
          <div className="space-y-2">
            {snapshot?.relationTypes.map((type) => (
              <div key={type.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-3">
                <div>
                  <p className="font-medium">{type.name}</p>
                  <p className="text-xs text-zinc-500">{type.key}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => openRelation(type)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => deleteRelationType(type.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold">Connect selected item</h3>
          <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <select className="h-10 rounded-md border bg-white px-3 text-sm" value={selectedRelationTypeId} onChange={(event) => setSelectedRelationTypeId(event.target.value)}>
              <option value="">Connection type</option>
              {snapshot?.relationTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
            <select className="h-10 rounded-md border bg-white px-3 text-sm" value={selectedTargetNodeId} onChange={(event) => setSelectedTargetNodeId(event.target.value)}>
              <option value="">Choose item</option>
              {snapshot?.nodes.filter((node) => node.id !== selectedNode?.id).map((node) => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
            <Button onClick={createRelationship} disabled={!selectedNode || !selectedTargetNodeId}><Link2 className="h-4 w-4" />Connect</Button>
          </div>
          <div className="space-y-2">
            {snapshot?.relationships.map((relationship) => (
              <div key={relationship.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-3 text-sm">
                <span className="truncate">
                  {relationship.source_name || relationship.source_node_id} {" -> "} {relationship.name || relationship.key} {" -> "} {relationship.target_name || relationship.target_node_id}
                </span>
                <Button size="icon-sm" variant="ghost" onClick={() => deleteRelationship(relationship.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            {!snapshot?.relationships.length && <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">No connected items yet.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

function CalculationsView({
  snapshot,
  calcName,
  setCalcName,
  calcOperation,
  setCalcOperation,
  calcSource,
  setCalcSource,
  calcFieldKey,
  setCalcFieldKey,
  calcRelationName,
  setCalcRelationName,
  calculationFormula,
  createCalculationField,
  openField,
}: {
  snapshot: Snapshot | null
  calcName: string
  setCalcName: (name: string) => void
  calcOperation: string
  setCalcOperation: (value: string) => void
  calcSource: string
  setCalcSource: (value: string) => void
  calcFieldKey: string
  setCalcFieldKey: (value: string) => void
  calcRelationName: string
  setCalcRelationName: (value: string) => void
  calculationFormula: string
  createCalculationField: () => void
  openField: (field: DynamicField) => void
}) {
  const examples = [
    { title: "Child total", formula: "sum(children.amount)", description: "Adds a field from direct child items." },
    { title: "Average progress", formula: "avg(descendants.progress)", description: "Looks through every nested child." },
    { title: "Connected total", formula: 'sum(related("Related To").amount)', description: "Uses connected items in either direction." },
    { title: "Lookup value", formula: 'lookup("Supplier", "rating")', description: "Pulls one field through a connection." },
  ]

  return (
    <div className="space-y-5">
      <PageTitle icon={BookOpen} title="Calculations" subtitle="Learn, build, preview, and save automatic fields." />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-semibold">Calculation builder</h3>
          </div>
          <div className="grid gap-4">
            <div>
              <Label>Name</Label>
              <Input className="mt-1" value={calcName} onChange={(event) => setCalcName(event.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Operation</Label>
                <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={calcOperation} onChange={(event) => setCalcOperation(event.target.value)}>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                  <option value="count">Count</option>
                </select>
              </div>
              <div>
                <Label>Source</Label>
                <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={calcSource} onChange={(event) => setCalcSource(event.target.value)}>
                  <option value="children">Child items</option>
                  <option value="descendants">All nested children</option>
                  <option value="siblings">Sibling items</option>
                  <option value="related">Connected items</option>
                </select>
              </div>
            </div>
            {calcSource === "related" && (
              <div>
                <Label>Connection</Label>
                <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={calcRelationName} onChange={(event) => setCalcRelationName(event.target.value)}>
                  <option value="Related To">Related To</option>
                  {snapshot?.relationTypes.map((type) => (
                    <option key={type.id} value={type.name}>{type.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Field</Label>
              <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={calcFieldKey} onChange={(event) => setCalcFieldKey(event.target.value)}>
                {snapshot?.fields.map((field) => (
                  <option key={field.id} value={field.key}>{field.name}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Generated formula</p>
              <code className="break-all rounded-md bg-white px-2 py-1 font-mono text-sm">{calculationFormula}</code>
            </div>
            <Button onClick={createCalculationField}><Calculator className="h-4 w-4" />Add calculation field</Button>
          </div>
        </section>
        <section className="space-y-5">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold">Examples</h3>
            <div className="space-y-2">
              {examples.map((example) => (
                <div key={example.title} className="rounded-lg border border-zinc-200 p-3">
                  <p className="font-medium">{example.title}</p>
                  <code className="mt-2 block break-all rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs">{example.formula}</code>
                  <p className="mt-2 text-sm text-zinc-500">{example.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold">Saved calculations</h3>
            <div className="space-y-2">
              {snapshot?.fields.filter((field) => calculatedBehaviors.includes(field.behavior)).map((field) => (
                <button key={field.id} onClick={() => openField(field)} className="w-full rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50">
                  <p className="font-medium">{field.name}</p>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-500">{field.expression}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SettingsView({
  selectedWorkspace,
  selectedModel,
  workspaceEditName,
  setWorkspaceEditName,
  workspaceEditDescription,
  setWorkspaceEditDescription,
  modelEditName,
  setModelEditName,
  modelEditDescription,
  setModelEditDescription,
  updateWorkspace,
  updateModel,
  deleteWorkspace,
  deleteModel,
  nodeTypeName,
  setNodeTypeName,
  createNodeType,
  deleteNodeType,
  nodeTypes,
}: {
  selectedWorkspace: Workspace | null
  selectedModel: Model | null
  workspaceEditName: string
  setWorkspaceEditName: (value: string) => void
  workspaceEditDescription: string
  setWorkspaceEditDescription: (value: string) => void
  modelEditName: string
  setModelEditName: (value: string) => void
  modelEditDescription: string
  setModelEditDescription: (value: string) => void
  updateWorkspace: () => void
  updateModel: () => void
  deleteWorkspace: () => void
  deleteModel: () => void
  nodeTypeName: string
  setNodeTypeName: (value: string) => void
  createNodeType: () => void
  deleteNodeType: (id: string) => void
  nodeTypes: NodeType[]
}) {
  return (
    <div className="space-y-5">
      <PageTitle icon={Settings} title="Project settings" subtitle="Change names, descriptions, item types, and board-level controls." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Space</h3>
          {selectedWorkspace ? (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={workspaceEditName} onChange={(event) => setWorkspaceEditName(event.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={workspaceEditDescription} onChange={(event) => setWorkspaceEditDescription(event.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={updateWorkspace}><Save className="h-4 w-4" />Save</Button>
                <Button variant="outline" onClick={deleteWorkspace} className="bg-white text-red-700"><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No space selected.</p>
          )}
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Board</h3>
          {selectedModel ? (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={modelEditName} onChange={(event) => setModelEditName(event.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={modelEditDescription} onChange={(event) => setModelEditDescription(event.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={updateModel}><Save className="h-4 w-4" />Save</Button>
                <Button variant="outline" onClick={deleteModel} className="bg-white text-red-700"><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No board selected.</p>
          )}
        </section>
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Item types</h3>
          <div className="flex gap-2">
            <Input value={nodeTypeName} onChange={(event) => setNodeTypeName(event.target.value)} className="h-9 w-44" />
            <Button onClick={createNodeType}><Plus className="h-4 w-4" />Create type</Button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {nodeTypes.map((type) => (
            <div key={type.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-3">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: type.color || "#0f766e" }} />
                {type.name}
              </span>
              <Button size="icon-sm" variant="ghost" onClick={() => deleteNodeType(type.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function PageTitle({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: typeof LayoutDashboard
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function InspectorPanel({
  inspector,
  setInspector,
  selectedNode,
  snapshot,
  fieldDraft,
  setFieldDraft,
  saveFieldDraft,
  deleteField,
  relationDraft,
  setRelationDraft,
  saveRelationDraft,
  deleteRelationType,
  modelEditName,
  setModelEditName,
  modelEditDescription,
  setModelEditDescription,
  updateModel,
  updateSelectedNode,
  setSelectedNode,
  calcName,
  setCalcName,
  calculationFormula,
  createCalculationField,
}: {
  inspector: NonNullable<Inspector>
  setInspector: (inspector: Inspector) => void
  selectedNode: NodeItem | null
  snapshot: Snapshot | null
  fieldDraft: { name: string; field_type: string; behavior: string; expression: string }
  setFieldDraft: React.Dispatch<React.SetStateAction<{ name: string; field_type: string; behavior: string; expression: string }>>
  saveFieldDraft: () => void
  deleteField: (id: string) => void
  relationDraft: { name: string }
  setRelationDraft: React.Dispatch<React.SetStateAction<{ name: string }>>
  saveRelationDraft: () => void
  deleteRelationType: (id: string) => void
  modelEditName: string
  setModelEditName: (value: string) => void
  modelEditDescription: string
  setModelEditDescription: (value: string) => void
  updateModel: () => void
  updateSelectedNode: (updates: Record<string, any>) => void
  setSelectedNode: (node: NodeItem | null) => void
  calcName: string
  setCalcName: (name: string) => void
  calculationFormula: string
  createCalculationField: () => void
}) {
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-[380px] overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-xl xl:sticky xl:top-0 xl:h-screen xl:shadow-none">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Inspector</p>
          <h3 className="text-lg font-semibold">
            {inspector.type === "field" && "Field settings"}
            {inspector.type === "item" && "Item settings"}
            {inspector.type === "connection" && "Connection settings"}
            {inspector.type === "settings" && "Board settings"}
            {inspector.type === "calculation" && "Calculation"}
          </h3>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setInspector(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {inspector.type === "field" && (
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={fieldDraft.name} onChange={(event) => setFieldDraft((draft) => ({ ...draft, name: event.target.value }))} />
          </div>
          <div>
            <Label>Type</Label>
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={fieldDraft.field_type} onChange={(event) => setFieldDraft((draft) => ({ ...draft, field_type: event.target.value }))}>
              {fieldTypes.map((type) => (
                <option key={type} value={type}>{formatFieldType(type)}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Behavior</Label>
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={fieldDraft.behavior} onChange={(event) => setFieldDraft((draft) => ({ ...draft, behavior: event.target.value }))}>
              {behaviors.map((behavior) => (
                <option key={behavior} value={behavior}>{behavior}</option>
              ))}
            </select>
          </div>
          {calculatedBehaviors.includes(fieldDraft.behavior) && (
            <div>
              <Label>Formula</Label>
              <Textarea className="mt-1 font-mono" value={fieldDraft.expression} onChange={(event) => setFieldDraft((draft) => ({ ...draft, expression: event.target.value }))} />
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={saveFieldDraft}><Save className="h-4 w-4" />Save field</Button>
            {inspector.field && (
              <Button variant="outline" className="bg-white text-red-700" onClick={() => deleteField(inspector.field!.id)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {inspector.type === "item" && selectedNode && (
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={selectedNode.name} onChange={(event) => setSelectedNode({ ...selectedNode, name: event.target.value })} />
          </div>
          <div>
            <Label>Type</Label>
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={selectedNode.node_type_id || ""} onChange={(event) => setSelectedNode({ ...selectedNode, node_type_id: event.target.value || null })}>
              <option value="">Untyped</option>
              {snapshot?.nodeTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Parent</Label>
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={selectedNode.parent_id || ""} onChange={(event) => setSelectedNode({ ...selectedNode, parent_id: event.target.value || null })}>
              <option value="">Top level</option>
              {snapshot?.nodes.filter((node) => node.id !== selectedNode.id).map((node) => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => updateSelectedNode({ name: selectedNode.name, node_type_id: selectedNode.node_type_id, parent_id: selectedNode.parent_id })}><Save className="h-4 w-4" />Save item</Button>
        </div>
      )}

      {inspector.type === "connection" && (
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={relationDraft.name} onChange={(event) => setRelationDraft({ name: event.target.value })} />
          </div>
          <Button onClick={saveRelationDraft}><Save className="h-4 w-4" />Save connection type</Button>
          {inspector.relationType && (
            <Button variant="outline" className="bg-white text-red-700" onClick={() => deleteRelationType(inspector.relationType!.id)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      )}

      {inspector.type === "settings" && (
        <div className="space-y-4">
          <div>
            <Label>Board name</Label>
            <Input className="mt-1" value={modelEditName} onChange={(event) => setModelEditName(event.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea className="mt-1" value={modelEditDescription} onChange={(event) => setModelEditDescription(event.target.value)} />
          </div>
          <Button onClick={updateModel}><Save className="h-4 w-4" />Save board</Button>
        </div>
      )}

      {inspector.type === "calculation" && (
        <div className="space-y-4">
          <div>
            <Label>Calculation name</Label>
            <Input className="mt-1" value={calcName} onChange={(event) => setCalcName(event.target.value)} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Formula</p>
            <code className="mt-2 block break-all font-mono text-sm">{calculationFormula}</code>
          </div>
          <Button onClick={createCalculationField}><Calculator className="h-4 w-4" />Create field</Button>
        </div>
      )}
    </aside>
  )
}
