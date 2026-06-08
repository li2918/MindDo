# MindDo · 开发任务计划（基于现有 minddoai 代码重排）

> **目标**：在已开工的 `minddoai` monorepo 上，**向 `DATABASE_DESIGN.md` 的严谨设计对齐**、**补齐支付**，**6 月底 / 7 月初上线 MVP**。
> **读者**：David、Paul、Austin（3 名全栈）+ 产品负责人
> **真理来源**：MindDo HTML 原型（UI/功能样板）+ [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md)（数据库契约，本期目标）+ [`BACKEND_MIGRATION.md`](BACKEND_MIGRATION.md)（API/权限/迁移）。
> **本文位置**：暂在原型仓库 `docs/`；建议尽快复制进 `minddoai/docs/` 并以 PR 维护。
> **更新方式**：每人勾选自己负责的 `- [ ]`；每周五同步里程碑。

---

## 0. 三条已拍板的决策（本计划的前提）

1. **数据模型 → 向 49 表设计对齐**，但用**增量迁移、非大爆炸重构**：新表严格按 `DATABASE_DESIGN.md` 建；旧表（`User` 父子层级 / `ContactRequest` / `TrialCourse` / `Organization` / `Course`）逐模块迁移，全程保持 app 可用。本期只纳入 **MVP 关键的约 18 张表**（见 §3），其余 31 张推 Phase 2。
2. **角色先用现有 5 个**：`SUPER_ADMIN / ORG_ADMIN / INSTRUCTOR / PARENT / STUDENT`。原型的 principal / campus-ops / campus-marketing 运营分层 + 金额脱敏 → Phase 2。
3. **支付本期必含**：membership / payment / invoice 从零建，接支付网关（待决策 §10-#1）。

---

## 1. 现状基线（已经建好的，别重复造）

### 后端 `minddoai/backend`（NestJS 11 · Prisma 6 · Auth0 · 15 迁移）
- ✅ **Auth0 全套**：`Auth0Strategy`(JWKS) · `RolesGuard` · `@Roles` · `syncUser` · M2M 建号（`createAuth0User` 等）
- ✅ **5 角色 RBAC** 已落地
- ✅ 已完成模块：`auth`(`GET /api/auth/me`) · `users`(CRUD + children + co-parent 邀请) · `courses` · `trial-courses` · `trial-registrations`(公开) · `organizations` · `contact-requests`(公开提交+状态机) · `health` · `email`(Mailgun，仅邀请)
- ✅ 全局 `ValidationPipe` · CORS · `Dockerfile`(启动跑 `prisma migrate deploy`)
- ❌ 缺：全局异常过滤器 · **审计日志** · 软删除 · 分页 · seed 脚本 · **后端 CI workflow**（目前只有前端 deploy）

### 前端 `minddoai/frontend`（React 19 · Vite 8 · Tailwind 4 · RR7 · Auth0）
- ✅ 落地页(中英) · 试课预约 `/trial` · `/callback` · co-parent 邀请 `/accept-invite/:token`
- ✅ Profile `/profile`（含家庭 tab：管理孩子、邀请共同家长）
- ✅ Admin 全套 CRUD：用户 `/dashboard` · 课程 `/course` · 试课 `/trialCourse` · 机构 `/organizations` · 讲师 `/instructors` · 联系请求 `/contact-requests`
- ✅ API 层(`lib/api.ts` 带 Bearer + `public-api.ts`) · Auth0 provider · 角色路由守卫 · `AdminLayout` · 分页/SlidePanel/通用组件
- ❌ 缺：**运营看板指标页** · 线索管线 · 学员管理专页 · **会员/账单** · **课表/排课** · 作业 · 反馈 · 审批 · 邮件发件箱 · **评估页** · **支付流程**

---

## 2. 重构对齐：旧表 → 49 表 映射（增量迁移，David 主导）

| 现有（精简） | 目标（DATABASE_DESIGN 模块） | 策略 |
|---|---|---|
| `User`(PARENT/STUDENT + parentId) | `families` + `students` + `guardians`（模块 C） | **加新表 + 迁数据**；User 仍承载 Auth0 登录身份，profile 拆到 students/guardians |
| `User`(INSTRUCTOR/ADMIN) | `staff` + `roles`/`permissions`（模块 A） | 加 staff 档案；保留 5 角色枚举值，补 `role_permissions` |
| `TrialCourse` + `trial-registrations` | `leads`（模块 D.1）+ trial 字段 | TrialCourse → leads 主体；保留 bookingRef |
| `ContactRequest` | `leads`(channel=contact) 或 `lead_contacts` | 并入线索管线 |
| `Organization` / `OrganizationMembership` | `campuses`(模块 B) / 机构 | 厘清「机构 vs 校区」语义后映射 |
| `Course` / `CourseInstructor` | `class_offerings` + `class_sessions`（模块 E） | 扩成排期模板 + 课次实例 |
| （无） | `memberships`/`payments`/`invoices`（模块 F） | **全新建** |
| （无） | `audit_log`（模块 I） | **全新建**，全局拦截器 |

> **铁律**：迁移按模块逐个做，每步保持 app 可跑；不允许一次性推倒重来。每张新表/改表的 Prisma PR 由 **David 统一 review 合并**。

---

## 3. 本期 MVP 表范围（49 张里的约 18 张）

**✅ 本期建/对齐**：`roles` `permissions` `role_permissions` `staff`（A）· `campuses` `classrooms`（B）· `families` `students` `guardians`（C）· `leads` `lead_contacts` `assessments`（D）· `class_offerings` `class_sessions` `class_enrollments`（E）· `membership_plans` `memberships` `payments` `invoices`（F）· `schedule_requests` `approvals`（G）· `audit_log`（I）

**⏭️ Phase 2**：attendance/assignments 自动化、session_consumptions、teacher_rates/availability、growth_records、portfolio、marketing_templates/targets、payroll、contracts、referrals、shift_notes、campus_holidays/notices、student_level_history、多租户 org 化、运营分层角色 + 金额脱敏。

---

## 4. 分工（按现状的「缺口」重排）

| 工程师 | 本期主线 | 对应模块/页面 |
|---|---|---|
| **David** | **数据模型对齐（主导）+ 后端基建补齐** | A/B/C 建表迁移、`audit_log`、软删除、分页、异常过滤器、seed、后端 CI、schema PR 统一 review |
| **Paul** | **运营看板（Admin）** | 指标总览页、线索管线（leads）、学员管理、审批/请假改期（G）、邮件发件箱 |
| **Austin** | **公开漏斗 + 家庭门户 + 教务 + 财务（含支付）** | 评估页/评分(D)、family→students/guardians(C 前端)、会员/支付(F)、选课→支付→确认、家庭门户账单/课表、教务(E) |

---

## 5. 里程碑时间线（4 周，高风险，严控范围）

> 今天 2026-06-08。目标上线 **~2026-07-04**。

| 周 | 日期 | 主题 | 出口标准 |
|---|---|---|---|
| **W1** | 6/9–6/15 | **模型地基** | David 落地 A/B/C 新表 + 迁移脚本 + audit/软删/分页；Austin/Paul 在新 schema 上起各自端点（旧端点继续跑） |
| **W2** | 6/16–6/22 | **线索 + 学员 + 看板** | leads/assessments 端点 + 评估前端；students/guardians 迁完；看板指标页 + 线索管线跑通 |
| **W3** | 6/23–6/29 | **支付 + 门户 + 运营** | membership/payment 模型 + 网关 + 选课→支付→确认；家庭门户账单/课表；审批/学员管理 |
| **W4** | 6/30–7/6 | **联调 · QA · 上线** | 端到端冒烟全过；旧表迁移收尾；真实数据导入；生产部署 + 回滚预案 |

**关键路径**：David W1 的 A/B/C 模型与迁移阻塞全员 → 必须 W1 内交付；旧→新迁移每动一张表都可能波及现有 admin 端点，需 David + 对应 owner 联动。

---

## 6. 详细任务清单

### 6.1 David — 数据模型对齐 + 后端基建
**W1（最高优先，阻塞全员）**
- [ ] 建 `roles`/`permissions`/`role_permissions`（保留 5 角色枚举值，补权限映射）+ `staff` 档案表
- [ ] 建 `campuses`/`classrooms`（模块 B），把 TrialCourse 的 campus 字符串字段迁成 FK
- [ ] 建 `families`/`students`/`guardians`（模块 C），写 `User` 父子层级 → 三表的**迁移脚本**；User 仅留登录身份
- [ ] 全局 **审计拦截器** → 写 `audit_log`（模块 I）；软删除中间件；分页 helper；全局异常过滤器
- [ ] **seed 脚本**（校区/角色/演示数据，移植原型 seedDemoData）
- [ ] **后端 CI workflow**（lint + test + 构建镜像）
- [ ] 通用列约定（created_by/updated_by/deleted_at/org_id）+ `updated_at` 触发器
- [ ] 出一个「迁移 + 对齐」样板 PR，给 Austin/Paul 照抄

**W2–W4**
- [ ] 合并 Austin/Paul 的 schema PR，保证迁移顺序无冲突
- [ ] `GET /api/audit` 查询端点（给 Paul 的审计查看器）
- [ ] 按 `DATABASE_DESIGN.md` 补关键索引；性能 review
- [ ] 生产部署、备份、监控、上线 checklist + 回滚预案

### 6.2 Austin — 漏斗 + 家庭门户 + 教务 + 财务
**W1**
- [ ] schema PR：`leads`/`lead_contacts`/`assessments`（D）（与 David 的迁移协调）
- [ ] 前端评估页 `assessment` 脚手架（照原型字段 + 计分）
**W2**
- [ ] `TrialCourse`/`trial-registrations` → `leads` 迁移 + 端点（保 bookingRef）
- [ ] `assessments` 端点 + 自动评分/推荐（移植原型逻辑）
- [ ] `students`/`guardians` 前端（family tab 升级：从 User-children 改读 C 模块）
**W3**
- [ ] 模块 F：`membership_plans`/`memberships`/`payments`/`invoices` 端点
- [ ] **支付网关接入**（见 §10-#1）+ webhook 对账
- [ ] 前端：course-selection → course-payment → course-confirm + invoice
- [ ] 家庭门户：会员 + 账单（支付方式/历史）+ 课表（只读）
**W4**
- [ ] 模块 E 最小子集：`class_offerings`/`class_sessions`/`class_enrollments` 读取 + 课表展示
- [ ] feedback / semester-report 前端；联调 + QA

### 6.3 Paul — 运营看板（Admin）
**W1**
- [ ] schema PR：`schedule_requests`/`approvals`（G）
- [ ] 看板「指标总览」页脚手架（现 admin 缺这个总览，照 `dashboard.html`）
**W2**
- [ ] 聚合端点：注册/付费/评估/转化 指标 + 告警
- [ ] **线索管线**页：把现 `contact-requests` + 新 `leads` 合成统一 CRM 列表/筛选/详情/联系记录
- [ ] 前端：核心指标卡 + 趋势图
**W3**
- [ ] **学员管理**专页：列表 + 抽屉（作业/成长/变更历史/档案）——基于 C 模块
- [ ] 审批队列 + `POST /api/approvals/:id/decide`（写审计）；请假/改期 `request-center`
- [ ] new-trials / new-students 今日清单
**W4**
- [ ] 邮件发件箱（基于现 `email` 模块扩展）+ 续费/缺勤自动草拟
- [ ] 审计日志查看器（消费 `GET /api/audit`）；联调 + QA

---

## 7. 模块完成定义（DoD）
每模块「完成」= 6 条全过：
- [ ] Prisma 表 + 迁移合并（且旧数据已迁移、app 仍可跑）
- [ ] REST 端点（list/single/create/patch/soft-delete）
- [ ] 服务端校验（DTO + class-validator）
- [ ] 前端接真实 API（去 mock）
- [ ] 权限：`RolesGuard` + 前端按角色隐藏
- [ ] 写操作进 `audit_log`

---

## 8. 跨团队约定
- **命名/类型/索引**：遵循 `DATABASE_DESIGN.md §3`（snake_case、`idx_*`/`uq_*`/`fk_*`、金额 `*_cents` BIGINT、UUID 主键、TIMESTAMPTZ）。
- **Schema 改动**：谁的模块谁提 Prisma PR，**David 统一 review 合并**，严控迁移顺序。
- **迁移纪律**：每个 PR 保证迁移可正向执行且 app 不崩；破坏性改动先加新列/新表、迁数据、再删旧列，分多个 PR。
- **分支**：`feature/<模块>` → `dev` → `main`（触发部署）；每 PR ≥1 review。
- **密钥**：只进 GitHub Secrets / `.env`（网关、Auth0 M2M、DB），不进仓库。
- **每日 15 分钟站会**：进度 + 阻塞点名 owner（尤其 David 的迁移是否卡住别人）。

---

## 9. 风险登记
| 风险 | 影响 | 缓解 |
|---|---|---|
| 重构对齐 + 支付 + 4 周，组合风险最高 | 延期/上线不稳 | 只纳入 §3 的 18 张表；增量迁移不大爆炸；每周五砍范围 |
| 旧→新迁移波及现有 admin 端点 | 现有功能回归 | 加新表先并存、灰度迁移；迁一个模块联调一个 |
| David 单点（模型 + 基建 + review） | 全员阻塞 | W1 只做 A/B/C + 基建；样板 PR 尽早；Austin/Paul 在稳定列上并行 |
| 支付合规（美区 COPPA / 未成年人 / 收款） | 法律风险 | 网关与同意流先评估最小合规，不达标不收款 |
| 演示数据≠真实校区数据 | 上线数据乱 | W4 专项导入真实校区/套餐/员工并核对 |

---

## 10. 待决策（影响开工，请尽快定）
1. **支付网关**：Stripe（美区卡）/ 微信·支付宝（华人家长）/ 都要？→ 卡 Austin W3，**最优先**。
2. **「机构 Organization」vs「校区 Campus」语义**：现有 Organization 与 spec 的 campuses 怎么对应/合并？→ 卡 David 的 B 模块迁移。
3. **迁移期数据**：现有 User/ContactRequest/TrialCourse 里已有多少真实数据需要迁？还是仍是演示数据可直接重建？→ 决定迁移脚本投入。
4. **文件存储**（作品集/合同/invoice PDF）：S3 / R2？（Phase 2 可延后，但 invoice 可能本期要）。
5. **计划文档归属**：是否把本文迁进 `minddoai/docs/` 用 PR 维护（推荐），原型仓库这份作为快照。

---

## 11. 进度追踪
- **任务级**：勾选 §6 的 `- [ ]`，commit 带模块名。
- **周级**：每周五核对 §5 出口标准，未达成写原因 + 补救。
- **决策级**：§10 每定一条标 ✅ 记结论。
- **活文档**：范围/分工变化直接改这里并在 commit 说明。

---

_基线：minddoai 现有代码（45 PR）+ MindDo 原型 + `DATABASE_DESIGN.md`。最后更新：2026-06-08。_
