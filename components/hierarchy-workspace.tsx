"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, LogOut, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { HierarchyTreeView } from "@/components/hierarchy-tree-view"
import { DataEntryPanel } from "@/components/data-entry-panel"
import { FieldManager } from "@/components/field-manager"
import { TemplateManager } from "@/components/template-manager"
import { BreadcrumbNavigation } from "@/components/breadcrumb-navigation"
import { useSuccessToast } from "@/components/success-toast"
import { useRouter } from "next/navigation"

interface User {
  id: string
  email: string
  is_admin: boolean
}

interface Field {
  id: string
  field_name: string
  field_type: string
  display_order: number
}

interface Tier {
  id: string
  name: string
  parent_id: string | null
  level: number
  allow_child_creation: boolean
  is_draggable: boolean
  data: { field_id: string; value: number }[]
  children?: Tier[]
}

export function HierarchyWorkspace({
  projectId,
  user,
  onBack,
  onLogout,
  initialTierId,
}: {
  projectId: string
  user: User
  onBack: () => void
  onLogout: () => void
  initialTierId?: string
}) {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null)
  const [tierFields, setTierFields] = useState<Field[]>([])
  const [loading, setLoading] = useState(true)
  const [fieldLoading, setFieldLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizing, setIsResizing] = useState(false)
  const [breadcrumbPath, setBreadcrumbPath] = useState<Array<{ id: string; name: string }>>([])
  const [isCreatingRootTier, setIsCreatingRootTier] = useState(false)
  const { success, error, info } = useSuccessToast()
  const router = useRouter()

  const buildBreadcrumbPath = (tier: Tier, allTiers: Tier[]): Array<{ id: string; name: string }> => {
    const path: Array<{ id: string; name: string }> = []
    let current: Tier | null = tier

    while (current) {
      path.unshift({ id: current.id, name: current.name })
      if (current.parent_id) {
        current = findTierInTree(allTiers, current.parent_id)
      } else {
        current = null
      }
    }

    return path
  }

  useEffect(() => {
    loadData()
  }, [projectId])

  useEffect(() => {
    if (selectedTier) {
      loadTierFields(selectedTier.id)
      setBreadcrumbPath(buildBreadcrumbPath(selectedTier, tiers))
      router.push(`/projects/${projectId}/tiers/${selectedTier.id}`)
    }
  }, [selectedTier, projectId])

  useEffect(() => {
    if (initialTierId && tiers.length > 0 && !selectedTier) {
      const tier = findTierInTree(tiers, initialTierId)
      if (tier) {
        setSelectedTier(tier)
      }
    }
  }, [initialTierId, tiers])

  const loadData = async () => {
    setLoading(true)
    try {
      const tiersRes = await fetch(`/api/projects/${projectId}/tiers`)
      const tiersData = await tiersRes.json()

      const newTiers = buildTree(tiersData.tiers || [])
      setTiers(newTiers)

      if (selectedTier) {
        const updatedTier = findTierInTree(newTiers, selectedTier.id)
        if (updatedTier) {
          setSelectedTier(updatedTier)
        }
      }
    } catch (error) {
      console.error("[v0] Load data failed:", error)
      error("Failed to load workspace")
    } finally {
      setLoading(false)
    }
  }

  const loadTierFields = async (tierId: string) => {
    setFieldLoading(true)
    try {
      const res = await fetch(`/api/tiers/${tierId}/fields`)
      const data = await res.json()
      setTierFields(data.fields || [])
    } catch (error) {
      console.error("[v0] Load tier fields failed:", error)
      error("Failed to load tier fields")
    } finally {
      setFieldLoading(false)
    }
  }

  const findTierInTree = (tree: Tier[], tierId: string): Tier | null => {
    for (const tier of tree) {
      if (tier.id === tierId) return tier
      if (tier.children) {
        const found = findTierInTree(tier.children, tierId)
        if (found) return found
      }
    }
    return null
  }

  const buildTree = (flatTiers: Tier[]): Tier[] => {
    const map = new Map<string, Tier>()
    flatTiers.forEach((tier) => {
      map.set(tier.id, { ...tier, children: [] })
    })

    const roots: Tier[] = []
    flatTiers.forEach((tier) => {
      const node = map.get(tier.id)!
      if (tier.parent_id) {
        const parent = map.get(tier.parent_id)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(node)
        }
      } else {
        roots.push(node)
      }
    })

    return roots
  }

  const handleUpdateTierSetting = async (tierId: string, updates: Record<string, boolean>) => {
    try {
      const res = await fetch(`/api/tiers/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (res.ok) {
        success("Tier settings updated", "Changes saved successfully")
        if (selectedTier && selectedTier.id === tierId) {
          setSelectedTier({ ...selectedTier, ...updates })
        }
        try {
          const tiersRes = await fetch(`/api/projects/${projectId}/tiers`)
          const tiersData = await tiersRes.json()
          const newTiers = buildTree(tiersData.tiers || [])
          setTiers(newTiers)
        } catch (e) {
          console.error("[v0] Error reloading tiers:", e)
        }
      }
    } catch (error) {
      console.error("[v0] Update permission failed:", error)
      error("Failed to update tier settings")
    }
  }

  const exportToExcel = async (id: string, type: "tier" | "project") => {
    try {
      info(`Exporting ${type}...`, "Please wait")
      const endpoint = type === "tier" ? `/api/tiers/${id}/export` : `/api/projects/${id}/export`
      const response = await fetch(endpoint)

      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${type}-export-${new Date().getTime()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      success("Export successful", `${type} exported to Excel`)
    } catch (error) {
      console.error("[v0] Export error:", error)
      error("Export failed", "Could not export to Excel")
    }
  }

  const handleCreateRootTier = async () => {
    setIsCreatingRootTier(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/tiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Tier" }),
      })

      if (res.ok) {
        const data = await res.json()
        success("Tier created", "New root tier created successfully")
        await loadData()
        if (data.tier?.id) {
          const newTiers = await (await fetch(`/api/projects/${projectId}/tiers`)).json()
          const tier = findTierInTree(buildTree(newTiers.tiers || []), data.tier.id)
          if (tier) {
            setSelectedTier(tier)
          }
        }
      } else {
        error("Failed to create tier", "Please try again")
      }
    } catch (err) {
      console.error("[v0] Create root tier error:", err)
      error("Failed to create tier", "An error occurred")
    } finally {
      setIsCreatingRootTier(false)
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = Math.max(250, Math.min(600, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isResizing])



  const breadcrumbItems = breadcrumbPath.map((item, index) => ({
    label: item.name,
    id: item.id,
    onClick:
      index < breadcrumbPath.length - 1
        ? () => {
            const tier = findTierInTree(tiers, item.id)
            if (tier) setSelectedTier(tier)
          }
        : undefined,
    isActive: index === breadcrumbPath.length - 1,
  }))

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
          <p className="text-muted-foreground">Loading user...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button onClick={onBack} variant="outline" size="sm" className="gap-2 bg-transparent">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Hierarchy Workspace</h1>
              <p className="text-sm text-muted-foreground">
                {user.email} {user.is_admin ? "(Admin)" : "(User)"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {user.is_admin && (
              <Button
                onClick={() => setShowTemplateManager(!showTemplateManager)}
                variant="outline"
                className="bg-transparent"
              >
                Templates
              </Button>
            )}
            <Button onClick={onLogout} variant="outline" className="gap-2 bg-transparent">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {selectedTier && (
        <BreadcrumbNavigation
          items={[{ label: "Hierarchy", onClick: () => setSelectedTier(null) }, ...breadcrumbItems]}
          loading={fieldLoading}
        />
      )}

      {showTemplateManager && user.is_admin && (
        <div className="border-b border-border bg-secondary p-4">
          <TemplateManager user={user} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`border-r border-border bg-card transition-all duration-300 ease-in-out overflow-hidden ${
            sidebarOpen ? "" : "w-0"
          }`}
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : "0px" }}
        >
          <div className="p-4 h-full overflow-y-auto" style={{ width: `${sidebarWidth}px` }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Hierarchy</h2>
              <div className="flex gap-2">
                {user.is_admin && (
                  <Button
                    onClick={handleCreateRootTier}
                    size="sm"
                    variant="outline"
                    disabled={isCreatingRootTier}
                    className="gap-1 bg-transparent"
                  >
                    <Plus className="h-3 w-3" />
                    {isCreatingRootTier ? "Creating..." : "Add"}
                  </Button>
                )}
                <Button onClick={() => setSidebarOpen(false)} variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <HierarchyTreeView
              projectId={projectId}
              tiers={tiers}
              selectedTierId={selectedTier?.id || null}
              onSelectTier={(tierId) => {
                const tier = findTierInTree(tiers, tierId)
                if (tier) setSelectedTier(tier)
              }}
              onUpdate={loadData}
              user={user}
            />
          </div>
        </div>

        {sidebarOpen && (
          <div
            onMouseDown={() => setIsResizing(true)}
            className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors"
          />
        )}

        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {!sidebarOpen && (
            <Button onClick={() => setSidebarOpen(true)} variant="outline" size="sm" className="gap-2 mb-4 w-fit">
              <ChevronRight className="h-4 w-4" />
              Show Sidebar
            </Button>
          )}

          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin">
                  <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
                <p className="text-muted-foreground">Loading workspace...</p>
              </div>
            </div>
          ) : selectedTier ? (
            <>
              {user.is_admin && (
                <div className="mb-6 p-4 bg-card border border-border rounded-lg space-y-3">
                  <h3 className="font-semibold">Tier Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Allow child tiers to create children</label>
                      <input
                        type="checkbox"
                        checked={selectedTier.allow_child_creation ?? false}
                        onChange={(e) => {
                          handleUpdateTierSetting(selectedTier.id, {
                            allow_child_creation: e.target.checked,
                          })
                        }}
                        className="h-4 w-4"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Not draggable</label>
                      <input
                        type="checkbox"
                        checked={!(selectedTier.is_draggable ?? true)}
                        onChange={(e) => {
                          handleUpdateTierSetting(selectedTier.id, {
                            is_draggable: !e.target.checked,
                          })
                        }}
                        className="h-4 w-4"
                      />
                    </div>
                  </div>
                </div>
              )}
              {user.is_admin && (
                <FieldManager
                  tierId={selectedTier.id}
                  fields={tierFields}
                  onUpdate={() => loadTierFields(selectedTier.id)}
                />
              )}
              <div className="mb-6 flex gap-2">
                <Button
                  onClick={() => exportToExcel(selectedTier.id, "tier")}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  📊 Export Tier to Excel
                </Button>
                <Button
                  onClick={() => exportToExcel(projectId, "project")}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  📊 Export Project to Excel
                </Button>
              </div>
              <DataEntryPanel
                tier={selectedTier}
                fields={tierFields}
                onUpdate={() => loadTierFields(selectedTier.id)}
                fieldLoading={fieldLoading}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {tiers.length === 0
                ? user.is_admin
                  ? "Create a tier to get started"
                  : "No tiers available yet"
                : "Select a tier to view and edit data"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
