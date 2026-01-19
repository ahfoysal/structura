"use client"
import { useState, useEffect, useRef, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, X } from "lucide-react"
import { useEmployees, type Employee } from "@/contexts/employees-context"

interface MultiEmployeeSelectProps {
  value: string // Comma-separated employee display values
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function MultiEmployeeSelect({ value, onChange, placeholder, disabled }: MultiEmployeeSelectProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { employees, loading } = useEmployees()

  // Parse comma-separated value into array
  useEffect(() => {
    if (value) {
      const values = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
      setSelectedEmployees(values)
    } else {
      setSelectedEmployees([])
    }
  }, [value])

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Filter employees when search term changes - using useMemo for performance
  const filteredEmployees = useMemo(() => {
    if (searchTerm.trim() === "") {
      return employees.slice(0, 50)
    }
    const filtered = employees.filter(
      (emp) =>
        (emp.employee_id && emp.employee_id.includes(searchTerm)) ||
        (emp.full_name && emp.full_name.toLowerCase().includes(searchTerm.toLowerCase())),
    )
    return filtered.slice(0, 50)
  }, [searchTerm, employees])

  const handleSelect = (employee: Employee) => {
    const displayValue = `${employee.employee_id} - ${employee.full_name}`

    // Check if already selected
    if (selectedEmployees.includes(displayValue)) {
      return
    }

    const newSelected = [...selectedEmployees, displayValue]
    setSelectedEmployees(newSelected)
    onChange(newSelected.join(", "))
    setSearchTerm("")
  }

  const handleRemove = (empValue: string) => {
    const newSelected = selectedEmployees.filter((e) => e !== empValue)
    setSelectedEmployees(newSelected)
    onChange(newSelected.join(", "))
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="space-y-2">
        {/* Selected employees badges */}
        {selectedEmployees.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedEmployees.map((empValue) => (
              <Badge key={empValue} variant="secondary" className="pl-3 pr-1 py-1">
                <span className="text-xs">{empValue}</span>
                <button
                  onClick={() => handleRemove(empValue)}
                  className="ml-2 hover:bg-destructive/20 rounded-full p-0.5"
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder={placeholder || "Search to add employees..."}
            disabled={disabled || loading}
            className="pl-9"
          />
        </div>
      </div>

      {/* Dropdown results */}
      {showDropdown && filteredEmployees.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredEmployees.map((employee) => {
            const displayValue = `${employee.employee_id} - ${employee.full_name}`
            const isSelected = selectedEmployees.includes(displayValue)

            return (
              <button
                key={employee.id}
                onClick={() => handleSelect(employee)}
                disabled={isSelected}
                className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm ${
                  isSelected ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <div className="font-medium">{employee.employee_id}</div>
                <div className="text-xs text-muted-foreground">
                  {employee.full_name}
                  {isSelected && <span className="ml-2">(Selected)</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showDropdown && searchTerm && filteredEmployees.length === 0 && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
          No employees found
        </div>
      )}
    </div>
  )
}
