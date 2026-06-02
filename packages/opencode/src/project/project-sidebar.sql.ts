import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { Timestamps } from "../storage/schema.sql"
import { ProjectTable } from "./project.sql"
import type { ProjectID } from "./schema"

export const ProjectSidebarTable = sqliteTable(
  "project_sidebar",
  {
    id: text()
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    directory: text().notNull(),
    project_id: text()
      .$type<ProjectID>()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    worktree: text().notNull(),
    order: integer().notNull(),
    expanded: integer().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("project_sidebar_directory_idx").on(table.directory),
    index("project_sidebar_project_id_idx").on(table.project_id),
  ],
)
