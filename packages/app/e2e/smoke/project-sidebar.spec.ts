import { expect, test } from "@playwright/test"
import { trackPageErrors, expectNoSmokeErrors } from "../utils/errors"
import { mockOpenCodeServer } from "../utils/mock-server"

const directory = "C:/OpenCode/SidebarProject"
const projectID = "proj_sidebar_smoke"

const project = {
  id: projectID,
  worktree: directory,
  vcs: "git",
  name: "sidebar-smoke",
  time: { created: 1700000000000, updated: 1700000000000 },
  sandboxes: [],
}

const sidebar = [
  {
    id: "sb_001",
    projectID,
    worktree: directory,
    expanded: true,
    order: 0,
    time: { created: 1700000000000, updated: 1700000000000 },
  },
  {
    id: "sb_002",
    projectID: "proj_sidebar_other",
    worktree: "C:/OpenCode/OtherProject",
    expanded: false,
    order: 1,
    time: { created: 1700000001000, updated: 1700000001000 },
  },
  {
    id: "sb_003",
    projectID: "proj_sidebar_third",
    worktree: "C:/OpenCode/ThirdProject",
    expanded: false,
    order: 2,
    time: { created: 1700000002000, updated: 1700000002000 },
  },
]

const provider = {
  all: [
    {
      id: "opencode",
      name: "OpenCode",
      models: { "claude-opus-4-6": { id: "claude-opus-4-6", name: "Claude Opus 4.6", limit: { context: 200_000 } } },
    },
  ],
  connected: ["opencode"],
  default: { providerID: "opencode", modelID: "claude-opus-4-6" },
}

test.describe("smoke: project sidebar", () => {
  test.setTimeout(120_000)

  test("sidebar entries from server are visible on the home page", async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockOpenCodeServer(page, {
      sessions: [],
      provider,
      directory,
      project,
      sidebar,
      pageMessages: () => ({ items: [] }),
    })

    await page.goto("/")
    await expect(page.locator('[data-component="home-project-row"]').first()).toBeVisible()

    const rows = page.locator('[data-component="home-project-row"]')
    const count = await rows.count()
    expect(count, "should render sidebar entries as project rows").toBeGreaterThanOrEqual(1)

    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText()
      names.push(text.trim())
    }
    expect(names, "sidebar project names should include primary project").toEqual(
      expect.arrayContaining([expect.stringMatching(/sidebar-smoke|SidebarProject/i)]),
    )

    expectNoSmokeErrors(errors, [], [])
  })
})
