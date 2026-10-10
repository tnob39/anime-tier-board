import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "test-results", "personal-ai-routes");
let browser, bundle;
const styles = ["app/globals.css", "components/status-bottom-sheet.css", "components/ui/bottom-sheet.css", "components/personal-ai-handoff.css"].map((p) => readFileSync(path.join(root,p), "utf8")).join("\n");
before(async () => {
  mkdirSync(output,{recursive:true});
  await new Promise((resolve,reject) => {
    const compiler = webpack({ mode:"development",devtool:false,target:"web",context:root,
      entry:path.join(root,"tests/personal-ai-routes-browser-entry.tsx"),output:{path:output,filename:"feature.js"},
      resolve:{extensions:[".tsx",".ts",".js"],alias:{"@":root}},externals:{"next/link":"window __aiLink","next/navigation":"window __aiNavigation"},
      module:{rules:[{test:/\.(tsx?|css)$/,exclude:/node_modules/,use:path.join(root,"tests/impressions-tsx-loader.cjs")}]}
    });
    compiler.run((error,stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({all:false,errors:true}))) : resolve()));
  });
  bundle=readFileSync(path.join(output,"feature.js"),"utf8");
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();});
async function harness(routeName) {
  const context=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:"block"});
  const page=await context.newPage(), requests=[], errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await context.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/test") return route.fulfill({contentType:"text/html",body:'<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'});
    requests.push({url:url.pathname,method:route.request().method()});
    if(url.pathname==="/api/anime/seasonal") return route.fulfill({contentType:"application/json",body:JSON.stringify({items:[],freshness:"fresh",source:"anilist",fetchedAt:"2026-10-01T00:00:00Z"})});
    return route.abort();
  });
  await page.goto("https://ai-routes.test/test?year=2026&season=FALL");
  await page.evaluate(routeName=>{
    localStorage.setItem("numanie-display-mode","simple");
    window.fixture={route:routeName,records:[{animeId:"anilist-1",anime:{id:"anilist-1",source:"anilist",title:"根拠の作品",imageUrl:"https://sentinel.test/art.jpg",siteUrl:"https://anilist.co/anime/1"},status:"completed",notes:"PRIVATE_NOTE",favoriteLevel:5,updatedAt:"PRIVATE_TIMESTAMP"}]};
    window.storageWrites=0;
    const old=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){window.storageWrites++;return old.apply(this,args);};
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}});
  },routeName);
  await page.addStyleTag({content:styles});await page.addScriptTag({content:bundle});
  return {page,requests,close:async()=>{
    assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.storageWrites),0);
    assert.equal(await page.locator("img").count(),0);
    assert.ok(requests.every(r=>r.url==="/api/anime/seasonal" && r.method==="GET"));
    await context.close();
  }};
}
for(const label of ["作品を知る","似た作品を探す"]) test(`production shared detail → ${label}: exact copy, Escape returns to detail, private tracking excluded`,async()=>{
  const h=await harness("detail");try{
    await h.page.getByRole("button",{name:"作品詳細を開く"}).click();
    await h.page.getByRole("button",{name:"AIに相談",exact:true}).click();
    await h.page.getByRole("button",{name:label,exact:true}).click();
    const prompt=await h.page.getByLabel("プロンプト全文（この文字列をコピー）").inputValue();
    assert.ok(prompt.includes("根拠の作品"));assert.ok(!prompt.includes("PRIVATE_"));
    await h.page.getByRole("button",{name:"プロンプトをコピー"}).click();
    await expect(h.page.getByText("全文をコピーしました。このコピー操作ではAIに送信しません。",{exact:true})).toBeVisible();
    assert.equal(await h.page.evaluate(()=>window.copiedPrompt),prompt);
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("button",{name:"AIに相談",exact:true})).toBeVisible();
    assert.equal(h.requests.length,0);
  }finally{await h.close();}
});
test("production /explore heading → taste: explicit saved-title evidence, no private tracking, reopen resets",async()=>{
  const h=await harness("explore");try{
    await expect(h.page.getByText("読み込み中",{exact:true})).toHaveCount(0);
    await h.page.getByRole("button",{name:"AIに相談",exact:true}).click();
    await expect(h.page.getByRole("button",{name:"作品を知る",exact:true})).toBeDisabled();
    await h.page.getByRole("button",{name:"好きそうな作品を探す",exact:true}).click();
    await expect(h.page.getByRole("button",{name:"プロンプトをコピー"})).toBeDisabled();
    await h.page.getByLabel("根拠の作品を根拠にする").check();
    const prompt=await h.page.getByLabel("プロンプト全文（この文字列をコピー）").inputValue();
    assert.ok(prompt.includes("根拠の作品"));assert.ok(!prompt.includes("PRIVATE_"));
    await h.page.getByRole("button",{name:"プロンプトをコピー"}).click();
    await expect(h.page.getByText("全文をコピーしました。このコピー操作ではAIに送信しません。",{exact:true})).toBeVisible();
    assert.equal(await h.page.evaluate(()=>window.copiedPrompt),prompt);
    await h.page.keyboard.press("Escape");
    await h.page.getByRole("button",{name:"AIに相談",exact:true}).click();
    await expect(h.page.getByRole("button",{name:"作品を知る",exact:true})).toBeDisabled();
    await h.page.getByRole("button",{name:"好きそうな作品を探す",exact:true}).click();
    await expect(h.page.getByLabel("根拠の作品を根拠にする")).not.toBeChecked();
  }finally{await h.close();}
});
