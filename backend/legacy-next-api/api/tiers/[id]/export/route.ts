import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { Workbook } from "exceljs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params

    const workbook = new Workbook()

    // Fetch tier hierarchy starting from the given tier
    const tierHierarchy = await sql`
      WITH RECURSIVE tier_tree AS (
        SELECT id, name, parent_id, 0 as depth FROM tiers WHERE id = ${id}
        UNION ALL
        SELECT t.id, t.name, t.parent_id, tt.depth + 1 
        FROM tiers t
        JOIN tier_tree tt ON t.parent_id = tt.id
      )
      SELECT * FROM tier_tree ORDER BY depth, name
    `

    // Create a worksheet for each tier
    for (const tier of tierHierarchy) {
      const fields = await sql`
        SELECT id, field_name, field_type 
        FROM tier_fields 
        WHERE tier_id = ${tier.id}
        ORDER BY display_order
      `

      const data = await sql`
        SELECT field_id, value, text_value 
        FROM tier_data 
        WHERE tier_id = ${tier.id}
      `

      // Create sheet with tier name (max 31 chars for Excel)
      const sheetName = tier.name.substring(0, 31)
      const worksheet = workbook.addWorksheet(sheetName)

      // Add headers
      if (fields.length > 0) {
        const headers = fields.map((f: any) => f.field_name)
        worksheet.addRow(headers)

        // Add data rows
        for (const row of data) {
          const dataRow = fields.map((f: any) => {
            const fieldData = data.find((d: any) => d.field_id === f.id)
            return fieldData ? (fieldData.text_value ?? fieldData.value ?? "") : ""
          })
          worksheet.addRow(dataRow)
        }
      }

      // Style header row
      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3D3D3" } }
    }

    // Generate Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer()

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tier-export-${Date.now()}.xlsx"`,
      },
    })
  } catch (error: any) {
    console.error("[v0] Export error:", error)
    return NextResponse.json({ error: error.message || "Failed to export" }, { status: 500 })
  }
}
