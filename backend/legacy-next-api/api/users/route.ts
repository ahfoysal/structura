import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { getCurrentUser } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user || !user.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const users = await sql`
      SELECT id, email, is_admin, created_at
      FROM users
      ORDER BY created_at DESC
    `

    return NextResponse.json({ users })
  } catch (error) {
    console.error("[v0] Get users error:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Creating user - checking auth")
    const user = await getCurrentUser()

    console.log("[v0] Current user:", user)

    if (!user || !user.is_admin) {
      console.log("[v0] Unauthorized - user:", user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { email, password, is_admin } = await request.json()

    // Check if user already exists
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email}
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 })
    }

    const [newUser] = await sql`
      INSERT INTO users (email, password_hash, is_admin)
      VALUES (${email}, ${password}, ${is_admin || false})
      RETURNING id, email, is_admin, created_at
    `

    return NextResponse.json({ user: newUser })
  } catch (error) {
    console.error("[v0] Create user error:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}
