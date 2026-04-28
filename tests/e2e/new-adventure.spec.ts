import { expect, test } from "@playwright/test";

test("玩家可以创建、游玩并继续一段 mock 冒险", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Isekai" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续冒险" })).toHaveCount(0);

  await page.getByRole("button", { name: "开始新冒险" }).click();

  const worldSeedDialog = page.getByRole("dialog", { name: "选择世界种子" });
  await expect(worldSeedDialog).toBeVisible();
  await expect(worldSeedDialog.getByRole("heading", { name: "异世界" })).toBeVisible();

  await worldSeedDialog.getByRole("button", { name: "选择这个世界" }).first().click();

  await expect(page.getByText(/正在为.*构思冒险入口/u)).toBeVisible();

  const candidateDialog = page.getByRole("dialog", { name: "选择冒险候选" });
  await expect(candidateDialog).toBeVisible();
  await expect(candidateDialog.getByRole("heading", { name: "断塔召唤" })).toBeVisible();
  await expect(candidateDialog.getByText("银色符文在脚下熄灭")).toHaveCount(0);
  await expect(candidateDialog.getByText("召唤事故释放了旧魔王的封印碎片")).toHaveCount(0);

  const firstCandidate = candidateDialog.locator(".candidate-card").filter({
    hasText: "断塔召唤"
  });

  await firstCandidate.getByRole("radio", { name: /局内人/u }).check();
  await firstCandidate.getByRole("button", { name: "开始这个冒险" }).click();

  await expect(page.getByRole("heading", { name: "你要怎么做？" })).toBeVisible({
    timeout: 30_000
  });
  await expect(
    page.getByText("银色符文在脚下熄灭，塔外传来冒险者公会的警钟。")
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "旅途见闻" })).toBeVisible();
  await expect(page.getByText("局内人")).toBeVisible();
  await expect(page.getByRole("button", { name: /地点 断星高塔/u })).toBeVisible();
  await expect(page.getByText("当前章节")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "当前目标" })).toHaveCount(0);
  await expect(page.getByText("胜利条件")).toHaveCount(0);
  await expect(page.getByText("失败条件")).toHaveCount(0);
  await expect(page.getByText("召唤事故释放了旧魔王的封印碎片")).toHaveCount(0);

  await page.getByRole("textbox", { name: "你的下一步行动" }).fill("我尝试调查高塔入口");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText(/你开始行动。断星高塔/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "继续向 莉瑟 追问线索" })).toBeVisible();
  await expect(page.getByText("有新见闻")).toBeVisible();

  await page.getByRole("button", { name: "查看" }).click();

  const memoryDialog = page.getByRole("dialog", { name: "旅途见闻" });
  await expect(memoryDialog).toBeVisible();
  await memoryDialog.getByRole("button", { name: "线索" }).click();
  await expect(memoryDialog.getByRole("heading", { name: "断星高塔的异常痕迹" })).toBeVisible();
  await memoryDialog.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "返回首页" }).click();

  await expect(page.getByRole("heading", { name: "Isekai" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续冒险" })).toBeVisible();

  await page.getByRole("button", { name: "继续冒险" }).click();

  await expect(page.getByRole("heading", { name: "断塔召唤" })).toBeVisible();
  await expect(page.getByText(/你开始行动。断星高塔/u)).toBeVisible();
});
