import { test, expect } from "@playwright/test";

async function pauseClock(page) {
  const time = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("one-row layout, own messages, and history", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "Message your partner" });
  await input.fill("Let me handle the demo.");
  await input.press("Enter");
  await expect(page.locator(".latest")).toHaveText("You: Let me handle the demo.Sent");
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "View message history" }).click();
  await expect(page.getByRole("region", { name: "Message history" })).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(2);
  const boxes = await Promise.all([page.locator(".status"), page.locator(".claim"), page.locator(".latest"), page.locator(".history-toggle"), input].map(item => item.boundingBox()));
  const centers = boxes.map(box => box.y + box.height / 2);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2);
});

test("history shows only the five newest messages in order and updates while open", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "Message your partner" });
  for (let index = 1; index <= 7; index++) {
    await input.fill(`Message ${index}`);
    await input.press("Enter");
  }
  await page.getByRole("button", { name: "View message history" }).click();
  await expect(page.locator(".message")).toHaveCount(5);
  await expect(page.locator(".message .text")).toHaveText(["Message 3", "Message 4", "Message 5", "Message 6", "Message 7"]);
  await input.fill("Message 8");
  await input.press("Enter");
  await expect(page.locator(".message .text")).toHaveText(["Message 4", "Message 5", "Message 6", "Message 7", "Message 8"]);
  await page.screenshot({ path: "artifacts/history-latest-five.png" });
});

test("chevron stays centered at wide and narrow widths and points up while history is open", async ({ page }) => {
  for (const width of [1280, 560]) {
    await page.setViewportSize({ width, height: 800 });
    const button = await page.locator(".history-toggle").boundingBox();
    const icon = await page.locator(".chevron").boundingBox();
    const input = await page.getByRole("textbox", { name: "Message your partner" }).boundingBox();
    expect(Math.abs(icon.x + icon.width / 2 - button.x - button.width / 2)).toBeLessThan(1);
    expect(Math.abs(icon.y + icon.height / 2 - input.y - input.height / 2)).toBeLessThan(1);
    expect(icon.width).toBe(16);
    expect(icon.height).toBe(16);
  }
  await page.getByRole("button", { name: "View message history" }).click();
  await expect(page.locator(".chevron")).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
  await page.getByRole("button", { name: "Close message history" }).click();
  await expect(page.locator(".chevron")).toHaveCSS("transform", "none");
});

test("partner claim is immediate, preserves draft/focus, and resets in five seconds", async ({ page }) => {
  await pauseClock(page);
  const input = page.getByRole("textbox", { name: "Message your partner" });
  await input.fill("Draft I am writing");
  // Trigger arrival without clicking out of the composer.
  await page.locator("#partner-claim").evaluate(button => button.click());
  await expect(page.locator(".strip")).toHaveClass(/claimed/);
  await expect(page.locator(".latest")).toHaveText("Alex — I'll take this");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Draft I am writing");
  await page.clock.fastForward(4_999);
  await expect(page.locator(".strip")).toHaveClass(/claimed/);
  await page.clock.fastForward(1);
  await expect(page.locator(".strip")).not.toHaveClass(/claimed/);
  await expect(page.locator(".latest")).toHaveText("Alex: Ask how many people will use it.");
});

test("typing backtick never claims; normal backtick does", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "Message your partner" });
  await input.focus();
  await input.press("`");
  await expect(input).toHaveValue("`");
  await expect(page.locator(".strip")).not.toHaveClass(/claimed/);
  await page.locator(".client").click();
  await page.keyboard.press("`");
  await expect(page.locator(".strip")).toHaveClass(/claimed/);
});

test("history auto-collapses at thirty seconds; incoming messages keep draft and focus", async ({ page }) => {
  await pauseClock(page);
  await page.getByRole("button", { name: "View message history" }).click();
  const input = page.getByRole("textbox", { name: "Message your partner" });
  await input.fill("Still typing");
  await page.clock.fastForward(29_000);
  await page.locator("#partner-message").evaluate(button => button.click());
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Still typing");
  await expect(page.locator(".latest")).toHaveClass(/fresh/);
  await expect(page.getByRole("region", { name: "Message history" })).toBeVisible();
  await page.clock.fastForward(1_000);
  await expect(page.getByRole("region", { name: "Message history" })).toBeHidden();
});

test("partner disconnect makes dot red and disables claim; narrow layout stays in one row", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 780 });
  await page.getByRole("button", { name: "Disconnect partner" }).click();
  await expect(page.locator(".status")).not.toHaveClass(/online/);
  await expect(page.locator(".claim")).toBeDisabled();
  const strip = await page.locator(".strip").boundingBox();
  expect(strip.height).toBe(38);
  expect(strip.x + strip.width).toBeLessThanOrEqual(560);
});

test("compact strip leaves header edges clear and moves below the header in narrow windows", async ({ page }) => {
  await page.evaluate(() => {
    for (const [side, text] of [["left", "9:47 PM · abc-defg-hij"], ["right", "Participants · Notes"]]) {
      const control = document.createElement("button");
      control.dataset.headerControl = side;
      control.textContent = text;
      Object.assign(control.style, { position: "fixed", [side]: "12px", top: "8px", width: "196px", height: "44px" });
      document.body.append(control);
    }
  });
  for (const width of [1920, 1440, 1280, 1024, 960, 768, 560]) {
    await page.setViewportSize({ width, height: 800 });
    const strip = await page.locator(".strip").boundingBox();
    expect(strip.height).toBe(38);
    expect(strip.width).toBeLessThanOrEqual(720);
    expect(strip.x).toBeGreaterThanOrEqual(12);
    expect(strip.x + strip.width).toBeLessThanOrEqual(width - 12);
    for (const side of ["left", "right"]) {
      const control = await page.locator(`[data-header-control=${side}]`).boundingBox();
      expect(strip.y >= control.y + control.height || strip.x >= control.x + control.width || strip.x + strip.width <= control.x).toBe(true);
      await page.locator(`[data-header-control=${side}]`).click({ timeout: 2000 });
    }
    await expect(page.getByRole("textbox", { name: "Message your partner" })).toBeVisible();
    const latest = await page.locator(".latest").boundingBox();
    expect(latest.width).toBeGreaterThan(80);
  }
});

test("a failed send preserves a newer draft, shows a failure, and never steals focus", async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector("#sales-buddy-strip").remove();
    const strip = SalesBuddyUI.mountStrip({ name: "Alex", onClaim() {}, onSend() { return new Promise((_resolve, reject) => { window.rejectSend = reject; }); } });
    strip.model.connection(true, "Partner");
  });
  const input = page.getByRole("textbox", { name: "Message your partner" });
  await input.fill("First message");
  await input.press("Enter");
  await input.fill("My newer draft");
  await page.evaluate(() => window.rejectSend(new Error("Offline")));
  await expect(input).toHaveValue("My newer draft");
  await expect(input).toBeFocused();
  await expect(page.locator(".latest")).toHaveText("Message wasn't sent. Your draft is kept.");
});

test("failed claims return to neutral and equal display names remain distinct", async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector("#sales-buddy-strip").remove();
    const strip = SalesBuddyUI.mountStrip({ name: "Alex", onClaim: async () => { throw new Error("No receipt"); }, onSend() {} });
    strip.model.connection(true, "Alex");
    strip.model.message({ id: "peer", name: "Alex", text: "Partner's message", own: false });
  });
  await expect(page.locator(".latest")).toHaveText("Alex: Partner's message");
  await page.locator(".claim").click();
  await expect(page.locator(".strip")).not.toHaveClass(/claimed/);
  await expect(page.locator(".latest")).toHaveText("Claim wasn't confirmed. Try again.");
});

test("new-message highlight lasts 1.5 seconds and delivery updates do not restart it", async ({ page }) => {
  await pauseClock(page);
  await page.evaluate(() => {
    document.querySelector("#sales-buddy-strip").remove();
    window.highlightStrip = SalesBuddyUI.mountStrip({ name: "You", onClaim() {}, onSend() {} });
    highlightStrip.model.connection(true, "Alex");
    highlightStrip.model.message({ id: "first", name: "Alex", text: "New message" });
  });
  await expect(page.locator(".latest")).toHaveClass(/fresh/);
  await page.clock.fastForward(1000);
  await page.evaluate(() => highlightStrip.model.message({ id: "first", delivered: true }));
  await page.clock.fastForward(499);
  await expect(page.locator(".latest")).toHaveClass(/fresh/);
  await page.clock.fastForward(1);
  await expect(page.locator(".latest")).not.toHaveClass(/fresh/);
  await page.evaluate(() => highlightStrip.model.message({ id: "second", name: "Alex", text: "Another message" }));
  await expect(page.locator(".latest")).toHaveClass(/fresh/);
});

test("messages arriving during a claim highlight once the claim clears; reduced motion keeps the highlight", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pauseClock(page);
  await page.locator("#partner-claim").evaluate(button => button.click());
  await page.locator("#partner-message").evaluate(button => button.click());
  await expect(page.locator(".latest")).not.toHaveClass(/fresh/);
  await expect(page.locator(".strip")).toHaveClass(/claimed/);
  await page.clock.fastForward(5000);
  await expect(page.locator(".latest")).toHaveClass(/fresh/);
  await expect(page.locator(".latest")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".latest")).toHaveCSS("background-color", "rgb(244, 206, 85)");
  await page.clock.fastForward(1500);
  await expect(page.locator(".latest")).not.toHaveClass(/fresh/);
});
