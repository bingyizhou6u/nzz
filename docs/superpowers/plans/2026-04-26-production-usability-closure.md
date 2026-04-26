# 生产可用性闭环记录

日期：2026-04-26

生产地址：

```text
https://management-ledger.bingyizhou6u.workers.dev
```

当前结论：生产环境技术链路已可用，Cloudflare Access 已保护入口，远程 D1 schema 已是最新版本；进入正式试运行前，还需要完成真人登录验收，并决定生产库演示数据是否保留。

## 1. 部署状态

- Worker：`management-ledger`
- 当前线上版本：`550a5560-b9dc-4b02-b715-5dc52a45db82`
- 部署时间：2026-04-26 12:09 UTC
- 代码状态：`main` 与 `origin/main` 一致，HEAD 为 `6c0e4eb`

验收结果：

- [x] Cloudflare Wrangler 登录账号匹配目标账号。
- [x] Worker 已部署到生产地址。
- [x] 静态资源已上传。
- [x] Worker 绑定远程 D1：`management-ledger-db`。

## 2. Cloudflare Access

生产 Worker 当前配置：

- `AUTH_MODE=access`
- `ALLOW_INSECURE_DEV_AUTH=""`
- `DEV_ACTOR_EMAIL=""`
- Secret `CF_ACCESS_TEAM_DOMAIN` 已存在。
- Secret `CF_ACCESS_AUD` 已存在。

未登录访问验收：

- [x] `GET /` 返回 302，跳转 Cloudflare Access 登录页。
- [x] `GET /api/me` 返回 302，跳转 Cloudflare Access 登录页。
- [x] `GET /api/month-close/periods` 返回 302，跳转 Cloudflare Access 登录页。

这说明未认证访问被 Access 拦截，生产入口没有裸露。

## 3. 远程 D1

远程 migration：

- [x] `wrangler d1 migrations list management-ledger-db --remote`：无待执行 migration。

关键数据计数：

| 项目 | 数量 |
| --- | ---: |
| 人员 | 4 |
| 可登录管理员 | 1 |
| 项目 | 1 |
| 商户 | 1 |
| 账户 | 3 |
| 币种 | 8 |
| 收支分类 | 4 |
| 单据 | 8 |
| 期间锁 | 0 |
| 月结快照 | 0 |

人员登录映射状态：

- `person_admin_primary`：管理员，已绑定登录邮箱。
- 3 个演示人员：未绑定登录邮箱。

## 4. 数据状态判断

当前生产库包含演示资料：

- 演示项目 Alpha
- 演示商户 Alpha
- 演示财务主管 / 后勤 / 借款人
- 8 张演示单据，包括收入、换汇、备用金、借款、还款和 1 张草稿

判断：

- 技术验收可以继续使用这批演示数据。
- 若要进入正式试运行，建议先清理演示单据和演示基础资料，再录入真实基础资料。
- 清理生产数据属于破坏性操作，必须单独确认后执行。

## 5. 待人工确认项

必须由可登录管理员完成：

- [ ] 通过 Cloudflare Access 登录生产系统。
- [ ] 确认登录后 `/api/me` 能识别为管理员。
- [ ] 确认菜单可见：工作台、单据、审核、报表、基础资料、对账月结。
- [ ] 打开基础资料，确认人员、项目、商户、账户、币种、分类可读取。
- [ ] 打开报表中心，确认演示报表可读取。
- [ ] 打开对账月结，确认演示期间可读取。

## 6. 下一步建议

优先做两件事：

1. 真人登录生产系统，完成 Access 登录验收。
2. 决定生产库演示数据策略：
   - 保留：用于演示和培训，但正式数据需要与演示数据隔离。
   - 清理：删除演示单据和演示基础资料，再初始化真实基础资料。

推荐进入正式试运行前选择“清理”，避免演示数据污染真实管理报表。
