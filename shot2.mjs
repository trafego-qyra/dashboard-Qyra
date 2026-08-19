import { chromium } from "@playwright/test";

const dir = process.argv[2];
const base = "http://localhost:3131";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const alvos = [
  ["/", 1440, 1100, "desk-home", "light", false],
  ["/google-ads", 1440, 1100, "desk-gads", "light", false],
  ["/google-ads", 1440, 1100, "desk-gads-full", "light", true],
  ["/meta-ads", 1440, 1100, "desk-meta", "dark", false],
  ["/", 390, 844, "mob-home", "light", true],
  ["/google-ads", 390, 844, "mob-gads", "light", true],
  ["/", 768, 1024, "tab-home", "light", false],
];
for (const [rota, w, h, nome, tema, full] of alvos) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: tema });
  const p = await ctx.newPage();
  await p.goto(base + rota, { waitUntil: "networkidle" });
  await p.waitForTimeout(1400);
  await p.screenshot({ path: `${dir}/${nome}.png`, fullPage: full });
  await ctx.close();
}
await b.close();
console.log("ok");
