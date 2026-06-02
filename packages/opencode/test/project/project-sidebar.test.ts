import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { ProjectSidebar } from "@/project/project-sidebar"
import { ProjectSidebarTable } from "@/project/project-sidebar.sql"
import { ProjectTable } from "@/project/project.sql"
import { Database } from "@/storage/db"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProjectID } from "../../src/project/schema"
import { provideInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(ProjectSidebar.defaultLayer, CrossSpawnSpawner.defaultLayer))

function insertProject(input: { id: ProjectID; worktree: string }) {
  Database.use((db) =>
    db
      .insert(ProjectTable)
      .values({
        id: input.id,
        worktree: input.worktree,
        sandboxes: [],
      })
      .run(),
  )
}

function seedSidebar(
  directory: string,
  entries: { projectID: ProjectID | null; worktree: string; order: number; expanded: boolean }[],
) {
  Database.use((db) =>
    db
      .insert(ProjectSidebarTable)
      .values(
        entries.map((entry) => ({
          directory,
          project_id: entry.projectID,
          worktree: entry.worktree,
          order: entry.order,
          expanded: entry.expanded ? 1 : 0,
        })),
      )
      .run(),
  )
}

describe("ProjectSidebar", () => {
  it.live("stores entries and reads them back in sidebar order", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const worktreeA = yield* tmpdirScoped({ git: true })
      const worktreeB = yield* tmpdirScoped({ git: true })
      const projectA = ProjectID.make("project-a")
      const projectB = ProjectID.make("project-b")
      const sidebar = yield* ProjectSidebar.Service

      yield* Effect.sync(() => {
        insertProject({ id: projectA, worktree: worktreeA })
        insertProject({ id: projectB, worktree: worktreeB })
      })
      yield* sidebar
        .replace([
          { projectID: projectA, worktree: worktreeA, expanded: true },
          { projectID: projectB, worktree: worktreeB, expanded: false },
        ])
        .pipe(provideInstance(dir))

      expect(
        (yield* sidebar.list().pipe(provideInstance(dir))).map((entry) => ({
          projectID: entry.projectID,
          expanded: entry.expanded,
        })),
      ).toEqual([
        { projectID: projectA, expanded: true },
        { projectID: projectB, expanded: false },
      ])
    }),
  )

  it.live("replaces entries atomically and removes stale rows for the active directory", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const worktreeA = yield* tmpdirScoped({ git: true })
      const worktreeB = yield* tmpdirScoped({ git: true })
      const projectA = ProjectID.make("project-replace-a")
      const projectB = ProjectID.make("project-replace-b")
      const sidebar = yield* ProjectSidebar.Service

      yield* Effect.sync(() => {
        insertProject({ id: projectA, worktree: worktreeA })
        insertProject({ id: projectB, worktree: worktreeB })
        seedSidebar(dir, [{ projectID: projectA, worktree: worktreeA, order: 0, expanded: true }])
      })
      yield* sidebar
        .replace([
          { projectID: projectB, worktree: worktreeB, expanded: false },
          { projectID: projectA, worktree: worktreeA, expanded: true },
        ])
        .pipe(provideInstance(dir))

      expect((yield* sidebar.list().pipe(provideInstance(dir))).map((entry) => entry.projectID)).toEqual([
        projectB,
        projectA,
      ])
      expect(
        yield* Effect.sync(() =>
          Database.use((db) =>
            db
              .select()
              .from(ProjectSidebarTable)
              .where(eq(ProjectSidebarTable.directory, dir))
              .orderBy(asc(ProjectSidebarTable.order))
              .all(),
          ),
        ).pipe(Effect.map((rows) => rows.map((row) => row.project_id))),
      ).toEqual([projectB, projectA])
    }),
  )

  it.live("keeps sidebar rows isolated by instance directory", () =>
    Effect.gen(function* () {
      const dirA = yield* tmpdirScoped({ git: true })
      const dirB = yield* tmpdirScoped({ git: true })
      const sidebar = yield* ProjectSidebar.Service

      yield* sidebar
        .replace([{ projectID: null, worktree: "/tmp/sidebar-a", expanded: true }])
        .pipe(provideInstance(dirA))
      yield* sidebar
        .replace([{ projectID: null, worktree: "/tmp/sidebar-b", expanded: false }])
        .pipe(provideInstance(dirB))

      expect((yield* sidebar.list().pipe(provideInstance(dirA))).map((entry) => entry.worktree)).toEqual([
        "/tmp/sidebar-a",
      ])
      expect((yield* sidebar.list().pipe(provideInstance(dirB))).map((entry) => entry.worktree)).toEqual([
        "/tmp/sidebar-b",
      ])
    }),
  )

  it.live("deduplicates duplicate project ids deterministically", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const worktreeA = yield* tmpdirScoped({ git: true })
      const worktreeB = yield* tmpdirScoped({ git: true })
      const project = ProjectID.make("project-duplicate")
      const sidebar = yield* ProjectSidebar.Service

      yield* Effect.sync(() => insertProject({ id: project, worktree: worktreeA }))
      yield* sidebar
        .replace([
          { projectID: project, worktree: worktreeA, expanded: false },
          { projectID: project, worktree: worktreeB, expanded: true },
        ])
        .pipe(provideInstance(dir))

      expect(
        (yield* sidebar.list().pipe(provideInstance(dir))).map((entry) => ({
          projectID: entry.projectID,
          worktree: entry.worktree,
        })),
      ).toEqual([{ projectID: project, worktree: worktreeB }])
      expect(
        yield* Effect.sync(() =>
          Database.use((db) =>
            db
              .select()
              .from(ProjectSidebarTable)
              .where(eq(ProjectSidebarTable.project_id, project))
              .all(),
          ),
        ).pipe(Effect.map((rows) => rows.length)),
      ).toBe(1)
    }),
  )

  it.live("cascades project deletion while preserving worktree-only entries", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const validWorktree = yield* tmpdirScoped({ git: true })
      const fallbackWorktree = yield* tmpdirScoped({ git: true })
      const valid = ProjectID.make("project-valid")
      const sidebar = yield* ProjectSidebar.Service

      yield* Effect.sync(() => {
        Database.use((db) => db.delete(ProjectSidebarTable).run())
        insertProject({ id: valid, worktree: validWorktree })
        seedSidebar(dir, [
          { projectID: valid, worktree: validWorktree, order: 0, expanded: false },
          { projectID: null, worktree: fallbackWorktree, order: 1, expanded: true },
        ])
        Database.use((db) => db.delete(ProjectTable).where(eq(ProjectTable.id, valid)).run())
      })

      expect((yield* sidebar.list().pipe(provideInstance(dir))).map((entry) => entry.projectID)).toEqual([null])
    }),
  )
})
