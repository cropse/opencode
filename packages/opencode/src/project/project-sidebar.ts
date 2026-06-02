import { asc, eq, inArray } from "drizzle-orm"
import { Effect, Layer, Context, Schema, Types } from "effect"

import { InstanceState } from "@/effect/instance-state"
import { Database } from "@/storage/db"
import { ProjectSidebarTable } from "./project-sidebar.sql"
import { ProjectTable } from "./project.sql"
import { ProjectID } from "./schema"

const SidebarTime = Schema.Struct({
  created: Schema.Number,
  updated: Schema.Number,
})

export const Info = Schema.Struct({
  id: Schema.String,
  projectID: Schema.NullOr(ProjectID),
  worktree: Schema.String,
  order: Schema.Number,
  expanded: Schema.Boolean,
  time: SidebarTime,
}).annotate({ identifier: "ProjectSidebar" })
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

export const Entry = Schema.Struct({
  projectID: Schema.NullOr(ProjectID),
  worktree: Schema.String,
  expanded: Schema.Boolean,
})
export type Entry = Types.DeepMutable<Schema.Schema.Type<typeof Entry>>

type Row = typeof ProjectSidebarTable.$inferSelect

export function fromRow(row: Row): Info {
  return {
    id: row.id,
    projectID: row.project_id,
    worktree: row.worktree,
    order: row.order,
    expanded: row.expanded === 1,
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
  }
}

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly replace: (entries: Entry[]) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectSidebar") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const list = Effect.fn("ProjectSidebar.list")(function* () {
      const directory = yield* InstanceState.directory
      const rows = yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .select()
            .from(ProjectSidebarTable)
            .where(eq(ProjectSidebarTable.directory, directory))
            .orderBy(asc(ProjectSidebarTable.order))
            .all(),
        ),
      )
      const projectIDs = rows
        .map((row) => row.project_id)
        .filter((projectID): projectID is ProjectID => projectID !== null)
      const existing = new Set(
        projectIDs.length === 0
          ? []
          : yield* Effect.sync(() =>
              Database.use((db) =>
                db
                  .select({ id: ProjectTable.id })
                  .from(ProjectTable)
                  .where(inArray(ProjectTable.id, [...new Set(projectIDs)]))
                  .all(),
              ),
            ).pipe(Effect.map((projects) => projects.map((project) => project.id))),
      )
      return rows
        .filter((row) => (row.project_id ? existing.has(row.project_id) : row.worktree.length > 0))
        .map((row) => fromRow(row))
    })

    const replace = Effect.fn("ProjectSidebar.replace")(function* (entries: Entry[]) {
      const directory = yield* InstanceState.directory
      const deduped = [...new Map(entries.map((entry) => [entry.projectID ?? `worktree:${entry.worktree}`, entry])).values()]
      yield* Effect.sync(() =>
        Database.transaction((db) => {
          db.delete(ProjectSidebarTable).where(eq(ProjectSidebarTable.directory, directory)).run()
          if (deduped.length === 0) return
          db.insert(ProjectSidebarTable)
            .values(
              deduped.map((entry, order) => ({
                id: crypto.randomUUID(),
                directory,
                project_id: entry.projectID,
                worktree: entry.worktree,
                order,
                expanded: entry.expanded ? 1 : 0,
              })),
            )
            .run()
        }),
      )
    })

    return Service.of({ list, replace })
  }),
)

export const defaultLayer = layer

export * as ProjectSidebar from "./project-sidebar"
