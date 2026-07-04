# Structura Architecture

Structura is split into a Next.js frontend and a NestJS backend.

The frontend is intentionally product-focused: users work with spaces, boards, items, fields, connections, and calculations. The backend stores those concepts as a generic data model that can support many domains without schema changes.

## Domain Model

- **Workspace:** top-level area for a team, client, or personal system.
- **Data model:** a board inside a workspace.
- **Node type:** optional item category such as Department, Task, Product, Vendor, Class, Asset, or Location.
- **Node:** a hierarchy item.
- **Dynamic field:** a user-defined field.
- **Field value:** manual data entered for a node.
- **Relation type:** a named connection such as Depends On, Owns, Reports To, Supplier, Blocks, or Related To.
- **Relationship:** a connection between two nodes.
- **Formula definition:** calculation attached to a dynamic field.
- **Calculation result:** stored output and trace from the formula engine.

## Calculation Scopes

```text
self.field
parent.field
sum(children.field)
avg(descendants.field)
sum(siblings.field)
sum(related("Connection Name").field)
lookup("Connection Name", "field")
if(self.score > 80, "Healthy", "At risk")
```

Related-item calculations are bidirectional. A relationship created from item A to item B can be used while viewing or calculating either item.

## Runtime

```text
Frontend: http://localhost:3010
Backend:  http://localhost:3100
Postgres: 127.0.0.1:55432
```

The Next.js app proxies `/api/*` to the NestJS backend through `next.config.mjs`.
