# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flow.spec.ts >> social worker verifies, bookkeeper decides, attribution lands
- Location: e2e/flow.spec.ts:28:5

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 90000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/dashboard" until "load"
  navigated to "http://localhost:3000/login"
  navigated to "http://localhost:3000/login"
  navigated to "http://localhost:3000/login"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - main [ref=f1e2]:
    - generic [ref=f1e3]:
      - generic [ref=f1e4]:
        - heading "Sign in" [level=1] [ref=f1e5]
        - paragraph [ref=f1e6]: Accounts are created by your administrator.
      - generic [ref=f1e7]:
        - text: Email
        - textbox "Email" [ref=f1e8]
      - generic [ref=f1e9]:
        - text: Password
        - textbox "Password" [ref=f1e10]
      - button "Sign in" [ref=f1e11]
  - button "Open Next.js Dev Tools" [ref=f1e17] [cursor=pointer]
  - alert [ref=f1e21]
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | 
  3   | // The path that is the project's entire argument: nothing reaches a group
  4   | // without a human verification, and the group's own decision is recorded
  5   | // with attribution. One continuous flow across both roles.
  6   | 
  7   | const SW_EMAIL = "sw@demo.test";
  8   | const BK_EMAIL = "bk@demo.test";
  9   | const PASSWORD = "demo-pass-123";
  10  | // The seeded demo bookkeeper's group (Asha Tailoring).
  11  | const GROUP_ID = "5eed0000-0001-4000-8000-000000000001";
  12  | 
  13  | const RUN_TAG = `E2E ${Date.now()}`;
  14  | const OPP_TITLE = `${RUN_TAG} school uniforms order`;
  15  | 
  16  | async function signIn(page: Page, email: string) {
  17  |   await page.goto("/login");
  18  |   await page.getByLabel("Email").fill(email);
  19  |   await page.getByLabel("Password").fill(PASSWORD);
  20  |   await page.getByRole("button", { name: "Sign in" }).click();
  21  | }
  22  | 
  23  | async function signOut(page: Page) {
  24  |   await page.getByRole("button", { name: "Sign out" }).click();
  25  |   await page.waitForURL("**/login");
  26  | }
  27  | 
  28  | test("social worker verifies, bookkeeper decides, attribution lands", async ({
  29  |   page,
  30  | }) => {
  31  |   // — Social worker signs in and lands on the dashboard.
  32  |   await signIn(page, SW_EMAIL);
> 33  |   await page.waitForURL("**/dashboard");
      |              ^ Error: page.waitForURL: Test timeout of 90000ms exceeded.
  34  |   await expect(page.getByText("Demonstration build", { exact: false })).toBeVisible();
  35  | 
  36  |   // — Ingests an opportunity through the manual-entry form (the UI's
  37  |   //   ingestion path), with a full set of citations.
  38  |   await page.goto("/dashboard/opportunities/new");
  39  |   await page.getByLabel("Title").fill(OPP_TITLE);
  40  |   await page.getByLabel("Size class").selectOption("medium");
  41  |   // exact: true where a citation label contains the field label as a substring
  42  |   await page
  43  |     .getByLabel("What is being bought", { exact: true })
  44  |     .fill("1200 school uniforms for primary classes");
  45  |   await page.getByLabel("Quantity", { exact: true }).fill("1200");
  46  |   await page.getByLabel("Unit").fill("uniforms");
  47  |   await page.getByLabel("Deadline (YYYY-MM-DD)").fill("2027-06-30");
  48  |   await page
  49  |     .getByLabel("Payment terms", { exact: true })
  50  |     .fill("50% on delivery, 50% within 45 days");
  51  |   for (const [field, quote] of [
  52  |     ["What is being bought", "What is being bought: 1200 school uniforms for primary classes"],
  53  |     ["Quantity", "Quantity: 1200 uniforms"],
  54  |     ["Deadline", "Deadline: 2027-06-30"],
  55  |     ["Payment terms", "Payment terms: 50% on delivery, 50% within 45 days"],
  56  |   ] as const) {
  57  |     const row = page.locator("div.grid", {
  58  |       has: page.getByLabel(`Quoted source text — ${field}`),
  59  |     });
  60  |     await row.getByLabel("Page").fill("1");
  61  |     await page.getByLabel(`Quoted source text — ${field}`).fill(quote);
  62  |   }
  63  |   await page.getByRole("button", { name: "Create opportunity" }).click();
  64  |   await page.waitForURL(/\/dashboard\/opportunities\/[0-9a-f-]{36}$/);
  65  |   await expect(page.getByRole("heading", { name: new RegExp(RUN_TAG) })).toBeVisible();
  66  | 
  67  |   // — Runs matching from the opportunity page.
  68  |   await page.getByRole("button", { name: "Run matching" }).click();
  69  |   await expect(page.getByText(/proposed match(es)? created/)).toBeVisible();
  70  | 
  71  |   // — Opens the queue and the new match.
  72  |   await page.goto("/dashboard/queue");
  73  |   await page.getByRole("link", { name: new RegExp(RUN_TAG) }).click();
  74  |   await page.waitForURL("**/dashboard/queue/*");
  75  | 
  76  |   // — Sees the citations beside each summary field: the quoted source text
  77  |   //   carries the same weight as the summary.
  78  |   await expect(page.getByText("Page 1, quoted verbatim").first()).toBeVisible();
  79  |   await expect(
  80  |     page.getByText("Quantity: 1200 uniforms", { exact: false }).first(),
  81  |   ).toBeVisible();
  82  |   await expect(page.getByText("Why this match was proposed")).toBeVisible();
  83  | 
  84  |   // — Approves with a rationale.
  85  |   await page
  86  |     .getByPlaceholder("What did you check, and what did you conclude?")
  87  |     .fill("Checked capacity and deadline against the cited source text.");
  88  |   await page.getByRole("button", { name: "Approve", exact: true }).click();
  89  |   await page.waitForURL("**/dashboard/queue");
  90  |   await expect(page.getByRole("link", { name: new RegExp(RUN_TAG) })).toHaveCount(0);
  91  | 
  92  |   // — Bookkeeper signs in and sees that verified match and nothing else.
  93  |   await signOut(page);
  94  |   await signIn(page, BK_EMAIL);
  95  |   await page.waitForURL("**/group");
  96  |   await page.goto("/group/opportunities");
  97  |   const cards = page.locator("article");
  98  |   await expect(cards).toHaveCount(1);
  99  |   await expect(cards.first().getByText(OPP_TITLE)).toBeVisible();
  100 |   await expect(cards.first().getByText("What the group must deliver")).toBeVisible();
  101 | 
  102 |   // — Accepts, through the confirmation that states the decision creates no
  103 |   //   commitment to any outside party.
  104 |   await page.getByRole("button", { name: "The group accepts" }).click();
  105 |   await expect(
  106 |     page.getByText("creates no commitment to any outside party", { exact: false }),
  107 |   ).toBeVisible();
  108 |   await page.getByRole("button", { name: "Yes, the group accepts" }).click();
  109 |   await expect(page.getByText("Nothing to decide right now")).toBeVisible();
  110 | 
  111 |   // — Back on the social worker's side, the decision appears with
  112 |   //   attribution: who recorded it, on the group's match history.
  113 |   await signOut(page);
  114 |   await signIn(page, SW_EMAIL);
  115 |   await page.waitForURL("**/dashboard");
  116 |   await page.goto(`/dashboard/groups/${GROUP_ID}`);
  117 |   const historyRow = page.locator("li", { hasText: OPP_TITLE });
  118 |   await expect(historyRow.getByText("group accepted", { exact: false })).toBeVisible();
  119 |   await expect(
  120 |     historyRow.getByText("recorded by [SYNTHETIC] Demo Bookkeeper", { exact: false }),
  121 |   ).toBeVisible();
  122 | });
  123 | 
```