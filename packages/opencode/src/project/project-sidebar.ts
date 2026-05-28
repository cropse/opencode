import { Database } from "@/storage/db"
import { BusEvent } from "@/bus/bus-event"
import { Context, Effect, Layer, Schema, Types } from "effect"
import { ProjectID } from "./schema"
import { ProjectSidebarTable } from "./project-sidebar.sql"

export const Entry = Schema.Struct({
  projectID: Schema.NullOr(ProjectID),
  worktree: Schema.String,
  expanded: Schema.Boolean,
  order: Schema.optional(Schema.Number),
})
export type Entry = Types.DeepMutable<Schema.Schema.Type<typeof Entry>>

export const Info = Schema.Struct({
  id: Schema.String,
  projectID: Schema.NullOr(ProjectID),
  worktree: Schema.String,
  order: Schema.Number,
  expanded: Schema.Boolean,
  time: Schema.Struct({
    created: Schema.Number,
    updated: Schema.Number,
  }),
})
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

export const Event = {
  Updated: BusEvent.define("project.sidebar.updated", Schema.Array(Info)),
}

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly replace: (entries: Entry[]) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectSidebar") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = <T>(fn: (d: Parameters<typeof Database.use>[0] extends (trx: infer D) => any ? D : never) => T) =>
      Effect.sync(() => Database.use(fn))

    const list = Effect.fn("ProjectSidebar.list")(function* () {
      const rows = yield* db((d) =>
        d.select().from(ProjectSidebarTable).orderBy(ProjectSidebarTable.order).all(),
      )
      return rows.map((row) => ({
        id: row.id,
        projectID: row.project_id,
        worktree: row.worktree,
        order: row.order,
        expanded: row.expanded,
        time: {
          created: row.time_created,
          updated: row.time_updated,
        },
      }))
    })

    const replace = Effect.fn("ProjectSidebar.replace")(function* (entries: Entry[]) {
      yield* db((d) => {
        d.delete(ProjectSidebarTable).run()
        const now = Date.now()
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          d.insert(ProjectSidebarTable)
            .values({
              id: crypto.randomUUID(),
              project_id: entry.projectID,
              worktree: entry.worktree,
              order: entry.order ?? i,
              expanded: entry.expanded,
              time_created: now,
              time_updated: now,
            })
            .run()
        }
      })
    })

    return Service.of({ list, replace })
  }),
)

export const defaultLayer = layer

export * as ProjectSidebar from "./project-sidebar"
