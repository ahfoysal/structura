# Structura

Structura is a full-stack workspace builder for creating custom operational systems without hard-coding the shape of the data.

Use it to model teams, projects, clients, inventories, budgets, assets, roadmaps, schools, vendors, or any workflow that needs hierarchy, custom fields, relationships, and calculated values.

## Why Structura

Most internal tools start simple, then break when the business model changes. A project becomes a program. A client gets linked to contracts, tickets, invoices, people, assets, and budgets. A spreadsheet grows formulas nobody wants to touch.

Structura is built around flexible building blocks:

- Create nested items for any hierarchy.
- Add custom fields at runtime.
- Connect items to other items.
- Calculate values from parents, children, descendants, siblings, and references.
- Keep the frontend clean enough for non-technical users.

## Current Experience

- Modern builder interface with a focused workspace, left navigation, and contextual inspector.
- Global `+ Add` menu for adding spaces, boards, items, fields, connections, and calculations.
- Editable fields with type, behavior, formula, and delete controls.
- Parent/child item tree with drag-and-drop movement.
- Bidirectional references between items.
- Dedicated views for workspace, fields, connections, calculations, and settings.
- Visual calculation builder with generated formulas and examples.
- Backend validation for references, duplicate fields, and calculation updates.

## Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** NestJS
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Local database:** Docker Compose
- **Package manager:** pnpm

## Project Structure

```text
.
├── app/                         # Next.js frontend entry
├── components/                  # UI and builder components
├── backend/                     # NestJS API, Prisma schema, migrations
│   ├── prisma/
│   ├── src/
│   └── scripts/
├── docker-compose.yml           # Local PostgreSQL
└── pnpm-workspace.yaml
```

Legacy Next.js API routes are preserved under `backend/legacy-next-api/` for reference while the app moves to the NestJS backend.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Start PostgreSQL:

```bash
pnpm db:up
```

Create local environment files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Run migrations:

```bash
pnpm --dir backend db:migrate
```

Start the backend:

```bash
pnpm --dir backend dev
```

Start the frontend:

```bash
pnpm dev --port 3010
```

Open:

```text
http://localhost:3010
```

## Useful Scripts

```bash
pnpm build                       # Build the Next.js frontend
pnpm --dir backend build         # Build the NestJS backend
pnpm --dir backend smoke:universal
pnpm --dir backend db:migrate
pnpm --dir backend db:studio
```

## Formula Examples

Structura supports calculated fields that can read values from the current item, the hierarchy, or connected items.

```text
self.amount
parent.budget - self.cost
sum(children.amount)
avg(descendants.progress)
sum(siblings.capacity)
sum(related("Supplier").cost)
lookup("Owner", "email")
if(self.score > 80, "Healthy", "At risk")
```

## Local Ports

```text
Frontend: http://localhost:3010
Backend:  http://localhost:3100
Postgres: 127.0.0.1:55432
```

## Status

Structura is an active product build. The current version focuses on the universal data model, modern builder UI, dynamic fields, references, hierarchy, and calculation engine.
