# Universal Structure Builder

Universal Structure Builder is a modern workspace builder for modeling any real-world system: teams, projects, clients, inventory, budgets, schools, products, assets, or fully custom operations.

Instead of forcing users to think in database language, the app uses simple product concepts:

- **Spaces** organize work.
- **Boards** describe the system being built.
- **Items** are the things inside a board.
- **Fields** hold information about items.
- **Connections** describe how items relate.
- **Calculations** turn hierarchy and references into automatic results.

Author: **ahfoysal**

Suggested folder name: `universal-structure-builder`

## Stack

- Next.js frontend
- NestJS backend
- PostgreSQL database
- Prisma migrations/client
- Docker Compose for local database
- pnpm workspace

## Main Features

- Modern builder UI with left navigation, central workspace, and contextual inspector
- Global `+ Add` menu for spaces, boards, items, fields, connections, and calculations
- Editable/removable fields with type and behavior controls
- Parent/child hierarchy with drag-and-drop item movement
- Bidirectional connections/references between items
- Calculation builder and learning page
- Rollups, lookups, formulas, and calculation traces
- Dedicated pages for workspace, fields, connections, calculations, and settings

## Local Development

Install dependencies:

```bash
pnpm install
```

Start PostgreSQL:

```bash
pnpm db:up
```

Configure environment files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Run database migrations:

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

## Verification

Build frontend:

```bash
pnpm build
```

Build backend:

```bash
pnpm --dir backend build
```

Run the universal model smoke test:

```bash
pnpm --dir backend smoke:universal
```

## Project Notes

The frontend proxies `/api/*` requests to the NestJS backend through `next.config.mjs`.

Local PostgreSQL runs through Docker Compose on host port `55432`.

Legacy Next.js API code has been moved under the backend legacy area so the Next app can stay focused on the frontend experience.
