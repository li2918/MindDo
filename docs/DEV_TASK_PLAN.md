# MindDo · 开发任务计划（新项目实现）

> **目标**：以现有 MindDo HTML 原型为「产品规格」，用全新技术栈实现真正的产品，**6 月底 / 7 月初上线 MVP 核心链路**。
> **读者**：David、Paul、Austin（3 名全栈工程师）+ 产品负责人
> **更新方式**：每人每天勾选自己负责的 `- [ ]` 任务；每周五同步里程碑状态。
> **本文位置**：暂放原型仓库 `docs/`；新 monorepo 建好后迁入其 `docs/`。

---

## 0. 三份「真理来源」

实现时**不要凭感觉**，所有数据结构 / 流程 / 权限以这三份为准：

| 文档 | 作用 |
|---|---|
| MindDo HTML 原型（36 个页面） | **UI + 功能 + 交互的样板**——每个页面长什么样、有哪些字段、什么流程，照着实现 |
| [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) | **数据库实现契约**——49 张表（模块 A–I），列/类型/约束/索引都已定义 |
| [`BACKEND_MIGRATION.md`](BACKEND_MIGRATION.md) | **REST API 草图 + 权限方案 + 模块完成清单** |
| [`SCHEMA.md`](SCHEMA.md) | 原型 localStorage 字段定义（数据字段来源） |

---

## 1. 技术栈（已定）

| 层 | 选型 |
|---|---|
| 后端 | **NestJS** · Prisma · PostgreSQL（Supabase 托管） |
| 鉴权 | **Auth0**（托管，含 OAuth + RBAC）|
| 前端 | **React 19** · Vite · Tailwind CSS · Auth0 React SDK |
| 部署 | 后端 Docker 镜像（启动自动 `prisma migrate deploy`）；前端静态构建 → AWS S3（GitHub Actions） |
| 环境 | `main` → 生产（`api.minddo.ai` / `admin.minddo.ai`）；`dev` → 开发（`development-api.minddo.ai` / `development.minddo.ai`） |

**鉴权数据流**：浏览器 Auth0 登录 → 拿到 Bearer JWT → 每个请求带 `Authorization: Bearer <token>` → 后端 `Auth0Strategy` 用 JWKS 校验 → `syncUser` upsert 用户行 → `RolesGuard` 按 `role` 列做端点级访问控制。

---

## 2. 上线范围（MVP 核心链路优先）

### ✅ Phase 1 — 本期必须上线（6 月底 / 7 月初）

| 模块 | 内容 | 主负责 |
|---|---|---|
| A 身份与权限 | Auth0 鉴权、users/staff/roles/permissions、RBAC | David |
| B 校区基础数据 | campuses、classrooms（参考数据） | David |
| C 家庭与学员 | families / students / guardians、加孩子/加家长 | Austin |
| D 销售 CRM | leads（试课线索）、assessments（评估）、联系记录 | Austin |
| F 套餐与支付 | membership_plans / memberships / payments / invoices + 支付网关 | Austin |
| G 运营审批 | schedule_requests、approvals（审批队列）| Paul |
| 运营看板核心 | 注册/付费/转化指标、线索列表、审批队列、今日清单 | Paul |
| 公开漏斗前端 | trial → assessment → signup → 选课 → 支付 → 确认 | Austin |
| 家庭门户（基础） | 资料、会员、账单、课表（只读）| Austin |

### ⏭️ Phase 2 — 上线后迭代（不阻塞上线）

工资条（payroll）、合同（contracts）、推荐奖励（referrals）、自动排班 / 课次实例 / 考勤自动化、交班记录（shift_notes）、营销模板 / 销售目标、作品集 / 成长档案上传（需 S3）、高级报表、数据完整性扫描、⌘K 全局搜索、多租户 org 化。

> **范围纪律**：任何想加进 Phase 1 的功能，先问「不上它能不能上线？」——能，就进 Phase 2。

---

## 3. 分工总览

每人都是**全栈**：负责自己域内的「后端端点 + 前端页面」。**David 额外负责所有人共享的基础设施**（他是大家的依赖）。

| 工程师 | 负责领域 | 对应原型页面 | 对应数据库模块 |
|---|---|---|---|
| **David** | 后端基建、数据库、鉴权、CI/CD、共享脚手架 | （全局基础）| A 身份权限、B 校区、Prisma schema、审计、迁移、种子 |
| **Paul** | **运营看板（Admin）** | `dashboard` · `student-management` · `request-center` · `new-trials` · `new-students` · `email-outbox` | G 运营审批、看板聚合、审计查看器 |
| **Austin** | 公开漏斗 + 家庭门户 + 教务 + 财务 | `trial` · `assessment` · `signup` · `profile-setup` · `student-account` · `course-*` · `invoice` · `feedback` · `add-child` · `add-coparent` | C 家庭学员、D 销售 CRM、E 教务、F 财务支付 |

---

## 4. 里程碑时间线（4 周）

> 今天 2026-06-08。目标上线：**~2026-07-04**。

| 周 | 日期 | 主题 | 出口标准（本周末应达成） |
|---|---|---|---|
| **W0** | 6/8 当天 | 启动 | 待决策清单全部拍板；新仓库建好、三人有权限；分支策略定 |
| **W1** | 6/9–6/15 | **打地基** | David 基建可用（鉴权通、Prisma schema 核心表、API 模板、CI/CD）；Paul/Austin 用 mock 数据并行起前端、提 schema PR |
| **W2** | 6/16–6/22 | **核心模块** | 鉴权+staff+校区完成；leads/students/会员 端点就绪；看板核心指标 + 线索列表 + 审批队列跑通 |
| **W3** | 6/23–6/29 | **钱路 + 门户 + 运营** | 支付网关接通；公开漏斗端到端打通；家庭门户基础页；运营审批/学员管理可用 |
| **W4** | 6/30–7/6 | **联调 · QA · 上线** | 端到端冒烟全过；生产部署；真实校区数据导入；上线 + 回滚预案就绪 |

**关键路径**：David W1 基建 → 全员后端端点（W2）→ 跨模块联调（W3）→ 上线（W4）。David 是单点瓶颈，W1 必须全力 foundation，否则全员阻塞（缓解见 §8）。

---

## 5. 详细任务清单

### 5.1 David — 后端基建 & 数据库

**W1（打地基，最高优先，全员等他）**
- [ ] 初始化 monorepo：pnpm workspaces，`backend/`（NestJS）+ `frontend/`（React 19 + Vite + Tailwind）
- [ ] Postgres（Supabase）实例 + 连接；Prisma 初始化
- [ ] 按 `DATABASE_DESIGN.md` 建核心 Prisma schema：模块 A（users/staff/roles/permissions/role_permissions）+ B（campuses/classrooms）+ C（families/students/guardians）
- [ ] 通用列约定（`id`/`created_at`/`updated_at`/`created_by`/`deleted_at`/`org_id`）+ `updated_at` 自动维护 + 软删除中间件
- [ ] Auth0 租户配置：`Auth0Strategy`（JWKS 校验）+ `AuthService.syncUser`（upsert 用户行）+ `RolesGuard` + `@Roles()` 装饰器
- [ ] **统一角色模型**（待决策 #1）：梳理 README 5 角色 vs 原型 4 运营角色，产出统一后的 `roles` + 权限映射，产品确认后据此配 Auth0
- [ ] 权限码字典 + 把原型 `PERMISSION_TEMPLATES` 迁成 `role_permissions` 种子数据
- [ ] 全局组件：`ValidationPipe`、异常过滤器、**审计拦截器**（写操作自动写 `audit_log`）、请求日志
- [ ] CI/CD：后端 `Dockerfile`（启动跑 `prisma migrate deploy`）+ 前端 GitHub Actions → S3；dev/prod 环境 + secrets
- [ ] **种子脚本**：移植原型 `seedDemoData` 的校区/角色/演示数据
- [ ] 产出一个完整 CRUD module **模板** + 本地起服 README，交给 Paul/Austin 照抄

**W2**
- [ ] `GET /api/me` 端点（替代原型 `current_student` / `active_ops_user`）
- [ ] staff / roles / permissions CRUD + 校区/教室 CRUD
- [ ] RBAC 中间件：`.campus` 变体逻辑（有宽权限即通过）+ **金额脱敏**（campus-ops 在 API 层看不到真实金额）
- [ ] 协助 Austin/Paul 联调 Auth0 + 合并两人的 schema PR

**W3–W4**
- [ ] 审计查询端点 `GET /api/audit?kind=&actor=&from=`
- [ ] 索引/性能 review（按 `DATABASE_DESIGN.md` 的索引建议）
- [ ] 生产部署、监控/报警、数据库备份策略
- [ ] 上线 checklist + 回滚预案

---

### 5.2 Austin — 公开漏斗 + 家庭门户 + 教务 + 财务

**W1（并行起步，先用 mock）**
- [ ] Prisma models PR：模块 D（leads / lead_tags / lead_contacts / assessments）
- [ ] 前端路由脚手架：`trial` / `assessment` / `signup` / `profile-setup`（React + Tailwind，照原型样式 + 字段）
- [ ] Auth0 React SDK 接入注册/登录（配合 David）

**W2**
- [ ] `leads` CRUD 端点 + 重复线索校验（`POST /api/leads`、`POST /api/leads/:id/contact` 追加联系记录）
- [ ] `assessments` 端点 + **自动评分逻辑**（移植原型 assessment 计分 + 推荐）
- [ ] `students` / `families` / `guardians` CRUD（含 add-child / add-coparent 流程）
- [ ] 前端：trial → assessment → signup 全流程打通到真实 API（替换 mock）

**W3**
- [ ] 模块 F 端点：`membership_plans` / `memberships` / `payments` / `invoices`
- [ ] **支付网关接入**（Stripe / 微信—见待决策 #2）+ webhook 回调对账
- [ ] 前端：course-selection → course-payment → course-confirm + invoice 打印页
- [ ] 家庭门户 `student-account`：资料 + 会员（当前/升级）+ 账单（支付方式/历史）+ 课表（只读）

**W4**
- [ ] 模块 E 最小子集：`class_offerings` 读取 + 课表展示（attendance/assignments 自动化推 Phase 2，或先做最小可用）
- [ ] feedback / semester-report 前端
- [ ] 端到端联调 + QA + 修 bug

---

### 5.3 Paul — 运营看板（Admin）

**W1（并行起步，先用 mock）**
- [ ] Prisma models PR：模块 G（schedule_requests / approvals / shift_notes）+ 消息 outbox / templates
- [ ] Admin React app 脚手架：整体布局 + 角色路由守卫 + 侧边导航（照 `dashboard.html` 结构）

**W2**
- [ ] 看板聚合端点：注册 / 付费 / 评估 / 转化 指标 + 告警（按 campus 从 JWT 过滤）
- [ ] 线索列表 / 筛选 / 详情（消费 Austin 的 `leads` API）
- [ ] 审批队列 + `POST /api/approvals/:id/decide`（approve/reject，自动写审计）
- [ ] 前端：运营看板核心指标卡 + 趋势图

**W3**
- [ ] `student-management`：学员列表 + 抽屉（作业 / 成长 / 变更历史 / 基础档案）
- [ ] `request-center`：请假 / 改期审批队列
- [ ] `new-trials` / `new-students`：今日清单快捷提醒
- [ ] **权限分层视图**（super-admin / principal / campus-ops / campus-marketing）+ 金额脱敏 UI

**W4**
- [ ] `email-outbox` + 自动草拟消息（续费 / 缺勤提醒）
- [ ] 审计日志查看器（消费 David 的 `/api/audit`）
- [ ] 联调 + QA

---

## 6. 模块完成定义（DoD）

每个模块「完成」= 下面 6 条全过（出自 `BACKEND_MIGRATION.md`）：

- [ ] Prisma 表 + 迁移已合并
- [ ] REST 端点（list / single / create / patch / soft-delete）
- [ ] 服务端校验（DTO + class-validator）
- [ ] 前端用 `fetch` 接真实 API（去掉 mock）
- [ ] 权限：端点挂 `RolesGuard`，前端按角色隐藏/禁用
- [ ] 写操作进审计日志

---

## 7. 跨团队约定

- **命名**：表/列 snake_case，复数表名；遵循 `DATABASE_DESIGN.md §3`（`idx_*` / `uq_*` / `fk_*` / `is_*` / `_at`）。
- **API**：`/api/<resource>` 标准 5 端点；过滤按 JWT 里的 campus 自动收窄；分页统一 `?page=&limit=`。
- **Schema 改动**：谁负责的模块谁提 Prisma PR，**David 统一 review + 合并**，避免迁移冲突。
- **分支**：`feature/<模块>-<简述>` → PR 到 `dev`；`dev` 稳定后合 `main` 触发生产部署。每个 PR 至少 1 人 review。
- **环境变量**：后端 `.env`（DB / Auth0 / 网关密钥）；前端 `VITE_AUTH0_*` + `VITE_API_URL`。**密钥只进 GitHub Secrets，不进仓库**。
- **每日同步**：15 分钟站会——昨天做完什么、今天做什么、被谁阻塞。阻塞当场点名 owner。

---

## 8. 依赖与阻塞（关键路径管理）

- **David W1 基建阻塞全员** → 缓解：David W1 心无旁骛只做 foundation；Paul/Austin W1 **用 mock/seeded 数据并行做前端**，同时提各自的 schema PR，等基建落地即可接真 API。
- **Paul 的看板依赖 Austin 的 leads/students/payments 端点** → 缓解：Austin **优先交读端点**（list/single），Paul 在那之前用 mock JSON 顶住。
- **支付网关决策（#2）阻塞 Austin W3** → 必须 W0/W1 内定。
- **Auth0 角色模型决策（#1）阻塞 RBAC 与所有端点权限** → 必须 W0 定。

---

## 9. 风险登记表

| 风险 | 影响 | 缓解 |
|---|---|---|
| 3–4 周完成 MVP 仍偏紧 | 上线延期 | 严守 Phase 1 范围；每周五砍一刀不必要的东西 |
| David 单点瓶颈 | 全员阻塞 | W1 只做基建；前端并行 mock；API 模板尽早交付 |
| Austin 范围最大 | 钱路 / 门户来不及 | attendance/assignments/作品集上传推 Phase 2；先保支付+漏斗 |
| 角色模型不一致（5 角色 vs 4 运营角色，见 #1）| RBAC 返工 | W0 拍板最终模型再写 guard |
| 支付/未成年人合规（COPPA，美区 <13 岁）| 法律风险 | W0 评估最小合规（同意流 + PII 处理），不达标不收款 |
| 演示数据 ≠ 真实校区数据 | 上线数据错乱 | W4 专门导入真实校区/套餐/员工数据并核对 |

---

## 10. 待决策清单（W0 必须拍板）

> 这几项不定，下面的开发会返工。请产品负责人逐条确认：

1. **最终角色模型** → **Owner: David（先行梳理）**。README 的 5 角色（SUPER_ADMIN / ORG_ADMIN / INSTRUCTOR / PARENT / STUDENT）vs 原型 + `DATABASE_DESIGN.md` 的 4 运营角色（super-admin / principal / campus-ops / campus-marketing）+ guardian/student，**二者不一致**。David 先产出统一后的角色 + 权限映射（建议直接写进 `DATABASE_DESIGN.md` 模块 A 的 `roles`/`role_permissions` 种子），产品过目确认后再据此配 Auth0。**这是 RBAC 与所有端点权限的前置，须在 W1 内定稿。**
2. **支付网关**：Stripe（美区信用卡）/ 微信·支付宝（中国家长）/ 两者都要？校区在美/加，家长多为华人——影响 Austin W3。
3. **文件存储**：作品集 / 合同 PDF 用 S3 还是 R2？（Phase 2 可延后，但要定方向）
4. **多租户**：本期是否预留 `org_id` 多组织（当前默认单租户 = 1）？
5. **数据合规**：美区 COPPA（<13 岁）PII 与家长同意流，本期是否落地最小合规？
6. **新仓库**：monorepo 仓库建好了吗？三人访问权限 + `main`/`dev` 分支保护规则配了吗？

---

## 11. 进度追踪机制

- **任务级**：每人勾选 §5 自己的 `- [ ]`，commit 信息带模块名。
- **周级**：每周五更新 §4 里程碑表的「出口标准」是否达成；未达成的写一句原因 + 补救。
- **决策级**：§10 每拍板一项就标 ✅ 并记录结论。
- **本文是活文档**：范围/分工变化直接改这里，并在 commit 里说明。

---

_基准：MindDo HTML 原型 + `DATABASE_DESIGN.md`（49 表）+ `BACKEND_MIGRATION.md`。最后更新：2026-06-08。_
