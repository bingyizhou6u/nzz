# 正式版前端交互重构计划 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前偏 MVP/功能测试台的前端，重构成适合真实录入、审核、报表分析和月结闭环的正式内部管理会计工作台。

**Architecture:** 保留现有 React 单页应用、Cloudflare Worker API、D1 schema、权限模型和所有会计入账逻辑。前端重构采用“交互基础组件 -> 页面工作流 -> 视觉统一 -> 验收”的顺序，每个任务可独立提交和部署；任何任务不得改变 FIFO、备用金、借款、冲正、报表和月结的业务语义。

**Tech Stack:** React 19, TypeScript, Vite, Vitest, native CSS, Cloudflare Workers, D1.

---

## 1. 背景判断

当前系统后端闭环已经明显强于前端：

- 单据录入字段太集中，用户需要理解底层单据模型才能正确填写。
- 列表、详情、操作没有形成稳定模式，很多操作挤在表格最后一列。
- 报表中心虽然已经分组，但筛选、版本、摘要、钻取和导出之间的关系还不够清楚。
- 月结中心功能存在，但用户不知道“下一步应该做什么”。
- 基础资料有治理能力，但真实初始化时缺少“数据质量”和“录入引导”。
- 全局样式偏朴素，按钮层级、状态反馈、空状态、加载状态和错误反馈还不统一。

这次重构不是换皮，而是把核心业务流程改成可理解、可操作、可验收的产品界面。

## 2. 设计原则

1. **任务优先**：每个页面都要回答“用户现在该做什么”。
2. **左列表 + 右详情**：单据、审核、月结检查等处理型页面统一采用记录列表和详情操作区。
3. **渐进披露**：录入和月结使用步骤化流程，先选场景，再显示字段，再预览影响。
4. **上下文固定**：页面上方持续显示当前身份、当前期间、当前数据来源、当前状态。
5. **状态必须可见**：加载、保存中、成功、失败、只读、无权限、空数据都必须有明确 UI。
6. **不引入大型 UI 库**：先扩展现有 `src/app/components/ui.tsx` 和 CSS；只有明确需要图表库时另开计划。
7. **不改业务语义**：前端只组织交互，不改变入账、审核、报表、月结、锁账和权限规则。
8. **可测试优先**：复杂判断放进 model/helper 文件，用 Vitest 覆盖；页面行为用现有 React render 测试覆盖。

## 3. 非目标

本计划不包含：

- Excel/CSV 导入。
- 新的数据库 schema。
- 改动 Worker API 的核心会计语义。
- 改动 Cloudflare Access 登录方案。
- 迁移到 Cloudflare Pages。
- 清理生产演示数据。生产演示数据已确认保留，真实数据必须与 `demo_*` 数据隔离。

如果页面交互必须新增 API，只允许新增薄 API 或扩展现有页面 API，不允许把会计规则搬到前端。

部署决策：

- 继续使用 **Cloudflare Workers + Workers Static Assets + D1**。
- 前端静态资源由 `wrangler.jsonc` 的 `assets.directory = "./dist/client"` 绑定到同一个 Worker。
- 后端 API 和前端保持同域部署，Cloudflare Access 保护同一个 Workers hostname。
- 不使用 Cloudflare Pages；除非未来明确拆分为独立前端站点和独立 API Worker，否则不重新评估 Pages。

## 4. 文件结构

重点修改或新增：

- Modify: `src/app/App.tsx`
- Modify: `src/app/layout/AppShell.tsx`
- Modify: `src/app/layout/PageHeader.tsx`
- Modify: `src/app/components/ui.tsx`
- Modify: `src/app/components/ui.test.tsx`
- Modify: `src/app/pages/WorkspacePage.tsx`
- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/DocumentsPage.test.ts`
- Modify: `src/app/pages/documents/documentEntryModel.ts`
- Modify: `src/app/pages/documents/documentEntryModel.test.ts`
- Modify: `src/app/pages/documents/DocumentTypeFields.tsx`
- Modify: `src/app/pages/ReviewCenterPage.tsx`
- Modify: `src/app/pages/ReviewCenterPage.test.ts`
- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/pages/ReportsPage.test.tsx`
- Modify: `src/app/pages/reports/reportExperience.ts`
- Modify: `src/app/pages/reports/reportGroups.tsx`
- Modify: `src/app/pages/reports/ReportTable.tsx`
- Modify: `src/app/pages/MonthClosePage.tsx`
- Modify: `src/app/pages/month-close/monthCloseApi.ts`
- Modify: `src/app/pages/month-close/monthCloseModel.ts`
- Modify: `src/app/pages/month-close/monthCloseModel.test.ts`
- Modify: `src/app/pages/month-close/MonthCloseChecksTab.tsx`
- Modify: `src/app/pages/month-close/MonthCloseReconciliationTabs.tsx`
- Modify: `src/app/pages/month-close/MonthCloseSnapshotsTab.tsx`
- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/master-data/*Tab.tsx`
- Modify: `src/app/styles.css`

可按任务新增：

- Create: `src/app/components/interaction.tsx`
- Create: `src/app/components/interaction.test.tsx`
- Create: `src/app/pages/documents/documentWorkflowModel.ts`
- Create: `src/app/pages/documents/documentWorkflowModel.test.ts`
- Create: `src/app/pages/month-close/monthCloseWorkflowModel.ts`
- Create: `src/app/pages/month-close/monthCloseWorkflowModel.test.ts`

## 5. 分阶段执行

推荐顺序：

1. Task 1 - 交互基础组件和布局规则。
2. Task 2 - 全局 AppShell 和工作台上下文。
3. Task 3 - 单据中心交互模型。
4. Task 4 - 单据中心页面重构。
5. Task 5 - 审核中心页面重构。
6. Task 6 - 报表中心分析工作台重构。
7. Task 7 - 月结中心流程向导和锁账入口。
8. Task 8 - 基础资料初始化体验优化。
9. Task 9 - 移动端、可访问性和全局视觉统一。
10. Task 10 - 生产验收清单和部署。

第一批建议只执行 Task 1-4。单据中心是数据源入口，优先级最高。

---

## Task 1: 交互基础组件和布局规则

**目标：** 建立页面后续共用的交互组件，避免每个页面继续自己拼按钮、状态、空数据和详情区。

**Files:**

- Create: `src/app/components/interaction.tsx`
- Create: `src/app/components/interaction.test.tsx`
- Modify: `src/app/components/ui.tsx`
- Modify: `src/app/components/ui.test.tsx`
- Modify: `src/app/styles.css`

**组件范围：**

- `PageActionBar`：页面级主操作区。
- `FilterStrip`：筛选条件横条。
- `SplitWorkspace`：左列表 + 右详情布局。
- `RecordList`：可选择记录列表。
- `DetailPanel`：右侧详情容器。
- `WorkflowStepper`：步骤进度。
- `ConfirmAction`：带确认的危险动作。

**Steps:**

- [x] Step 1: 在 `src/app/components/interaction.test.tsx` 写 RED 测试，覆盖 `WorkflowStepper` 当前步骤、`RecordList` 选中态、`ConfirmAction` 二次确认。
- [x] Step 2: 运行 `npm test -- src/app/components/interaction.test.tsx`，预期失败，因为文件和组件不存在。
- [x] Step 3: 创建 `src/app/components/interaction.tsx`，实现上述组件，不引入外部 UI 库。
- [x] Step 4: 在 `src/app/styles.css` 添加 `.split-workspace`、`.record-list`、`.detail-panel`、`.workflow-stepper`、`.page-action-bar` 等基础样式。
- [x] Step 5: 运行 `npm test -- src/app/components/interaction.test.tsx src/app/components/ui.test.tsx`。
- [x] Step 6: 运行 `npx tsc --noEmit`。
- [x] Step 7: 提交。

```bash
git add src/app/components/interaction.tsx src/app/components/interaction.test.tsx src/app/components/ui.tsx src/app/components/ui.test.tsx src/app/styles.css
git commit -m "feat: add formal interaction primitives"
```

**验收标准：**

- 所有页面后续都能复用同一套列表、详情、步骤、确认和筛选容器。
- 移动端 `.split-workspace` 自动变成单列。
- 所有可点击区域有清晰 focus-visible 状态。

**完成记录（2026-04-26）：**

- 实现提交：`eaf0d02`、`9dfc073`、`41ec685`、`15d0bd4`。
- 质量修复：`ConfirmAction` 支持异步防重入、失败重试、焦点回迁和 disabled 状态下可取消；`RecordList` 使用普通 `ul > li > button`，不伪装成 listbox，选择行为依赖原生 button click。
- 验证：`npm test`、`npx tsc --noEmit`、`npm run build`、`git diff --check` 均通过。

---

## Task 2: 全局 AppShell 和工作台上下文优化

**目标：** 让系统入口更像正式业务系统，而不是页面集合。登录身份、权限、当前期间、数据来源和下一步任务要清晰。

**Files:**

- Modify: `src/app/layout/AppShell.tsx`
- Modify: `src/app/layout/PageHeader.tsx`
- Modify: `src/app/pages/WorkspacePage.tsx`
- Modify: `src/app/pages/workspace/workspaceModel.ts`
- Modify: `src/app/pages/workspace/workspaceModel.test.ts`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/styles.css`

**交互改造：**

- 侧边栏保留，但增强当前页面说明和 active 状态。
- 顶部状态栏显示：当前用户、角色、生产环境提示、当前数据模式。
- 工作台改成“下一步任务”：
  - 待提交草稿。
  - 待审核单据。
  - 待处理月结异常。
  - 常用入口。
  - 演示数据提醒。

**Steps:**

- [x] Step 1: 在 `workspaceModel.test.ts` 增加 `buildWorkspaceNextActions()` 测试，输入单据统计和权限，输出明确任务列表。
- [x] Step 2: 运行 `npm test -- src/app/pages/workspace/workspaceModel.test.ts`，预期 RED。
- [x] Step 3: 在 `workspaceModel.ts` 实现 `buildWorkspaceNextActions()`。
- [x] Step 4: 改造 `WorkspacePage.tsx`，将旧的卡片改成“待办 + 快捷入口 + 演示数据提醒”。
- [x] Step 5: 改造 `AppShell.tsx`，顶部状态栏更清晰，但不增加退出登录功能，因为 Cloudflare Access 负责登录态。
- [x] Step 6: 运行 `npm test -- src/app/pages/WorkspacePage.test.tsx src/app/App.test.tsx src/app/pages/workspace/workspaceModel.test.ts`。
- [x] Step 7: 运行 `npx tsc --noEmit` 和 `npm run build`。
- [x] Step 8: 提交。

```bash
git add src/app/layout/AppShell.tsx src/app/layout/PageHeader.tsx src/app/pages/WorkspacePage.tsx src/app/pages/workspace/workspaceModel.ts src/app/pages/workspace/workspaceModel.test.ts src/app/App.test.tsx src/app/styles.css
git commit -m "feat: improve formal workspace context"
```

**验收标准：**

- 登录后默认看到“下一步该做什么”。
- 演示数据保留策略能在工作台被理解，不误导为真实业务数据。
- 页面标题、状态和主要操作位置统一。

**完成记录（2026-04-26）：**

- 新增 `buildWorkspaceNextActions()`，按单据统计和权限生成审核、退回修正、草稿提交、月结检查和常用入口任务。
- 工作台改为“下一步任务 + 待办明细 + 单据快照 + 常用入口 + 演示数据提醒”。
- AppShell 顶部状态栏显示 Cloudflare Workers 部署目标、演示数据保留模式、当前演示期间和当前登录身份；侧边栏增加页面上下文说明。
- 验证：`npm test`、`npx tsc --noEmit`、`npm run build`、`npm audit --audit-level=high`、`git diff --check` 均通过。

---

## Task 3: 单据中心交互模型

**目标：** 把单据录入从“字段堆叠”改成“业务场景 -> 字段 -> 预览 -> 保存”的流程，为页面重构做纯函数基础。

**Files:**

- Create: `src/app/pages/documents/documentWorkflowModel.ts`
- Create: `src/app/pages/documents/documentWorkflowModel.test.ts`
- Modify: `src/app/pages/documents/documentEntryModel.ts`
- Modify: `src/app/pages/documents/documentEntryModel.test.ts`

**模型范围：**

- 单据业务分类：
  - 收入业务：项目收入。
  - 资金业务：换汇、账户划转。
  - 备用金业务：发放、退回、报销。
  - 借款业务：借出、还款、核销。
  - 冲正业务：基于原单据。
- 分步状态：
  - `type`
  - `details`
  - `review`
- 每类单据的必填提示、下一步可用性、摘要文案。

**Steps:**

- [x] Step 1: 写 `documentWorkflowModel.test.ts`，覆盖 `documentTypeGroup()`、`entryStepState()`、`nextStepLabel()` 和 `documentScenarioCards()`。
- [x] Step 2: 运行 `npm test -- src/app/pages/documents/documentWorkflowModel.test.ts`，预期 RED。
- [x] Step 3: 实现 `documentWorkflowModel.ts`，只写纯函数，不调用 API。
- [x] Step 4: 扩展 `documentEntryModel.test.ts`，确认现有 payload builder 不因步骤化而改变入参和输出。
- [x] Step 5: 运行：

```bash
npm test -- src/app/pages/documents/documentWorkflowModel.test.ts src/app/pages/documents/documentEntryModel.test.ts
npx tsc --noEmit
```

- [x] Step 6: 提交。

```bash
git add src/app/pages/documents/documentWorkflowModel.ts src/app/pages/documents/documentWorkflowModel.test.ts src/app/pages/documents/documentEntryModel.ts src/app/pages/documents/documentEntryModel.test.ts
git commit -m "feat: add document workflow interaction model"
```

**验收标准：**

- 页面可以根据业务场景决定显示字段和下一步状态。
- 业务语义仍由现有 `buildDocumentPayload()` 和后端校验兜底。
- 纯函数测试能覆盖常见单据类型。

**完成记录（2026-04-26）：**

- 新增 `documentWorkflowModel.ts`，提供单据业务分类、场景卡片、三步状态、缺失字段提示和下一步按钮文案。
- 导出 `documentFieldLabel()`，让 workflow 文案复用现有单据字段中文标签，不复制字段语义。
- 补充 payload 回归测试，确认进入 review 状态后 `buildDocumentPayload()` 的项目收入输出保持不变。
- 验证：`npm test`、`npx tsc --noEmit`、`npm run build`、`npm audit --audit-level=high`、`git diff --check` 均通过。

---

## Task 4: 单据中心页面重构

**目标：** 将单据中心改成真实可用的数据源入口：左侧列表，右侧详情或创建向导。

**Files:**

- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/DocumentsPage.test.ts`
- Modify: `src/app/pages/documents/DocumentTypeFields.tsx`
- Modify: `src/app/pages/documents/DocumentEntrySelectors.tsx`
- Modify: `src/app/styles.css`
- Create: `src/app/pages/documents/documentPageModel.ts`

**交互改造：**

- 左侧：单据列表 + 状态筛选 + 类型筛选 + 搜索。
- 右侧默认：选中单据详情。
- 点击“新建单据”：右侧切换成创建向导。
- 创建向导：
  1. 选择业务场景。
  2. 填写业务字段。
  3. 校验和影响摘要。
  4. 创建草稿。
- 操作按钮在详情区：提交、通过、退回。
- 退回必须输入原因，不能固定写死“退回修改”。

**Steps:**

- [x] Step 1: 在 `DocumentsPage.test.ts` 增加页面行为测试：选择记录后右侧出现详情；点击新建后进入向导；筛选状态只影响左侧列表。
- [x] Step 2: 运行 `npm test -- src/app/pages/DocumentsPage.test.ts`，预期 RED。
- [x] Step 3: 改造 `DocumentsPage.tsx` 使用 `SplitWorkspace`，维护 `selectedDocumentId` 和 `rightPanelMode`。
- [x] Step 4: 将原 `form` 区域改成步骤化向导，复用 `DocumentTypeFields`。
- [x] Step 5: 改造 workflow action，提交/通过/退回都在右侧详情区完成；退回原因使用输入框。
- [x] Step 6: 添加移动端样式，列表和详情上下排列，操作按钮固定在详情区底部。
- [x] Step 7: 运行：

```bash
npm test -- src/app/pages/DocumentsPage.test.ts src/app/pages/documents/documentEntryModel.test.ts src/app/pages/documents/documentWorkflowModel.test.ts
npx tsc --noEmit
npm run build
```

- [x] Step 8: 用本地 `npm run cf:dev` 打开系统，手工验证演示数据下：
  - 创建项目收入草稿。
  - 创建换汇草稿。
  - 创建备用金报销草稿。
  - 筛选草稿和待审核。
- [x] Step 9: 提交。

```bash
git add src/app/pages/DocumentsPage.tsx src/app/pages/DocumentsPage.test.ts src/app/pages/documents/DocumentTypeFields.tsx src/app/pages/documents/DocumentEntrySelectors.tsx src/app/styles.css
git commit -m "feat: redesign document center workflow"
```

**验收标准：**

- 用户不用理解所有底层字段也能开始录入。
- 表格最后一列不再承担主要操作压力。
- 右侧详情区能解释当前记录、当前状态和可执行动作。

**完成记录（2026-04-26）：**

- 单据中心改为 `SplitWorkspace`：左侧 `RecordList` 负责筛选和选择，右侧 `DetailPanel` 负责详情、审批动作或新建向导。
- 左侧新增状态、类型、搜索筛选；筛选只影响列表，不清空右侧已选单据详情。
- 新建单据改为场景卡片 + `WorkflowStepper` + `DocumentTypeFields` + 预览保存；复用 Task 3 的 workflow model。
- 提交、通过、退回从表格操作列移到右侧详情区；退回必须填写原因后才可提交。
- 本地 Worker dev 使用 demo 数据验证：项目收入草稿、换汇草稿、备用金报销草稿均可创建；草稿筛选可读。
- 浏览器桥接工具当前超时，无法截图式手工验证；已用页面行为测试、生产 build、Worker API 和 demo 数据流验证兜底。
- 验证：`npm test`、`npx tsc --noEmit`、`npm run build`、`npm audit --audit-level=high`、`git diff --check` 均通过。

---

## Task 5: 审核中心页面重构

**目标：** 审核中心从“看表格点通过”升级为“看单据详情、看入账影响、做明确审批决定”。

**Files:**

- Modify: `src/app/pages/ReviewCenterPage.tsx`
- Modify: `src/app/pages/ReviewCenterPage.test.ts`
- Modify: `src/app/pages/review/reviewModel.ts`
- Modify: `src/app/pages/review/reviewModel.test.ts`
- Modify: `src/app/styles.css`

**交互改造：**

- 左侧审核队列显示风险和等待时间。
- 右侧顶部显示单据摘要和关键字段。
- 中部显示入账影响预览，按资金、备用金、借款、项目分组。
- 底部固定审批动作：
  - 通过。
  - 退回并填写原因。
- 切换单据时清空退回原因和旧消息。

**Steps:**

- [x] Step 1: 扩展 `reviewModel.test.ts`，覆盖审核风险排序、预览组标题、动作可用性。
- [x] Step 2: 运行 `npm test -- src/app/pages/review/reviewModel.test.ts`，预期 RED。
- [x] Step 3: 实现缺失 model helper。
- [x] Step 4: 改造 `ReviewCenterPage.tsx` 为 `SplitWorkspace`。
- [x] Step 5: 在 `ReviewCenterPage.test.ts` 覆盖：选中队列项、预览读取中、通过按钮禁用/启用、退回原因必填。
- [x] Step 6: 运行：

```bash
npm test -- src/app/pages/ReviewCenterPage.test.ts src/app/pages/review/reviewModel.test.ts
npx tsc --noEmit
```

- [x] Step 7: 提交。

```bash
git add src/app/pages/ReviewCenterPage.tsx src/app/pages/ReviewCenterPage.test.ts src/app/pages/review/reviewModel.ts src/app/pages/review/reviewModel.test.ts src/app/styles.css
git commit -m "feat: redesign review center interaction"
```

**验收标准：**

- 审核人能在同一屏完成“选单据 -> 看影响 -> 决策”。
- 退回原因不再是固定文案。
- 审核动作有清晰处理中状态和结果反馈。

**完成记录（2026-04-26）：**

- 审核中心改为 `SplitWorkspace`：左侧 `RecordList` 展示风险和等待时间，右侧 `DetailPanel` 承载详情、影响预览和审批动作。
- `reviewModel` 新增队列风险排序、正式影响分组和审批动作可用性 helper；影响预览按资金、备用金、借款、项目呈现。
- 底部审批动作区固定在详情面板内；通过必须等预览 ready，退回必须填写原因。
- 切换审核队列项会重新读取详情和预览，并清空旧退回原因和旧反馈消息。
- 验证：`npm test -- src/app/pages/ReviewCenterPage.test.ts src/app/pages/review/reviewModel.test.ts`、`npm test`、`npx tsc --noEmit`、`npm run build`、`npm audit --audit-level=high`、`git diff --check` 均通过。

---

## Task 6: 报表中心分析工作台重构

**目标：** 报表中心从“很多表格”变成可分析、可筛选、可钻取、可导出的管理报表工作台。

**Files:**

- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/pages/ReportsPage.test.tsx`
- Modify: `src/app/pages/reports/reportExperience.ts`
- Create: `src/app/pages/reports/reportExperience.test.ts`
- Modify: `src/app/pages/reports/reportGroups.tsx`
- Modify: `src/app/pages/reports/ReportTable.tsx`
- Modify: `src/app/pages/reports/reportExport.ts`
- Modify: `src/app/styles.css`

**交互改造：**

- 顶部固定筛选条：期间、项目、商户、人员、币种、实时/快照。
- 左侧报表分类：资金、项目、费用、备用金、借款、异常。
- 中间只显示当前分类。
- 每个分类先显示摘要，再显示主表，再显示钻取明细。
- 快照模式下明确禁用实时筛选，并显示快照版本。
- 导出按钮明确导出当前分类和当前数据来源。

**Steps:**

- [x] Step 1: 扩展 `reportExperience.ts` 测试，覆盖 `summaryCardsForGroup()`、快照上下文标签、导出命名上下文。
- [x] Step 2: 运行 `npm test -- src/app/pages/reports/reportFilters.test.ts src/app/pages/ReportsPage.test.tsx`，确认现有基线。
- [x] Step 3: 改造 `ReportsPage.tsx` 的顶部筛选条和报表分类布局，保留现有 API 读取方式。
- [x] Step 4: 改造 `ReportTable.tsx`，增加空状态、行数、横向滚动提示和紧凑表格样式。
- [x] Step 5: 改造 `reportGroups.tsx`，每组只暴露最重要主表，次级表使用折叠区或明确标题。
- [x] Step 6: 运行：

```bash
npm test -- src/app/pages/ReportsPage.test.tsx src/app/pages/reports/reportFilters.test.ts
npx tsc --noEmit
npm run build
```

- [x] Step 7: 本地手工验收：
  - 实时数据读取。
  - 切换报表分类。
  - 项目利润钻取。
  - 选择已结账快照。
  - 导出 CSV/XLSX。
- [x] Step 8: 提交。

```bash
git add src/app/pages/ReportsPage.tsx src/app/pages/ReportsPage.test.tsx src/app/pages/reports/reportExperience.ts src/app/pages/reports/reportExperience.test.ts src/app/pages/reports/reportGroups.tsx src/app/pages/reports/ReportTable.tsx src/app/pages/reports/reportExport.ts src/app/styles.css
git commit -m "feat: redesign report analysis workspace"
```

**验收标准：**

- 报表不再全部堆叠。
- 用户能清楚知道当前是实时数据还是快照数据。
- 导出结果和当前选择一致。

**完成记录（2026-04-26）：**

- 报表中心顶部改为 `report-control-panel`：同屏展示数据源、快照版本、筛选条件、读取状态和快照筛选禁用说明。
- 新增 `reportExperience.test.ts`，覆盖摘要卡、实时/快照上下文标签、导出上下文标签。
- 工作台导出区显示当前导出上下文；CSV 导出当前分类，快照 XLSX 仍导出月结包。
- `ReportTable` 增加描述、行数、空状态说明和横向滚动提示。
- 各分类改成主表优先，次级表进入 `details.report-secondary-section` 折叠区；项目钻取仍在当前分类内展开。
- 页面行为测试覆盖实时读取、分类切换、项目利润钻取、快照读取、CSV/XLSX 导出。
- 验证：`npm test -- src/app/pages/ReportsPage.test.tsx src/app/pages/reports/reportFilters.test.ts src/app/pages/reports/reportExperience.test.ts`、`npm test`、`npx tsc --noEmit`、`npm run build`、`npm audit --audit-level=high`、`git diff --check` 均通过。

---

## Task 7: 月结中心流程向导和锁账入口

**目标：** 将月结中心改成流程闭环：选期间、运行检查、处理异常、看对账、锁账、看快照。

**Files:**

- Create: `src/app/pages/month-close/monthCloseWorkflowModel.ts`
- Create: `src/app/pages/month-close/monthCloseWorkflowModel.test.ts`
- Modify: `src/app/pages/MonthClosePage.tsx`
- Modify: `src/app/pages/month-close/monthCloseApi.ts`
- Modify: `src/app/pages/month-close/monthCloseModel.ts`
- Modify: `src/app/pages/month-close/monthCloseModel.test.ts`
- Modify: `src/app/pages/month-close/MonthCloseChecksTab.tsx`
- Modify: `src/app/pages/month-close/MonthCloseStatusBar.tsx`
- Modify: `src/app/styles.css`

**交互改造：**

- 顶部 `WorkflowStepper`：
  1. 选择期间。
  2. 运行检查。
  3. 处理异常。
  4. 对账确认。
  5. 锁账快照。
- 增加锁账按钮和锁账说明输入。
- 增加解锁入口，但必须确认原因，并且只对有 `periodLocks.unlock` 权限的用户显示。
- 检查清单采用左侧异常列表 + 右侧处理区，减少超宽表格压力。

**Steps:**

- [x] Step 1: 写 `monthCloseWorkflowModel.test.ts`，覆盖：未检查、检查中、阻断、可锁账、已锁账的步骤状态。
- [x] Step 2: 运行 `npm test -- src/app/pages/month-close/monthCloseWorkflowModel.test.ts`，预期 RED。
- [x] Step 3: 实现 `monthCloseWorkflowModel.ts`。
- [x] Step 4: 在 `monthCloseApi.ts` 增加 `lockMonthClosePeriod(period, note)` 和 `unlockMonthClosePeriod(period, reason)` 前端 API helper。
- [x] Step 5: 改造 `MonthClosePage.tsx`，增加锁账/解锁交互和流程步骤。
- [x] Step 6: 改造 `MonthCloseChecksTab.tsx`，让异常处理更像任务列表。
- [x] Step 7: 运行：

```bash
npm test -- src/app/pages/month-close/monthCloseModel.test.ts src/app/pages/month-close/monthCloseWorkflowModel.test.ts src/app/pages/month-close/MonthCloseReconciliationTabs.test.tsx
npx tsc --noEmit
npm run build
```

- [x] Step 8: 本地 API 烟测：
  - 运行检查。
  - warning 未处理时锁账被阻断。
  - 处理 warning 后锁账。
  - 查看快照。
  - 解锁后历史快照保留。
- [x] Step 9: 提交。

```bash
git add src/app/pages/MonthClosePage.tsx src/app/pages/month-close/monthCloseApi.ts src/app/pages/month-close/monthCloseModel.ts src/app/pages/month-close/monthCloseModel.test.ts src/app/pages/month-close/monthCloseWorkflowModel.ts src/app/pages/month-close/monthCloseWorkflowModel.test.ts src/app/pages/month-close/MonthCloseChecksTab.tsx src/app/pages/month-close/MonthCloseStatusBar.tsx src/app/styles.css
git commit -m "feat: add month close workflow guidance"
```

**验收标准：**

- 月结页面明确告诉用户当前卡在哪一步。
- 锁账/解锁入口在前端可用，且有说明/原因输入。
- 未处理 critical/warning 仍由后端阻断，前端只展示原因。

**完成记录（2026-04-26）：**

- 已提交 `0c96839 feat: add month close workflow guide`。
- Task 10 本地 Worker 验收中再次跑通月结 API 闭环：`2026-04` 运行检查、3 条检查结果处理为 waived、锁账成功、生成 1 个快照，并能读取 funding/pettyCash/loans/projects 对账分区。

---

## Task 8: 基础资料初始化体验优化

**目标：** 保留演示数据的前提下，让真实基础资料初始化更安全、更清楚。

**Files:**

- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/master-data/MasterDataOverview.tsx`
- Modify: `src/app/pages/master-data/PeopleTab.tsx`
- Modify: `src/app/pages/master-data/ProjectsTab.tsx`
- Modify: `src/app/pages/master-data/MerchantsTab.tsx`
- Modify: `src/app/pages/master-data/AccountsTab.tsx`
- Modify: `src/app/pages/master-data/masterDataModel.ts`
- Modify: `src/app/pages/master-data/masterDataModel.test.ts`
- Modify: `src/app/styles.css`

**交互改造：**

- 概览区显示“演示资料”和“真实资料”数量。
- `demo_*` 行显示演示标签。
- 新增真实资料时提示不要复用演示期间和演示账户。
- 人员页突出登录邮箱和角色权限。
- 项目/商户/账户页增加搜索和启用状态筛选。

**Steps:**

- [x] Step 1: 扩展 `masterDataModel.test.ts`，覆盖 `isDemoRecord()`、`masterDataReadiness()`、`personLoginStatus()`。
- [x] Step 2: 运行 `npm test -- src/app/pages/master-data/masterDataModel.test.ts`，预期 RED。
- [x] Step 3: 实现模型 helper。
- [x] Step 4: 改造 `MasterDataOverview.tsx`，显示真实初始化进度。
- [x] Step 5: 改造各 Tab 的列表行，增加演示标签和更清晰的编辑入口。
- [x] Step 6: 运行：

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

- [x] Step 7: 提交。

```bash
git add src/app/pages/MasterDataPage.tsx src/app/pages/master-data/MasterDataOverview.tsx src/app/pages/master-data/PeopleTab.tsx src/app/pages/master-data/ProjectsTab.tsx src/app/pages/master-data/MerchantsTab.tsx src/app/pages/master-data/AccountsTab.tsx src/app/pages/master-data/masterDataModel.ts src/app/pages/master-data/masterDataModel.test.ts src/app/styles.css
git commit -m "feat: improve master data initialization experience"
```

**验收标准：**

- 用户能分辨演示资料和真实资料。
- 初始化真实资料时，不会误改演示数据。
- 登录管理员、普通人员、后勤、借款人的配置状态清晰。

**完成记录（2026-04-26）：**

- 已提交 `d9461f7 feat: improve master data initialization experience`。
- Task 10 本地 Worker UI smoke 显示基础资料治理页可读取，概览展示真实资料、演示资料和初始化进度。
- 生产 D1 只读核对：people 共 4 条，其中 demo 3 条、真实 1 条；projects/merchants/accounts 仍保留演示资料，真实资料尚待初始化。

---

## Task 9: 移动端、可访问性和全局视觉统一

**目标：** 做一次系统级交互质量收口，解决前面各页面改造后的视觉和响应式不一致。

**Files:**

- Modify: `src/app/styles.css`
- Modify: `src/app/components/ui.tsx`
- Modify: `src/app/components/interaction.tsx`
- Modify: page tests as needed.

**检查范围：**

- 360px、768px、1440px 三档宽度。
- 键盘 Tab 顺序。
- 所有按钮 hover/focus/disabled。
- 表格横向滚动提示。
- 长文本不溢出。
- 表单错误不会遮挡字段。
- 空状态和错误状态文案一致。

**Steps:**

- [x] Step 1: 用浏览器检查工作台、单据、审核、报表、基础资料、月结六个页面。
- [x] Step 2: 修复 `.panel-header`、`.header-actions`、`.split-workspace`、`.data-table`、`.form-grid` 在移动端的拥挤问题。
- [x] Step 3: 确认所有页面的主操作按钮每屏不超过 1 个，次要操作使用 `secondary-button`。
- [x] Step 4: 运行：

```bash
npm test
npx tsc --noEmit
npm run build
git diff --check
```

- [x] Step 5: 提交。

```bash
git add src/app/styles.css src/app/components/ui.tsx src/app/components/interaction.tsx src/app
git commit -m "style: polish formal frontend interactions"
```

**验收标准：**

- 移动端不会出现整体页面横向溢出，只有表格区域允许横向滚动。
- 主要流程按钮层级一致。
- 页面之间的视觉语言一致。

**完成记录（2026-04-26）：**

- 已提交 `235675c style: polish formal frontend interactions`。
- Task 9 浏览器审计覆盖工作台、单据、审核、报表、基础资料、月结六个页面，在 360px、768px、1440px 共 18 组组合中 `failures=0`。
- 报表、基础资料、月结对账和月结快照表格均补充可键盘聚焦的横向滚动区域和滚动提示。

---

## Task 10: 生产验收和部署

**目标：** 完成前端交互重构后的完整验证、文档记录和 Cloudflare 部署。

**Files:**

- Modify: `docs/superpowers/plans/2026-04-26-formal-frontend-interaction-refactor.md`
- Modify: `docs/deployment.md` if production verification steps change.
- Do not create Cloudflare Pages configuration.

**Steps:**

- [x] Step 1: 运行全量验证。

```bash
npm test
npx tsc --noEmit
npm run build
npm audit --audit-level=high
git diff --check
```

- [x] Step 2: 本地启动 Cloudflare dev。

```bash
npm run cf:dev -- --ip 127.0.0.1
```

- [x] Step 3: 本地手工验收：
  - 工作台能显示下一步任务。
  - 单据中心能创建草稿并提交。
  - 审核中心能查看影响预览并退回/通过。
  - 报表中心能切换分类、筛选、导出、切换快照。
  - 月结中心能运行检查、处理异常、锁账、查看快照。
  - 基础资料能区分演示和真实资料。
- [x] Step 4: 更新本计划状态和验收记录。
- [x] Step 5: 提交验收记录。

```bash
git add docs/superpowers/plans/2026-04-26-formal-frontend-interaction-refactor.md
git commit -m "docs: mark frontend interaction refactor complete"
```

- [x] Step 6: 部署到 Cloudflare。

```bash
CLOUDFLARE_ACCOUNT_ID=611d1a2e53f6c6d0922ff231e6a63211 npm run deploy
```

Expected: deployment uses `wrangler deploy` for the existing Worker `management-ledger`; no Pages project is created or updated.

- [ ] Step 7: 生产验收（未登录、部署版本、演示数据和资料隔离已核对；登录后菜单和核心操作需业务方完成真人 Access 登录确认）：
  - 未登录访问仍跳转 Cloudflare Access。
  - 登录后菜单正常。
  - 演示数据仍保留。
  - 真实资料和演示资料不混淆。

**验收标准：**

- 所有测试、类型检查、构建、安全审计通过。
- 生产部署成功。
- 生产用户能完成核心路径：录入、审核、报表、月结。

**验收记录（2026-04-26）：**

- 全量验证通过：`npm test` 57 files / 754 tests，`npx tsc --noEmit`，`npm run build`，`npm audit --audit-level=high`，`git diff --check` 均通过。
- 本地 Cloudflare dev 验收通过：`npm run cf:dev -- --ip 127.0.0.1 --port 8790` 启动成功；本地 D1 已迁移并 seed 演示数据；开发身份使用本地测试邮箱，不写入仓库。
- 本地核心路径 API 验收通过：
  - 单据中心：创建 2 张项目收入草稿，分别提交后走退回和通过。
  - 审核中心：两张待审核单据均能读取影响预览；一张退回，一张通过。
  - 报表中心：`project-income?period=2026-05` 返回本地验收收入记录；filter options 返回项目、商户、人员、币种选项。
  - 月结中心：`2026-04` 运行检查、处理 warning/info、锁账并生成快照；对账分区可读取。
  - 基础资料：页面可区分真实资料、演示资料和初始化进度。
- 本地真实 UI smoke 通过：工作台、单据中心、审核中心、报表中心、基础资料治理、对账月结六页均可打开，`LOCAL_UI_SMOKE failures=0 total=6`。
- Cloudflare 认证和部署：
  - `wrangler whoami` 目标账号为 `611d1a2e53f6c6d0922ff231e6a63211`。
  - 远端 D1 migrations：`No migrations to apply`。
  - `npm run deploy` 成功部署 Worker `management-ledger`，版本 ID `45d80158-19bf-44af-9e31-b50fd04fb492`，URL `https://management-ledger.bingyizhou6u.workers.dev`。
  - 部署使用 `wrangler deploy` 和 Workers Static Assets，没有创建或更新 Cloudflare Pages。
- 生产只读验收：
  - 未登录访问 `/` 和 `/api/me` 均返回 Cloudflare Access `302`，Access 保护仍生效。
  - 远端 D1 确认登录管理员映射存在：目标邮箱对应启用 admin 人员 1 条。
  - 远端 D1 确认演示数据保留：people 4 条（demo 3、真实 1），projects 1 条（demo 1），merchants 1 条（demo 1），accounts 3 条（demo 3）。
- 待人工验收：需要使用 Cloudflare Access 真人登录生产 URL，确认登录后菜单、权限和核心页面可见。未取得真人登录会话前，不把 Step 7 标为完成。

---

## 6. 总体验收标准

完成本计划后必须满足：

- 单据中心不再是单个拥挤表单，而是步骤化录入和详情操作。
- 审核中心能在一个工作区内完成查看、预览、通过和退回。
- 报表中心按报表分类组织，不再所有报表堆在一起。
- 月结中心有明确流程指引，支持前端锁账和解锁入口。
- 基础资料能明确区分演示资料和真实资料。
- 所有页面的按钮层级、状态提示、空状态、错误提示一致。
- 移动端可读可操作。
- 不改变任何会计入账和报表语义。

## 7. 风险和约束

- **风险：一次性重构范围过大。** 缓解：必须按 Task 顺序提交，每个 Task 独立验证。
- **风险：前端重构误改业务 payload。** 缓解：保留并扩展现有 payload/model 测试。
- **风险：月结锁账前端入口暴露后误操作。** 缓解：必须要求 note/reason，并由后端权限和后端锁账规则兜底。
- **风险：生产演示数据污染真实报表。** 缓解：UI 明确标记演示数据，真实试运行避开 `2026-04` 演示期间。
- **风险：表格数据变多后性能差。** 缓解：本计划先优化交互和布局；如果真实数据量超过浏览器承载，再另开分页/虚拟列表计划。

## 8. 推荐执行方式

推荐使用 **Subagent-Driven**：

- 每个 Task 一个实现 subagent。
- 主线程做审查和验收。
- 每个 Task 完成后提交，再进入下一个 Task。

如果不用 subagent，也可以 Inline Execution，但必须每个 Task 独立验证，不要一次性改完整个前端。
