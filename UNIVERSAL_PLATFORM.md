# Universal Dynamic Workspace

This app is now structured as a generic hierarchy and data-modeling platform.

## Core concepts

- Workspace: a top-level container for any user's system.
- Model: a flexible schema inside a workspace.
- Node Type: user-defined type such as Department, Task, Product, Class, Location, Phase, or anything else.
- Node: any item in a hierarchy.
- Dynamic Field: a user-defined field on all nodes or a node type.
- Field Value: manual user-entered data.
- Relationship Type: user-defined relationship such as Depends On, Owns, Located In, Supplier, Blocks, or Mirrors.
- Relationship: a connection from one node to another.
- Formula / Rollup / Lookup: calculated fields using hierarchy and relationships.

## Formula examples

```text
self.amount
parent.budget - self.cost
sum(children.amount)
avg(descendants.score)
sum(siblings.capacity)
sum(related("depends_on").amount)
lookup("supplier", "rating")
if(self.score > 80, "Good", "Risk")
```

## Run

```bash
pnpm db:up
pnpm --dir backend prisma migrate deploy
pnpm dev:backend
pnpm dev
```

The current local ports are:

```text
Frontend: http://localhost:3010
Backend:  http://localhost:3100
Postgres: 127.0.0.1:55432
```

## Verify

```bash
pnpm --dir backend build
pnpm build
pnpm --dir backend smoke:universal
```
