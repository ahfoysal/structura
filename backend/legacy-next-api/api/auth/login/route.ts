import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    const { email, employeeId, password, loginType } = await request.json()

    console.log("[v0] Login attempt with type:", loginType)

    let user

    try {
      if (loginType === "employee") {
        console.log("[v0] Employee login attempt with ID:", employeeId)

        const employees = await sql`
          SELECT id, email, is_admin, employee_id, password_hash
          FROM users
          WHERE employee_id = ${employeeId}
        `

        if (employees.length === 0) {
          return NextResponse.json({ error: "Employee not found" }, { status: 401 })
        }

        // Check if password is default (123456)
        if (password !== "123456") {
          console.log("[v0] Invalid employee password")
          return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
        }

        user = employees[0]
      } else {
        // Email login
        console.log("[v0] Email login attempt with:", email)

        const users = await sql`
          SELECT id, email, is_admin, password_hash
          FROM users 
          WHERE email = ${email}
        `

        if (users.length === 0) {
          return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
        }

        const foundUser = users[0]
        const isValidPassword = foundUser.password_hash === password

        if (!isValidPassword) {
          console.log("[v0] Password invalid")
          return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
        }

        user = foundUser
      }
    } catch (dbError: any) {
      console.error("[v0] Database error:", dbError?.message)
      if (dbError?.message?.includes("Too Many") || dbError?.message?.includes("Connection")) {
        return NextResponse.json({ error: "Database temporarily unavailable. Please try again." }, { status: 503 })
      }
      throw dbError
    }

    if (!user) {
      return NextResponse.json({ error: "Login failed" }, { status: 401 })
    }

    console.log("[v0] Password valid, setting cookie for user:", user.id)

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    console.log("[v0] Cookie set successfully")

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin,
        user_role: user.is_admin ? "admin" : "user",
      },
    })
  } catch (error) {
    console.error("[v0] Login error:", error)
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
