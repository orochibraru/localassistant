#!/usr/bin/env bun
//MISE description="Render docs/images/feature.webp, the README hero, from the screenshots `mise run screenshots` takes"
import { join } from "node:path";

import { chromium } from "@playwright/test";
import { Image } from "bun";

const root = join(import.meta.dir, "..", "..");
const images = join(root, "docs", "images");
const inline = async (name: string) =>
	`data:image/webp;base64,${Buffer.from(await Bun.file(join(images, name)).bytes()).toString("base64")}`;
const desktop = await inline("home-desktop.webp");
const phone = await inline("home-mobile.webp");

const GROUND = "#120a0d";
const INK = "#f8eff2";
const MUTED = "#b7a4ab";
const ACCENT = "#d8516a";
const GLOW = "#911f43";
const EMBER = "#d67d5e";

const mark = `<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="${ACCENT}"/><circle cx="208" cy="256" r="104" fill="none" stroke="#fff" stroke-width="44"/><circle cx="304" cy="256" r="104" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="44"/></svg>`;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1024px; height: 500px; overflow: hidden; }
  body {
    position: relative;
    background:
      radial-gradient(620px 420px at 96% 0%, ${ACCENT}40, transparent 70%),
      radial-gradient(560px 400px at 4% 108%, ${GLOW}66, transparent 70%),
      radial-gradient(420px 300px at 60% 110%, ${EMBER}33, transparent 70%),
      ${GROUND};
    color: ${INK};
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .glow { position: absolute; left: 600px; top: -220px; width: 520px; opacity: 0.45; filter: blur(56px); }
  .words { position: absolute; left: 64px; top: 0; width: 340px; height: 500px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.2px; }
  .brand svg { width: 30px; }
  h1 { margin-top: 28px; font-size: 44px; line-height: 1.04; font-weight: 650; letter-spacing: -1.6px; text-wrap: balance; }
  p { margin-top: 18px; max-width: 300px; font-size: 17px; line-height: 1.45; color: ${MUTED}; text-wrap: pretty; }
  .window { position: absolute; left: 530px; top: 80px; width: 760px; overflow: hidden; border-radius: 14px; background: ${GROUND}; box-shadow: 0 30px 80px -20px #000c, 0 0 0 1px #ffffff1f; }
  .window > img { display: block; width: 100%; }
  .bar { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; background: #1c1216; border-bottom: 1px solid #ffffff14; }
  .bar i { width: 10px; height: 10px; border-radius: 50%; background: #ffffff2e; }
  .bar span { margin-left: 14px; padding: 4px 14px; border-radius: 8px; background: #ffffff12; color: ${MUTED}; font-size: 11px; }
  .phone { position: absolute; left: 445px; top: 150px; width: 190px; padding: 7px; border-radius: 34px; background: #0b0608; box-shadow: 0 30px 70px -18px #000e, 0 0 0 1px #ffffff26; }
  .phone img { display: block; width: 100%; border-radius: 28px; }
</style></head><body>
  <div class="glow">${mark}</div>
  <div class="window">
    <div class="bar"><i></i><i></i><i></i><span>localassistant.example.com</span></div>
    <img src="${desktop}" alt="">
  </div>
  <div class="phone"><img src="${phone}" alt=""></div>
  <div class="words">
    <div class="brand">${mark}LocalAssistant</div>
    <h1>Your home. Your server.</h1>
    <p>Blinds and heat pumps on one page, no cloud account to babysit.</p>
  </div>
</body></html>`;

const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: { width: 1024, height: 500 },
	deviceScaleFactor: 2,
});
const tab = await context.newPage();
await tab.setContent(page, { waitUntil: "load" });
await Bun.write(
	join(images, "feature.webp"),
	await new Image(await tab.screenshot()).webp({ quality: 92 }).bytes(),
);
await browser.close();
process.stdout.write("docs/images/feature.webp\n");
