import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "./schema"

export const ProjectSidebarTable = sqliteTable("project_sidebar", {
  id: text().primaryKey(),
  project_id: text().$type<ProjectID | null>(),
  worktree: text().notNull(),
  order: integer().notNull().default(0),
  expanded: integer({ mode: "boolean" }).notNull().default(false),
  ...Timestamps,
})
