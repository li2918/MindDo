# 任务表 · David — 数据模型对齐 + 后端基建

> **角色**：数据模型向 49 表对齐（主导）+ 后端基建 + schema PR 统一 review。**他是关键路径，W1 阻塞全员。**
> **用法**：完成一项把 `- [ ]` 改成 `- [x]`。`d`=人日；**日期是硬 deadline**（按工作量+依赖倒排）。
> **总览**：[DEV_TASK_PLAN.md](../DEV_TASK_PLAN.md)

---

## W1 · 6/9–6/15 — 模型地基（最高优先）
- [ ] 通用列约定（created_by/updated_by/deleted_at/org_id）+ `updated_at` 触发器 + 软删除中间件骨架 — ~0.5d — **截止 6/10**
- [ ] `roles`/`permissions`/`role_permissions`（保留 5 角色枚举值）+ `staff` 档案表 — ~1.5d — **截止 6/11**
- [ ] 后端 CI workflow（lint + test + 构建镜像）— ~0.5d — **截止 6/11**
- [ ] 「迁移+对齐」样板 PR（一张表的 add→迁数据→切换示范）交给 Austin/Paul — ~0.5d — **截止 6/12**
- [ ] `campuses`/`classrooms` + `TrialCourse.campus` 字符串 → FK 迁移 — ~1.5d — **截止 6/13**
- [ ] `seed` 脚本（校区/角色/演示数据，移植原型 seedDemoData）— ~0.5d — **截止 6/13**
- [ ] 🔴 `families`/`students`/`guardians` + `User` 层级→三表 **迁移脚本**（阻塞 Austin C 前端、Paul 学员管理）— ~2.5d — **截止 6/15**

**本周负荷 ≈ 7.5d ⚠️（>5d）。** 缓解：`families/students/guardians`(6/15) 是必须命中的阻塞项，优先级最高；若挤压，把 `seed`/CI 顺延到 6/16，先交 staff+campuses 让两人能并行。

## W2 · 6/16–6/22 — 基建补齐
- [ ] 审计拦截器 → `audit_log`（模块 I）+ 软删除中间件落地 + 分页 helper + 全局异常过滤器 — ~2d — **截止 6/18**
- [ ] `GET /api/audit?kind=&actor=&from=` 查询端点（给 Paul 审计查看器）— ~0.5d — **截止 6/19**
- [ ] 合并并协调 Austin/Paul 的 schema PR，保证迁移顺序无冲突 — ~1d（贯穿）— **截止 6/20**

**本周负荷 ≈ 3.5d。**

## W3 · 6/23–6/29 — 索引/支付把关
- [ ] 按 `DATABASE_DESIGN.md` 补关键索引 + 性能 review — ~1d — **截止 6/26**
- [ ] 支付相关表（memberships/payments/invoices）schema review + 迁移把关（配合 Austin）— ~0.5d — **截止 6/27**

**本周负荷 ≈ 1.5d（留缓冲给迁移救火）。**

## W4 · 6/30–7/6 — 上线
- [ ] 生产部署 + 数据库备份 + 监控/报警 — ~1.5d — **截止 7/2**
- [ ] 上线 checklist + 回滚预案 + 端到端联调把关 — ~1.5d — **截止 7/4**

**本周负荷 ≈ 3d。**

---

### 依赖与提醒
- W1 的 A/B/C 三块是全员地基，**6/15 前必须可用**，否则 Austin/Paul 的 W2 全部顺延。
- 所有破坏性改动走「加新表/列 → 迁数据 → 删旧」多 PR，**不允许大爆炸重构**。
- 每张新表/改表 PR 你来 review 合并；迁移卡住别人时，站会当场点名。
