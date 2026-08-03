import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { parseShortcutHash } from "../app/shortcut-entry.ts";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Hanami metadata and loading state", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-Hant">/);
  assert.match(html, /<title>花見｜信用卡花費帳本<\/title>/);
  assert.match(html, /安心掌握每一筆信用卡花費/);
  assert.match(html, /正在整理你的帳本/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps financial records device-local and provides recovery", async () => {
  const [page, manifest, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /indexedDB\.open/);
  assert.match(page, /花見備份/);
  assert.match(page, /花見消費/);
  assert.match(page, /parseNotification/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|fetch\(/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(worker, /caches\.open/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("parses iOS Shortcut hash options", async () => {
  assert.deepEqual(
    parseShortcutHash("#amount=1,280&merchant=%E5%85%A8%E8%81%AF&last4=1234&category=%E9%A4%90%E9%A3%B2&date=2026-08-03&save=1"),
    { amount: 1280, merchant: "全聯", last4: "1234", category: "餐飲", date: "2026-08-03", autoSave: true },
  );
  assert.deepEqual(
    parseShortcutHash("#?%E9%87%91%E9%A1%8D=99&%E5%95%86%E5%AE%B6=%E5%92%96%E5%95%A1"),
    { amount: 99, merchant: "咖啡", last4: undefined, category: undefined, date: undefined, autoSave: false },
  );
  assert.equal(parseShortcutHash("#section"), null);
  assert.deepEqual(
    parseShortcutHash("#amount=-1&last4=12&date=2026-02-30"),
    { amount: undefined, merchant: undefined, last4: undefined, category: undefined, date: undefined, autoSave: false },
  );
  assert.equal(parseShortcutHash("#save=1"), null);

  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /history\.replaceState/);
  assert.match(page, /確認並儲存/);
  assert.match(page, /shortcut\.autoSave/);
});
