import { expect, test, type Page } from "@playwright/test";

// The path that is the project's entire argument: nothing reaches a group
// without a human verification, and the group's own decision is recorded
// with attribution. One continuous flow across both roles.

const SW_EMAIL = "sw@demo.test";
const BK_EMAIL = "bk@demo.test";
const PASSWORD = "demo-pass-123";
// The seeded demo bookkeeper's group (Asha Tailoring).
const GROUP_ID = "5eed0000-0001-4000-8000-000000000001";

const RUN_TAG = `E2E ${Date.now()}`;
const OPP_TITLE = `${RUN_TAG} school uniforms order`;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
}

test("social worker verifies, bookkeeper decides, attribution lands", async ({
  page,
}) => {
  // — Social worker signs in and lands on the dashboard.
  await signIn(page, SW_EMAIL);
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Demonstration build", { exact: false })).toBeVisible();

  // — Ingests an opportunity through the manual-entry form (the UI's
  //   ingestion path), with a full set of citations.
  await page.goto("/dashboard/opportunities/new");
  await page.getByLabel("Title").fill(OPP_TITLE);
  await page.getByLabel("Size class").selectOption("medium");
  // exact: true where a citation label contains the field label as a substring
  await page
    .getByLabel("What is being bought", { exact: true })
    .fill("1200 school uniforms for primary classes");
  await page.getByLabel("Quantity", { exact: true }).fill("1200");
  await page.getByLabel("Unit").fill("uniforms");
  await page.getByLabel("Deadline (YYYY-MM-DD)").fill("2027-06-30");
  await page
    .getByLabel("Payment terms", { exact: true })
    .fill("50% on delivery, 50% within 45 days");
  for (const [field, quote] of [
    ["What is being bought", "What is being bought: 1200 school uniforms for primary classes"],
    ["Quantity", "Quantity: 1200 uniforms"],
    ["Deadline", "Deadline: 2027-06-30"],
    ["Payment terms", "Payment terms: 50% on delivery, 50% within 45 days"],
  ] as const) {
    const row = page.locator("div.grid", {
      has: page.getByLabel(`Quoted source text — ${field}`),
    });
    await row.getByLabel("Page").fill("1");
    await page.getByLabel(`Quoted source text — ${field}`).fill(quote);
  }
  await page.getByRole("button", { name: "Create opportunity" }).click();
  await page.waitForURL(/\/dashboard\/opportunities\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: new RegExp(RUN_TAG) })).toBeVisible();

  // — Runs matching from the opportunity page.
  await page.getByRole("button", { name: "Run matching" }).click();
  await expect(page.getByText(/proposed match(es)? created/)).toBeVisible();

  // — Opens the queue and the new match.
  await page.goto("/dashboard/queue");
  await page.getByRole("link", { name: new RegExp(RUN_TAG) }).click();
  await page.waitForURL("**/dashboard/queue/*");

  // — Sees the citations beside each summary field: the quoted source text
  //   carries the same weight as the summary.
  await expect(page.getByText("Page 1, quoted verbatim").first()).toBeVisible();
  await expect(
    page.getByText("Quantity: 1200 uniforms", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("Why this match was proposed")).toBeVisible();

  // — Approves with a rationale.
  await page
    .getByPlaceholder("What did you check, and what did you conclude?")
    .fill("Checked capacity and deadline against the cited source text.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForURL("**/dashboard/queue");
  await expect(page.getByRole("link", { name: new RegExp(RUN_TAG) })).toHaveCount(0);

  // — Bookkeeper signs in and sees that verified match and nothing else.
  await signOut(page);
  await signIn(page, BK_EMAIL);
  await page.waitForURL("**/group");
  await page.goto("/group/opportunities");
  const cards = page.locator("article");
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByText(OPP_TITLE)).toBeVisible();
  await expect(cards.first().getByText("What the group must deliver")).toBeVisible();

  // — Accepts, through the confirmation that states the decision creates no
  //   commitment to any outside party.
  await page.getByRole("button", { name: "The group accepts" }).click();
  await expect(
    page.getByText("creates no commitment to any outside party", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, the group accepts" }).click();
  await expect(page.getByText("Nothing to decide right now")).toBeVisible();

  // — Back on the social worker's side, the decision appears with
  //   attribution: who recorded it, on the group's match history.
  await signOut(page);
  await signIn(page, SW_EMAIL);
  await page.waitForURL("**/dashboard");
  await page.goto(`/dashboard/groups/${GROUP_ID}`);
  const historyRow = page.locator("li", { hasText: OPP_TITLE });
  await expect(historyRow.getByText("group accepted", { exact: false })).toBeVisible();
  await expect(
    historyRow.getByText("recorded by [SYNTHETIC] Demo Bookkeeper", { exact: false }),
  ).toBeVisible();
});
