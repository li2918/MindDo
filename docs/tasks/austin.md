# 任务表 · Austin — 漏斗 + 家庭门户 + 教务 + 财务（含支付）

> **角色**：公开漏斗、家庭门户、教务、**财务支付**（本期最重）。
> **用法**：完成一项把 `- [ ]` 改成 `- [x]`。`d`=人日；**日期是硬 deadline**。
> **总览**：[DEV_TASK_PLAN.md](../DEV_TASK_PLAN.md)

---

## W1 · 6/9–6/15 — 评估 + schema
- [ ] `leads`/`lead_contacts`/`assessments`（模块 D）schema PR（与 David 迁移协调）— ~1d — **截止 6/13**
- [ ] 评估页 `assessment` 前端脚手架 + 原型计分逻辑移植 — ~1.5d — **截止 6/15**

**本周负荷 ≈ 2.5d。**

## W2 · 6/16–6/22 — 线索 + 评估 + 学员
- [ ] 🔵 `TrialCourse`/`trial-registrations` → `leads` 迁移 + 端点（保 bookingRef）**（Paul 的线索管线等这个，优先交）**— ~2d — **截止 6/18**
- [ ] `assessments` 端点 + 自动评分/推荐 — ~1.5d — **截止 6/20**
- [ ] `students`/`guardians` 前端：family tab 升级，从 User-children 改读 C 模块（依赖 David 6/15）— ~1.5d — **截止 6/22**

**本周负荷 ≈ 5d。**

## W3 · 6/23–6/29 — 支付（核心，最重）
- [ ] `membership_plans`/`memberships`/`payments`/`invoices` 端点（模块 F）— ~2d — **截止 6/25**
- [ ] 🔴 Stripe 接入（Payment Intents + webhook 对账）+ `payments` 落库 — ~2.5d — **截止 6/28**
- [ ] 前端：course-selection → course-payment → course-confirm + invoice — ~2d — **截止 6/29**

**本周负荷 ≈ 6.5d ⚠️（明显超）。** 缓解：支付是本周唯一硬目标；把下面 W4 的「教务模块 E」**整块推 Phase 2**，腾出时间保支付。

## W4 · 6/30–7/6 — 家庭门户 + 收尾
- [ ] 家庭门户：会员 + 账单（支付方式/历史）+ 课表（只读）— ~2d — **截止 7/2**
- [ ] feedback / semester-report 前端 — ~1d — **截止 7/3**
- [ ] 联调 + QA + 修 bug — ~1.5d — **截止 7/4**
- [ ] （若有余力）模块 E 最小子集：`class_offerings`/`class_sessions`/`class_enrollments` 读取 + 课表展示 — ~1.5d — **截止 7/4 / 否则 → Phase 2**

**本周负荷 ≈ 4.5d（不含可选 E）。**

---

### 依赖与提醒
- **6/18 的 leads 端点要优先交**——Paul 的线索管线等着。
- 支付网关 = **Stripe**（已定）；W1 内先注册账户、拿 test API key、跑通最小 Payment Intent demo，别等到 W3。
- 你是本期最重的人；**模块 E（教务）是首选可砍项**——优先保「漏斗 + 支付 + 家庭门户」。
- `students/guardians` 前端依赖 David 6/15 的迁移；卡住先用 mock。
