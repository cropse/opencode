import * as InstanceState from "@/effect/instance-state"
import { GlobalBus } from "@/bus/global"
import { Project } from "@/project/project"
import { ProjectSidebar } from "@/project/project-sidebar"
import { ProjectID } from "@/project/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ProjectNotFoundError } from "../errors"
import { markInstanceForReload } from "../lifecycle"

export const projectHandlers = HttpApiBuilder.group(InstanceHttpApi, "project", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Project.Service
    const sidebar = yield* ProjectSidebar.Service

    const list = Effect.fn("ProjectHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const current = Effect.fn("ProjectHttpApi.current")(function* () {
      return (yield* InstanceState.context).project
    })

    const initGit = Effect.fn("ProjectHttpApi.initGit")(function* () {
      const ctx = yield* InstanceState.context
      const next = yield* svc.initGit({ directory: ctx.directory, project: ctx.project })
      if (next.id === ctx.project.id && next.vcs === ctx.project.vcs && next.worktree === ctx.project.worktree)
        return next
      yield* markInstanceForReload(ctx, {
        directory: ctx.directory,
        worktree: ctx.directory,
        project: next,
      })
      return next
    })

    const update = Effect.fn("ProjectHttpApi.update")(function* (ctx: {
      params: { projectID: ProjectID }
      payload: Project.UpdatePayload
    }) {
      return yield* svc.update({ ...ctx.payload, projectID: ctx.params.projectID }).pipe(
        Effect.catchTag("Project.NotFoundError", (error) =>
          Effect.fail(
            new ProjectNotFoundError({
              projectID: error.projectID,
              message: `Project not found: ${error.projectID}`,
            }),
          ),
        ),
      )
    })

    const sidebarList = Effect.fn("ProjectHttpApi.sidebarList")(function* () {
      return yield* sidebar.list()
    })

    const MAX_SIDEBAR_ENTRIES = 200

    const sidebarReplace = Effect.fn("ProjectHttpApi.sidebarReplace")(function* (ctx: {
      payload: readonly ProjectSidebar.Entry[]
    }) {
      const validated = ctx.payload
        .filter((e) => e.worktree.trim().length > 0)
        .slice(0, MAX_SIDEBAR_ENTRIES)
      yield* sidebar.replace([...validated])
      const items = yield* sidebar.list()
      yield* Effect.sync(() =>
        GlobalBus.emit("event", {
          directory: "global",
          payload: { type: ProjectSidebar.Event.Updated.type, properties: items },
        }),
      )
      return items
    })

    return handlers
      .handle("list", list)
      .handle("current", current)
      .handle("initGit", initGit)
      .handle("update", update)
      .handle("sidebarList", sidebarList)
      .handle("sidebarReplace", sidebarReplace)
  }),
)
