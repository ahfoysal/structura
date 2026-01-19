"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

export interface Employee {
  id: string
  employee_id: string
  full_name: string
}

interface EmployeesContextType {
  employees: Employee[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const EmployeesContext = createContext<EmployeesContextType | null>(null)

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const loadEmployees = async () => {
    if (loaded && employees.length > 0) return // Already loaded
    
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/employees")
      if (res.ok) {
        const data = await res.json()
        setEmployees(data.employees || [])
        setLoaded(true)
      } else {
        setError("Failed to load employees")
      }
    } catch (err) {
      console.error("[v0] Load employees error:", err)
      setError("Failed to load employees")
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    setLoaded(false)
    await loadEmployees()
  }

  // Load employees on first mount
  useEffect(() => {
    loadEmployees()
  }, [])

  return (
    <EmployeesContext.Provider value={{ employees, loading, error, refresh }}>
      {children}
    </EmployeesContext.Provider>
  )
}

export function useEmployees() {
  const context = useContext(EmployeesContext)
  if (!context) {
    throw new Error("useEmployees must be used within an EmployeesProvider")
  }
  return context
}
