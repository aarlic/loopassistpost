import { test, expect, type Page } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const mapId = "33333333-3333-4333-8333-333333333333";
const nodeId = "44444444-4444-4444-8444-444444444444";
async function backend(page: Page, user?: string, fail = false) {
  const mutations: string[] = [];
  let node = {
    id: nodeId,
    mapId,
    parentId: null,
    title: "Published note",
    color: "#517b65",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Public contents" }],
        },
      ],
    },
    x: 0,
    y: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body: unknown = [];
    let status = 200;
    if (url.pathname.includes("/auth/v1/token"))
      body = {
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: user ?? owner,
          email: "reader@example.com",
          aud: "authenticated",
          role: "authenticated",
        },
      };
    else if (url.pathname.includes("/auth/v1/logout")) body = {};
    else if (url.pathname.includes("/auth/v1/user"))
      body = { id: user ?? owner, email: "reader@example.com" };
    else if (url.pathname.includes("/rest/v1/maps"))
      body = [
        {
          id: mapId,
          owner_id: owner,
          title: "Public page",
          createdAt: 1,
          updatedAt: 1,
        },
      ];
    else if (url.pathname.includes("/rest/v1/nodes")) {
      if (req.method() !== "GET") {
        mutations.push(req.method());
        if (fail) {
          status = 403;
          body = { message: "Simulated permission failure" };
        } else {
          const records = req.postDataJSON();
          node = Array.isArray(records) ? records[0] : records;
        }
      } else body = [node];
    }
    await route.fulfill({
      status,
      json: body,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return mutations;
}
async function login(page: Page) {
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("reader@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}
async function open(page: Page, expectedTitle = "Published note") {
  await page
    .getByRole("button", { name: "Public page", exact: true })
    .last()
    .click();
  await expect(page.locator("#node-title")).toHaveValue(expectedTitle);
}
test("guest and other account can read but cannot edit", async ({ page }) => {
  const mutations = await backend(page, other);
  await page.goto("/");
  await open(page);
  await expect(page.locator("#node-title")).toBeDisabled();
  await expect(page.locator(".tiptap")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Add child idea" }),
  ).toBeHidden();
  await login(page);
  await open(page);
  await expect(page.locator("#node-title")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Create page", exact: true }).first(),
  ).toBeEnabled();
  expect(mutations).toEqual([]);
});
test("owner edits persist and logout clears editing access", async ({
  page,
}) => {
  const mutations = await backend(page, owner);
  await page.goto("/");
  await login(page);
  await open(page);
  await page.locator(".tiptap").fill("Owner changed content");
  await expect(page.getByRole("status").first()).toContainText(
    "Saved to server",
  );
  expect(mutations).toContain("POST");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await open(page);
  await expect(page.locator(".tiptap")).toHaveText("Owner changed content");
  await expect(page.locator("#node-title")).toBeDisabled();
});
test("failed cloud save remains visible and prevents note navigation", async ({
  page,
}) => {
  await backend(page, owner, true);
  await page.goto("/");
  await login(page);
  await open(page);
  await page.locator(".tiptap").fill("Unsaved draft");
  await expect(page.getByRole("alert")).toContainText(
    "Simulated permission failure",
  );
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await expect(page.locator(".tiptap")).toHaveText("Unsaved draft");
});

test("immediate logout flushes the current draft before removing the session", async ({
  page,
}) => {
  await backend(page, owner);
  await page.goto("/");
  await login(page);
  await open(page);
  await page.locator("#node-title").fill("Draft immediately before logout");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await open(page, "Draft immediately before logout");
});

test("a failed pending save blocks logout and preserves the draft", async ({
  page,
}) => {
  await backend(page, owner, true);
  await page.goto("/");
  await login(page);
  await open(page);
  await page.locator("#node-title").fill("Retain this unsaved title");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Simulated permission failure",
  );
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.locator("#node-title")).toHaveValue(
    "Retain this unsaved title",
  );
});

test("offline locks existing owner notes and creation while preserving readable content", async ({
  page,
  context,
}) => {
  const mutations = await backend(page, owner);
  await page.goto("/");
  await login(page);
  await open(page);
  await context.setOffline(true);
  await expect(page.locator("#node-title")).toBeDisabled();
  await expect(page.locator(".tiptap")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(page.locator(".tiptap")).toHaveText("Public contents");
  await expect(
    page.getByRole("button", { name: "Create page", exact: true }).first(),
  ).toBeDisabled();
  expect(mutations).toEqual([]);
  await context.setOffline(false);
  await expect(page.locator("#node-title")).toBeEnabled();
});

test("guest renders downloaded attachment bytes with caption controls locked", async ({
  page,
}) => {
  await backend(page);
  await page.route("**/rest/v1/images*", async (route) =>
    route.fulfill({
      json: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          nodeId,
          mapId,
          path: `${owner}/${mapId}/image`,
          caption: "Public picture",
          createdAt: 1,
        },
      ],
    }),
  );
  await page.route("**/storage/v1/object/note-images/**", async (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/");
  await open(page);
  const picture = page.getByRole("img", { name: "Public picture" });
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);
  await expect(page.getByLabel("Image caption")).toHaveValue("Public picture");
  await expect(page.getByLabel("Image caption")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove attached image" }),
  ).toBeHidden();
});

test("public home hides auth fields and account screens can return home", async ({
  page,
}) => {
  await backend(page);
  await page.goto("/");
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Public page", exact: true }).last(),
  ).toBeVisible();
  await open(page);
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to public home" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Give an idea somewhere to grow." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "tests/screenshots/account-screen.png",
    fullPage: true,
  });
});
test("signup validates confirmation before requests and shows email confirmation", async ({
  page,
}) => {
  await backend(page);
  let signups = 0;
  await page.route("**/auth/v1/signup", async (route) => {
    signups++;
    await route.fulfill({
      json: { user: { id: owner, email: "reader@example.com" }, session: null },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("reader@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different123");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  expect(signups).toBe(0);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("password123");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(page.getByRole("status").last()).toContainText(
    "Check your email",
  );
  expect(signups).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Log in", exact: true }),
  ).toBeVisible();
});
test("guest page creation resumes after login and signed-in creation is direct", async ({
  page,
}) => {
  await backend(page);
  let created = 0;
  await page.route("**/rest/v1/rpc/create_page", async (route) => {
    created++;
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create page", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Log in", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("reader@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  page.once("dialog", (d) => d.accept("Created after login"));
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Created after login", exact: true }),
  ).toBeVisible();
  expect(created).toBe(1);
  page.once("dialog", (d) => d.accept("Direct creation"));
  await page
    .getByRole("button", { name: "Create page", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Direct creation", exact: true }),
  ).toBeVisible();
  expect(created).toBe(2);
});
