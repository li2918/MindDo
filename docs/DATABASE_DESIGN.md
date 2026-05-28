# MindDo · 数据库设计文档

> **读者**：后端工程师 / DBA / 全栈开发者
> **目的**：作为从 `localStorage` 原型迁移到真实后端时的数据库参考实现。
> **关联文档**：
> - [`SCHEMA.md`](SCHEMA.md) — 前端 localStorage 字段定义（数据来源）
> - [`BACKEND_MIGRATION.md`](BACKEND_MIGRATION.md) — 迁移策略和阶段规划
> - [`assets/minddo-flow.js`](../assets/minddo-flow.js) — 当前数据层实现 + 权限模板

---

## 目录

1. [设计目标与约束](#1-设计目标与约束)
2. [技术栈选型](#2-技术栈选型)
3. [命名与类型约定](#3-命名与类型约定)
4. [模块 A · 身份与权限](#模块-a--身份与权限)
5. [模块 B · 校区与机构](#模块-b--校区与机构)
6. [模块 C · 家庭与学员](#模块-c--家庭与学员)
7. [模块 D · 销售与 CRM](#模块-d--销售与-crm)
8. [模块 E · 教务与课程](#模块-e--教务与课程)
9. [模块 F · 财务与套餐](#模块-f--财务与套餐)
10. [模块 G · 运营与申请审批](#模块-g--运营与申请审批)
11. [模块 H · 消息与模板](#模块-h--消息与模板)
12. [模块 I · 审计日志](#模块-i--审计日志)
13. [索引与性能](#索引与性能)
14. [数据生命周期](#数据生命周期)
15. [迁移与种子数据](#迁移与种子数据)
16. [未决问题](#未决问题)

---

## 1. 设计目标与约束

### 1.1 设计目标

- **可追溯**：所有写操作可审计；学员数据的每次变更都能回溯到操作人、时间、原值。
- **多校区单租户**：当前为单组织、多校区结构；为未来 SaaS 化预留 `org_id` 字段（默认 1）。
- **权限分层**：4 个角色模板（super-admin / principal / campus-ops / campus-marketing），细粒度权限通过中间件控制。
- **金额可控可见性**：campus-ops 看不到真实金额，需要在 API 层做脱敏，而不在 DB 层。
- **演进友好**：前端是 SPA，后端 API 单独演进；模块化 schema 便于按章节迁移。

### 1.2 关键约束

| 约束 | 决策 |
|---|---|
| 学员有未成年（≤ 13 岁），涉及 COPPA / 隐私 | PII 加密 + 审计;不在 dump 中包含真实姓名 |
| 单笔事务最大跨表 | 限定 ≤ 5 张表；超过则改为事件驱动 |
| 表大小预估（5 年） | leads ~50 万、attendance ~3000 万、audit_log ~1 亿 |
| 主要查询模式 | 按 campus_id + 时间范围过滤 |
| 实时性 | 大多场景秒级一致即可；考勤、审批要强一致 |

---

## 2. 技术栈选型

### 2.1 推荐栈

| 层 | 选型 | 备选 |
|---|---|---|
| 数据库 | **PostgreSQL 15+** | MySQL 8（JSONB 弱于 PG） |
| ORM | **Prisma**（Node）/ **SQLAlchemy 2**（Python） | Drizzle, Knex |
| 迁移工具 | **Prisma Migrate** / **Alembic** | Knex migrations, Flyway |
| 后端框架 | **FastAPI**（Python）/ **Express + tRPC**（Node） | NestJS |
| 鉴权 | **Auth0** / **Clerk** / **Supabase Auth** | 自建 JWT |
| 文件存储 | **AWS S3** / **Cloudflare R2** | MinIO |
| 后台任务 | **Celery**（Python）/ **BullMQ**（Node） | Sidekiq, Temporal |
| 缓存 | **Redis** | Memcached |
| 实时 | **Redis Pub/Sub** + WebSocket | Pusher, Ably |

### 2.2 PostgreSQL 扩展

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- 哈希、加密
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- 模糊搜索（学员姓名搜索）
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- JSONB 字段索引
```

---

## 3. 命名与类型约定

### 3.1 命名规范

| 对象 | 规则 | 示例 |
|---|---|---|
| 表名 | 复数、snake_case | `students`, `trial_evaluations` |
| 列名 | snake_case | `created_at`, `student_id` |
| 主键 | `id` 或 `<table>_id` | `id`（自表）/ `student_id`（外键） |
| 外键 | `<table_singular>_id` | `student_id`, `campus_id` |
| 时间戳 | `_at` 后缀 | `created_at`, `arrived_at` |
| 布尔 | `is_` 前缀 | `is_active`, `is_archived` |
| 索引 | `idx_<table>_<columns>` | `idx_leads_campus_id_created_at` |
| 唯一约束 | `uq_<table>_<columns>` | `uq_students_email` |
| 外键约束 | `fk_<table>_<column>` | `fk_attendance_student_id` |

### 3.2 通用列

每张业务表都包含：

```sql
id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
created_by    UUID         NULL REFERENCES staff(id),   -- 操作人审计
updated_by    UUID         NULL REFERENCES staff(id),
deleted_at    TIMESTAMPTZ  NULL,                         -- 软删除
org_id        BIGINT       NOT NULL DEFAULT 1            -- 预留多租户
```

**触发器**：所有表的 `updated_at` 由触发器自动维护：

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 每张表创建一次
CREATE TRIGGER trg_<table>_updated_at
  BEFORE UPDATE ON <table>
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 3.3 类型选择

| 业务概念 | 列类型 | 理由 |
|---|---|---|
| 主键 | `UUID` | 跨服务可生成，安全；不暴露规模 |
| 金额 | `NUMERIC(12,2)` | 精确；最大 99 亿 |
| 时间戳 | `TIMESTAMPTZ` | 始终带时区；前端按用户时区显示 |
| 日期（无时间） | `DATE` | 如 `trial_date` |
| 短字符串 | `VARCHAR(255)` | 姓名、邮箱、状态码 |
| 长文本 | `TEXT` | 备注、评估文字 |
| 状态枚举 | `VARCHAR(32)` + CHECK | 不用 `ENUM` — 改起来麻烦 |
| 半结构化 | `JSONB` | 联系记录数组、标签 |
| 学员 ID（公开） | `VARCHAR(32) UNIQUE` | 格式 `MD{YYYY}-{MMDD}`，对家长可见 |

---

## 模块 A · 身份与权限

### A.1 `users` — 统一用户表

所有「能登录的人」— 包括员工、家长、学员（如果家长账号关联到孩子的话）。

```sql
CREATE TABLE users (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  phone         VARCHAR(32)  NULL,
  password_hash VARCHAR(255) NULL,           -- bcrypt（如不用第三方鉴权）
  provider      VARCHAR(32)  NOT NULL DEFAULT 'email',  -- email | google | wechat | apple
  provider_id   VARCHAR(255) NULL,            -- 第三方 ID
  display_name  VARCHAR(255) NULL,
  avatar_url    TEXT         NULL,
  user_type     VARCHAR(32)  NOT NULL,        -- staff | guardian | student
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ  NULL,
  email_verified_at TIMESTAMPTZ NULL,
  phone_verified_at TIMESTAMPTZ NULL,
  -- 通用列省略
  CONSTRAINT chk_user_type CHECK (user_type IN ('staff','guardian','student'))
);

CREATE UNIQUE INDEX uq_users_provider_provider_id ON users(provider, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX idx_users_user_type ON users(user_type);
```

### A.2 `staff` — 员工档案

`users.user_type = 'staff'` 时关联此表。

```sql
CREATE TABLE staff (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_code    VARCHAR(16)  NOT NULL UNIQUE,    -- 'EM001' 等内部编号
  full_name     VARCHAR(255) NOT NULL,
  role_id       VARCHAR(32)  NOT NULL REFERENCES roles(id),
  campus_id     UUID         NULL REFERENCES campuses(id),  -- super-admin 可为 NULL
  department    VARCHAR(64)  NULL,                -- '教学部' / '运营部'
  position      VARCHAR(64)  NULL,                -- 具体岗位
  hired_at      DATE         NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',  -- active | leave | inactive
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_staff_status CHECK (status IN ('active','leave','inactive'))
);

CREATE INDEX idx_staff_campus_id ON staff(campus_id);
CREATE INDEX idx_staff_role_id ON staff(role_id);
CREATE INDEX idx_staff_status ON staff(status) WHERE deleted_at IS NULL;
```

### A.3 `roles` — 角色模板

对应 `PERMISSION_TEMPLATES` 的 4 个 key。

```sql
CREATE TABLE roles (
  id            VARCHAR(32)  PRIMARY KEY,        -- 'super-admin' | 'principal' | 'campus-ops' | 'campus-marketing'
  name_zh       VARCHAR(64)  NOT NULL,
  name_en       VARCHAR(64)  NOT NULL,
  category      VARCHAR(32)  NOT NULL,           -- 'admin' | 'mgmt' | 'ops' | 'marketing'
  campus_scope  VARCHAR(16)  NOT NULL,           -- 'all' | 'single'
  description   TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_roles_scope CHECK (campus_scope IN ('all','single'))
);
```

### A.4 `permissions` — 权限码字典

```sql
CREATE TABLE permissions (
  code          VARCHAR(64)  PRIMARY KEY,        -- 'academic.write' / 'approve.refund' / etc.
  description   TEXT         NULL,
  category      VARCHAR(32)  NOT NULL            -- 'dashboard' | 'marketing' | 'academic' | 'finance' | ...
);
```

### A.5 `role_permissions` — 角色-权限多对多

```sql
CREATE TABLE role_permissions (
  role_id         VARCHAR(32) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code VARCHAR(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);
```

### A.6 `user_sessions` — 会话

如使用自建 JWT，记录刷新 token；如用 Auth0 / Clerk，此表可省略。

```sql
CREATE TABLE user_sessions (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token   VARCHAR(255) NOT NULL UNIQUE,
  user_agent      TEXT         NULL,
  ip_address      INET         NULL,
  issued_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ  NOT NULL,
  revoked_at      TIMESTAMPTZ  NULL
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at) WHERE revoked_at IS NULL;
```

---

## 模块 B · 校区与机构

### B.1 `organizations` — 组织（多租户预留）

```sql
CREATE TABLE organizations (
  id            BIGSERIAL    PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  domain        VARCHAR(255) NULL UNIQUE,
  settings      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 种子数据
INSERT INTO organizations (id, name) VALUES (1, 'MindDo');
```

### B.2 `campuses` — 校区

```sql
CREATE TABLE campuses (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(32)  NOT NULL UNIQUE,    -- 'irvine' / 'arcadia' / etc.
  name_zh       VARCHAR(128) NOT NULL,
  name_en       VARCHAR(128) NOT NULL,
  address       TEXT         NULL,
  city          VARCHAR(64)  NULL,
  state         VARCHAR(32)  NULL,
  country       VARCHAR(32)  NOT NULL DEFAULT 'US',
  timezone      VARCHAR(64)  NOT NULL DEFAULT 'America/Los_Angeles',
  phone         VARCHAR(32)  NULL,
  email         VARCHAR(255) NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  -- 通用列
);
```

### B.3 `campus_hours` — 营业时间（按周）

```sql
CREATE TABLE campus_hours (
  campus_id     UUID         NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  weekday       SMALLINT     NOT NULL,           -- 0=周日, 1-6=周一-周六（ISO 8601）
  is_open       BOOLEAN      NOT NULL DEFAULT true,
  open_time     TIME         NULL,               -- '09:00'
  close_time    TIME         NULL,               -- '21:00'
  PRIMARY KEY (campus_id, weekday),
  CONSTRAINT chk_hours_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_hours_range CHECK (
    NOT is_open OR (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)
  )
);
```

### B.4 `campus_holidays` — 假日 / 临时关闭

```sql
CREATE TABLE campus_holidays (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id     UUID         NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL,
  reason        VARCHAR(255) NULL,
  -- 通用列
  CONSTRAINT chk_holiday_range CHECK (start_date <= end_date)
);

CREATE INDEX idx_campus_holidays_campus_dates ON campus_holidays(campus_id, start_date, end_date);
```

### B.5 `classrooms` — 教室

```sql
CREATE TABLE classrooms (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id     UUID         NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  code          VARCHAR(32)  NOT NULL,           -- '教室A' / 'Room-1'
  capacity      SMALLINT     NOT NULL,           -- 容纳学员数
  equipment     JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- ['投影','电脑x8','白板']
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT uq_classrooms_campus_code UNIQUE (campus_id, code),
  CONSTRAINT chk_classroom_status CHECK (status IN ('active','maintenance','inactive'))
);

CREATE INDEX idx_classrooms_campus_status ON classrooms(campus_id, status);
```

### B.6 `campus_notices` — 校区公告

```sql
CREATE TABLE campus_notices (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id     UUID         NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  body          TEXT         NOT NULL,
  notice_type   VARCHAR(16)  NOT NULL,           -- 'info' | 'event' | 'urgent'
  starts_at     TIMESTAMPTZ  NOT NULL,
  ends_at       TIMESTAMPTZ  NULL,
  push_sent_at  TIMESTAMPTZ  NULL,
  audience      VARCHAR(16)  NOT NULL DEFAULT 'parents', -- 'parents' | 'staff' | 'all'
  -- 通用列
  CONSTRAINT chk_notice_type CHECK (notice_type IN ('info','event','urgent'))
);

CREATE INDEX idx_campus_notices_campus_active ON campus_notices(campus_id, starts_at, ends_at) WHERE deleted_at IS NULL;
```

---

## 模块 C · 家庭与学员

### C.1 `families` — 家庭

家庭是<strong>结算单位</strong> — 一个家庭对应一份计费档案，可以有多个孩子。

```sql
CREATE TABLE families (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_code   VARCHAR(32)  NOT NULL UNIQUE,    -- 'FM-202604-0001'
  display_name  VARCHAR(255) NOT NULL,           -- '李家' / 'The Lee Family'
  primary_campus_id UUID     NULL REFERENCES campuses(id),
  source        VARCHAR(32)  NULL,               -- 来源渠道
  notes         TEXT         NULL,
  -- 通用列
);
```

### C.2 `students` — 学员

```sql
CREATE TABLE students (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_code  VARCHAR(32)  NOT NULL UNIQUE,    -- 'MD2026-0417'，对家长公开
  family_id     UUID         NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  full_name     VARCHAR(255) NOT NULL,
  english_name  VARCHAR(255) NULL,
  birthday      DATE         NULL,
  grade         VARCHAR(32)  NULL,               -- '六年级'
  gender        VARCHAR(8)   NULL,               -- 'M' | 'F' | 'X'
  campus_id     UUID         NOT NULL REFERENCES campuses(id),
  goal          TEXT         NULL,
  level         VARCHAR(32)  NOT NULL DEFAULT 'Beginner',  -- Beginner | Intermediate | Advanced
  enrolled_at   DATE         NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',    -- active | paused | graduated | left
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_student_level CHECK (level IN ('Beginner','Intermediate','Advanced')),
  CONSTRAINT chk_student_status CHECK (status IN ('active','paused','graduated','left'))
);

CREATE INDEX idx_students_family_id ON students(family_id);
CREATE INDEX idx_students_campus_status ON students(campus_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_full_name_trgm ON students USING GIN (full_name gin_trgm_ops);  -- 模糊搜索
```

### C.3 `guardians` — 监护人

```sql
CREATE TABLE guardians (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID         NULL UNIQUE REFERENCES users(id),  -- NULL = 仅记录信息未注册
  family_id     UUID         NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  full_name     VARCHAR(255) NOT NULL,
  relationship  VARCHAR(32)  NOT NULL,           -- 'mother' | 'father' | 'grandparent' | 'other'
  phone         VARCHAR(32)  NULL,
  email         VARCHAR(255) NULL,
  wechat        VARCHAR(64)  NULL,
  is_primary    BOOLEAN      NOT NULL DEFAULT false,
  preferred_channel VARCHAR(16) NULL,            -- 'wechat' | 'phone' | 'email'
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_guardian_relation CHECK (relationship IN ('mother','father','grandparent','guardian','other'))
);

CREATE UNIQUE INDEX uq_guardians_family_primary ON guardians(family_id) WHERE is_primary = true;
CREATE INDEX idx_guardians_family_id ON guardians(family_id);
```

### C.4 `student_guardian_links` — 学员-监护人显式关系（可选）

家庭单位下默认所有监护人对所有学员有访问权。如需更细控制（例如离婚家庭只允许某监护人查询某孩子）使用此表：

```sql
CREATE TABLE student_guardian_links (
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id   UUID         NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  access_level  VARCHAR(16)  NOT NULL DEFAULT 'full',  -- 'full' | 'view-only' | 'none'
  PRIMARY KEY (student_id, guardian_id)
);
```

### C.5 `student_growth_records` — 月度成长档案

```sql
CREATE TABLE student_growth_records (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month         CHAR(7)      NOT NULL,           -- 'YYYY-MM'
  interest_score   SMALLINT  NULL CHECK (interest_score   BETWEEN 0 AND 100),
  coding_score     SMALLINT  NULL CHECK (coding_score     BETWEEN 0 AND 100),
  expression_score SMALLINT  NULL CHECK (expression_score BETWEEN 0 AND 100),
  independence_score SMALLINT NULL CHECK (independence_score BETWEEN 0 AND 100),
  composite_score  SMALLINT  NULL CHECK (composite_score  BETWEEN 0 AND 100),
  comment       TEXT         NULL,
  teacher_id    UUID         NULL REFERENCES staff(id),
  -- 通用列
  CONSTRAINT uq_growth_student_month UNIQUE (student_id, month)
);

CREATE INDEX idx_growth_student_month ON student_growth_records(student_id, month DESC);
```

### C.6 `student_portfolio` — 作品集

```sql
CREATE TABLE student_portfolio (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT         NULL,
  asset_type    VARCHAR(32)  NOT NULL,           -- 'code' | 'image' | 'video' | 'pdf' | 'link'
  asset_url     TEXT         NOT NULL,           -- S3 URL 或外链
  asset_size_bytes BIGINT    NULL,
  completed_at  DATE         NULL,
  tags          JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_featured   BOOLEAN      NOT NULL DEFAULT false,
  -- 通用列
);

CREATE INDEX idx_portfolio_student_id ON student_portfolio(student_id, completed_at DESC);
```

---

## 模块 D · 销售与 CRM

### D.1 `leads` — 试课线索

```sql
CREATE TABLE leads (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_code       VARCHAR(32)  NOT NULL UNIQUE,  -- 'LD-2026-000123'
  -- 学员信息（试课时孩子尚未注册为正式学员）
  student_name    VARCHAR(255) NOT NULL,
  student_age     SMALLINT     NULL,
  student_grade   VARCHAR(32)  NULL,
  birthday        DATE         NULL,
  -- 家长信息
  parent_name     VARCHAR(255) NOT NULL,
  parent_phone    VARCHAR(32)  NULL,
  parent_email    VARCHAR(255) NULL,
  parent_wechat   VARCHAR(64)  NULL,
  -- 试课信息
  campus_id       UUID         NOT NULL REFERENCES campuses(id),
  subject         VARCHAR(64)  NULL,             -- 'ai-coding' / 'creative' 等
  trial_date      DATE         NULL,
  trial_time      TIME         NULL,
  classroom_id    UUID         NULL REFERENCES classrooms(id),
  assigned_teacher_id UUID     NULL REFERENCES staff(id),
  -- 渠道
  channel         VARCHAR(32)  NULL,             -- 'wechat' / 'google' / 'instagram' / 'referral' / 'tiktok'
  channel_meta    JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- 跟踪参数 utm_*
  referrer_lead_id UUID        NULL REFERENCES leads(id),     -- 老学员推荐
  -- CRM 状态
  crm_status      VARCHAR(16)  NOT NULL DEFAULT 'new',         -- new | contacted | follow | won | lost
  trial_status    VARCHAR(16)  NOT NULL DEFAULT 'booked',      -- booked | confirmed | in_progress | completed | noshow | canceled
  -- 跟进
  assigned_to     UUID         NULL REFERENCES staff(id),
  last_contact_at TIMESTAMPTZ  NULL,
  next_contact_at TIMESTAMPTZ  NULL,
  -- 转化
  converted_student_id UUID    NULL REFERENCES students(id),
  converted_at    TIMESTAMPTZ  NULL,
  lost_reason     VARCHAR(255) NULL,
  -- 元数据
  goal            TEXT         NULL,
  notes           TEXT         NULL,
  consent_given   BOOLEAN      NOT NULL DEFAULT false,
  consent_at      TIMESTAMPTZ  NULL,
  -- 通用列
  CONSTRAINT chk_crm_status CHECK (crm_status IN ('new','contacted','follow','won','lost')),
  CONSTRAINT chk_trial_status CHECK (trial_status IN ('booked','confirmed','in_progress','completed','noshow','canceled'))
);

CREATE INDEX idx_leads_campus_status ON leads(campus_id, crm_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_trial_date ON leads(trial_date) WHERE trial_status IN ('booked','confirmed');
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_next_contact_at ON leads(next_contact_at) WHERE next_contact_at IS NOT NULL;
CREATE INDEX idx_leads_phone_trgm ON leads USING GIN (parent_phone gin_trgm_ops);
```

### D.2 `lead_tags` — 标签（多对多）

```sql
CREATE TABLE lead_tags (
  lead_id       UUID         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag           VARCHAR(64)  NOT NULL,
  added_by      UUID         NULL REFERENCES staff(id),
  added_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag)
);

CREATE INDEX idx_lead_tags_tag ON lead_tags(tag);
```

### D.3 `lead_contacts` — 联系记录

```sql
CREATE TABLE lead_contacts (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id       UUID         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contacted_by  UUID         NULL REFERENCES staff(id),
  channel       VARCHAR(16)  NOT NULL,           -- 'call' | 'wechat' | 'email' | 'sms' | 'visit'
  note          TEXT         NULL,
  outcome       VARCHAR(32)  NULL,               -- 'connected' | 'no-answer' | 'rescheduled' | 'committed'
  contacted_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- 通用列
  CONSTRAINT chk_contact_channel CHECK (channel IN ('call','wechat','email','sms','visit','other'))
);

CREATE INDEX idx_lead_contacts_lead_id_time ON lead_contacts(lead_id, contacted_at DESC);
```

### D.4 `assessments` — 入学评估（家长侧自测）

```sql
CREATE TABLE assessments (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id       UUID         NULL REFERENCES leads(id),
  student_id    UUID         NULL REFERENCES students(id),
  email         VARCHAR(255) NULL,
  level         VARCHAR(32)  NULL,
  learning_style VARCHAR(64) NULL,
  confidence    SMALLINT     NULL,
  quiz_score    SMALLINT     NULL,
  recommendation TEXT        NULL,
  raw_answers   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- 通用列
);

CREATE INDEX idx_assessments_lead_id ON assessments(lead_id);
CREATE INDEX idx_assessments_email ON assessments(email);
```

### D.5 `trial_evaluations` — 试课评估（运营/教师侧）

```sql
CREATE TABLE trial_evaluations (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id         UUID         NOT NULL UNIQUE REFERENCES leads(id),
  evaluator_id    UUID         NOT NULL REFERENCES staff(id),
  interest_score  SMALLINT     NOT NULL CHECK (interest_score BETWEEN 1 AND 5),
  focus_score     SMALLINT     NOT NULL CHECK (focus_score BETWEEN 1 AND 5),
  recommended_level VARCHAR(32) NOT NULL,
  recommended_courses JSONB    NOT NULL DEFAULT '[]'::jsonb,  -- ['ai-coding-101', ...]
  comment_zh      TEXT         NOT NULL,
  comment_en      TEXT         NULL,
  evaluated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- 通用列
);

CREATE INDEX idx_trial_evals_evaluator ON trial_evaluations(evaluator_id, evaluated_at DESC);
```

### D.6 `trial_feedback_parent` — 家长试课反馈

```sql
CREATE TABLE trial_feedback_parent (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id       UUID         NOT NULL UNIQUE REFERENCES leads(id),
  guardian_id   UUID         NULL REFERENCES guardians(id),
  rating        SMALLINT     NULL CHECK (rating BETWEEN 1 AND 5),
  feedback      TEXT         NULL,
  would_recommend BOOLEAN    NULL,
  submitted_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- 通用列
);
```

### D.7 `referrals` — 推荐链路

```sql
CREATE TABLE referrals (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_family_id UUID    NOT NULL REFERENCES families(id),
  referee_lead_id    UUID    NOT NULL REFERENCES leads(id),
  channel       VARCHAR(32)  NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',    -- pending | rewarded | invalid
  reward_amount NUMERIC(10,2) NULL,
  rewarded_at   TIMESTAMPTZ  NULL,
  -- 通用列
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_family_id);
```

### D.8 `marketing_targets` — 销售目标

```sql
CREATE TABLE marketing_targets (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id     UUID         NULL REFERENCES campuses(id),
  staff_id      UUID         NULL REFERENCES staff(id),
  period        CHAR(7)      NOT NULL,           -- 'YYYY-MM'
  metric        VARCHAR(32)  NOT NULL,           -- 'new_leads' | 'conversions' | 'revenue'
  target_value  NUMERIC(12,2) NOT NULL,
  -- 通用列
  CONSTRAINT uq_marketing_targets UNIQUE (campus_id, staff_id, period, metric)
);
```

### D.9 `marketing_templates` — 营销模板

```sql
CREATE TABLE marketing_templates (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(128) NOT NULL,
  channel       VARCHAR(16)  NOT NULL,           -- 'wechat' | 'email' | 'sms'
  template_type VARCHAR(32)  NOT NULL,           -- 'first_contact' | 'followup' | 'renewal' | 'absence'
  subject       VARCHAR(255) NULL,
  body          TEXT         NOT NULL,
  variables     JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- 可注入变量列表
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  -- 通用列
);
```

---

## 模块 E · 教务与课程

### E.1 `class_offerings` — 班级/课次模板

一行代表「每周三 16:30 的 AI 编程进阶班」这种<strong>固定排期模板</strong>。

```sql
CREATE TABLE class_offerings (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id     UUID         NOT NULL REFERENCES campuses(id),
  name_zh       VARCHAR(128) NOT NULL,
  name_en       VARCHAR(128) NOT NULL,
  subject       VARCHAR(64)  NOT NULL,           -- 'ai-coding' | 'creative' | ...
  level         VARCHAR(32)  NOT NULL,
  teacher_id    UUID         NULL REFERENCES staff(id),
  classroom_id  UUID         NULL REFERENCES classrooms(id),
  schedule      JSONB        NOT NULL,           -- {weekday:3,start:'16:30',end:'18:00'} 或周期
  start_date    DATE         NOT NULL,
  end_date      DATE         NULL,
  capacity      SMALLINT     NOT NULL DEFAULT 8,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',  -- active | full | closed
  description   TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_offering_status CHECK (status IN ('active','full','closed'))
);

CREATE INDEX idx_offerings_campus_subject ON class_offerings(campus_id, subject, level);
CREATE INDEX idx_offerings_teacher ON class_offerings(teacher_id);
```

### E.2 `class_sessions` — 具体课次实例

由 `class_offerings` 按时间排程生成。<strong>这才是考勤、结算的真实单位</strong>。

```sql
CREATE TABLE class_sessions (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id   UUID         NOT NULL REFERENCES class_offerings(id),
  session_date  DATE         NOT NULL,
  start_at      TIMESTAMPTZ  NOT NULL,
  end_at        TIMESTAMPTZ  NOT NULL,
  teacher_id    UUID         NULL REFERENCES staff(id),    -- 可临时替换教师
  classroom_id  UUID         NULL REFERENCES classrooms(id),
  status        VARCHAR(16)  NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | completed | canceled
  cancellation_reason TEXT   NULL,
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT uq_class_sessions_offering_date UNIQUE (offering_id, session_date),
  CONSTRAINT chk_session_time CHECK (start_at < end_at),
  CONSTRAINT chk_session_status CHECK (status IN ('scheduled','in_progress','completed','canceled'))
);

CREATE INDEX idx_class_sessions_date_status ON class_sessions(session_date, status);
CREATE INDEX idx_class_sessions_offering ON class_sessions(offering_id, session_date);
```

### E.3 `class_enrollments` — 学员-班级 关系

```sql
CREATE TABLE class_enrollments (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  offering_id   UUID         NOT NULL REFERENCES class_offerings(id),
  enrolled_at   DATE         NOT NULL DEFAULT CURRENT_DATE,
  unenrolled_at DATE         NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',    -- active | paused | left
  -- 通用列
  CONSTRAINT uq_enrollment UNIQUE (student_id, offering_id, enrolled_at),
  CONSTRAINT chk_enrollment_status CHECK (status IN ('active','paused','left'))
);

CREATE INDEX idx_enrollments_student ON class_enrollments(student_id, status);
CREATE INDEX idx_enrollments_offering ON class_enrollments(offering_id) WHERE status = 'active';
```

### E.4 `attendance` — 考勤记录

```sql
CREATE TABLE attendance (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    UUID         NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id    UUID         NOT NULL REFERENCES students(id),
  status        VARCHAR(16)  NOT NULL,           -- 'present' | 'late' | 'absent' | 'leave'
  late_minutes  SMALLINT     NULL,
  leave_reason  TEXT         NULL,
  leave_source  VARCHAR(16)  NULL,               -- 'app' | 'phone' | 'teacher'
  marked_by     UUID         NOT NULL REFERENCES staff(id),
  marked_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- 通用列
  CONSTRAINT uq_attendance_session_student UNIQUE (session_id, student_id),
  CONSTRAINT chk_attendance_status CHECK (status IN ('present','late','absent','leave'))
);

CREATE INDEX idx_attendance_student_date ON attendance(student_id, marked_at DESC);
CREATE INDEX idx_attendance_session ON attendance(session_id);
```

> **审计**：考勤改动写入 `audit_log`，旧值 + 新值都保留，前端「变更历史」tab 直接读取。

### E.5 `assignments` — 作业

```sql
CREATE TABLE assignments (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    UUID         NULL REFERENCES class_sessions(id),
  offering_id   UUID         NULL REFERENCES class_offerings(id),
  title         VARCHAR(255) NOT NULL,
  description   TEXT         NULL,
  due_at        TIMESTAMPTZ  NULL,
  total_points  SMALLINT     NULL,
  created_by    UUID         NULL REFERENCES staff(id),
  -- 通用列
);
```

### E.6 `assignment_submissions` — 学员作业提交

```sql
CREATE TABLE assignment_submissions (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID         NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID         NOT NULL REFERENCES students(id),
  submitted_at  TIMESTAMPTZ  NULL,
  content       TEXT         NULL,
  attachment_url TEXT        NULL,
  score         SMALLINT     NULL,
  teacher_comment TEXT       NULL,
  graded_by     UUID         NULL REFERENCES staff(id),
  graded_at     TIMESTAMPTZ  NULL,
  -- 通用列
  CONSTRAINT uq_submission UNIQUE (assignment_id, student_id)
);

CREATE INDEX idx_submissions_student ON assignment_submissions(student_id, submitted_at DESC);
```

### E.7 `student_levels` — 等级历史（可选）

如果需要追溯等级变更，独立一张：

```sql
CREATE TABLE student_level_history (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  level         VARCHAR(32)  NOT NULL,
  effective_from DATE        NOT NULL,
  set_by        UUID         NULL REFERENCES staff(id),
  reason        TEXT         NULL,
  -- 通用列
);

CREATE INDEX idx_level_history_student ON student_level_history(student_id, effective_from DESC);
```

### E.8 `teacher_rates` / `teacher_availability`

```sql
CREATE TABLE teacher_rates (
  staff_id      UUID         PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  hourly_rate   NUMERIC(8,2) NOT NULL,
  currency      CHAR(3)      NOT NULL DEFAULT 'USD',
  effective_from DATE        NOT NULL,
  notes         TEXT         NULL
);

CREATE TABLE teacher_availability (
  staff_id      UUID         NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday       SMALLINT     NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  PRIMARY KEY (staff_id, weekday, start_time),
  CHECK (start_time < end_time)
);
```

---

## 模块 F · 财务与套餐

### F.1 `membership_plans` — 套餐定义

```sql
CREATE TABLE membership_plans (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(32)  NOT NULL UNIQUE,    -- 'starter-12' / 'pro-24'
  name_zh       VARCHAR(128) NOT NULL,
  name_en       VARCHAR(128) NOT NULL,
  total_sessions SMALLINT    NOT NULL,           -- 包含课时数
  valid_days    SMALLINT     NOT NULL,           -- 有效期（天）
  price_cents   BIGINT       NOT NULL,           -- 分（精度安全）
  currency      CHAR(3)      NOT NULL DEFAULT 'USD',
  applicable_levels JSONB    NOT NULL DEFAULT '[]'::jsonb,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  -- 通用列
);
```

### F.2 `memberships` — 学员套餐订单

```sql
CREATE TABLE memberships (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_code    VARCHAR(32)  NOT NULL UNIQUE,    -- 'OD-2026-000456'
  student_id    UUID         NOT NULL REFERENCES students(id),
  plan_id       UUID         NOT NULL REFERENCES membership_plans(id),
  family_id     UUID         NOT NULL REFERENCES families(id),
  total_sessions SMALLINT    NOT NULL,
  used_sessions  SMALLINT    NOT NULL DEFAULT 0,
  remaining_sessions SMALLINT GENERATED ALWAYS AS (total_sessions - used_sessions) STORED,
  effective_from DATE        NOT NULL,
  expires_at    DATE         NOT NULL,
  amount_cents  BIGINT       NOT NULL,
  currency      CHAR(3)      NOT NULL DEFAULT 'USD',
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',    -- active | exhausted | expired | refunded
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_membership_status CHECK (status IN ('active','exhausted','expired','refunded'))
);

CREATE INDEX idx_memberships_student_active ON memberships(student_id, status, expires_at);
CREATE INDEX idx_memberships_family ON memberships(family_id);
CREATE INDEX idx_memberships_expiring ON memberships(expires_at) WHERE status = 'active';
```

### F.3 `session_consumptions` — 课时消耗记录

每节课结束后，从 `memberships.remaining_sessions` 扣 1。维护一张明细表保证<strong>对账可审计</strong>。

```sql
CREATE TABLE session_consumptions (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  membership_id UUID         NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
  session_id    UUID         NOT NULL REFERENCES class_sessions(id),
  attendance_id UUID         NOT NULL REFERENCES attendance(id),
  consumed_sessions SMALLINT NOT NULL DEFAULT 1,
  reversed_at   TIMESTAMPTZ  NULL,               -- 退课 / 误扣 时回滚
  reversed_by   UUID         NULL REFERENCES staff(id),
  reversed_reason TEXT       NULL,
  -- 通用列
  CONSTRAINT uq_consumption UNIQUE (attendance_id)
);

CREATE INDEX idx_consumption_membership ON session_consumptions(membership_id);
```

### F.4 `payments` — 付费记录

```sql
CREATE TABLE payments (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_code  VARCHAR(32)  NOT NULL UNIQUE,
  family_id     UUID         NOT NULL REFERENCES families(id),
  student_id    UUID         NULL REFERENCES students(id),
  membership_id UUID         NULL REFERENCES memberships(id),
  amount_cents  BIGINT       NOT NULL,           -- 分，避免浮点
  currency      CHAR(3)      NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(16) NOT NULL,           -- 'alipay' | 'wechat' | 'card' | 'cash' | 'bank'
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',     -- pending | paid | refunded | failed
  gateway       VARCHAR(32)  NULL,                -- 'stripe' | 'adyen' | etc.
  gateway_txn_id VARCHAR(255) NULL,
  gateway_response JSONB     NULL,
  paid_at       TIMESTAMPTZ  NULL,
  refunded_at   TIMESTAMPTZ  NULL,
  refund_amount_cents BIGINT NULL,
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_payment_status CHECK (status IN ('pending','paid','refunded','partial_refunded','failed','canceled')),
  CONSTRAINT chk_payment_method CHECK (payment_method IN ('alipay','wechat','card','cash','bank','email','other'))
);

CREATE INDEX idx_payments_family ON payments(family_id, paid_at DESC);
CREATE INDEX idx_payments_status ON payments(status) WHERE status != 'paid';
CREATE INDEX idx_payments_paid_at ON payments(paid_at) WHERE status = 'paid';
```

### F.5 `invoices` — 发票（独立于支付）

```sql
CREATE TABLE invoices (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_code  VARCHAR(32)  NOT NULL UNIQUE,
  payment_id    UUID         NOT NULL REFERENCES payments(id),
  family_id     UUID         NOT NULL REFERENCES families(id),
  amount_cents  BIGINT       NOT NULL,
  currency      CHAR(3)      NOT NULL DEFAULT 'USD',
  issued_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  pdf_url       TEXT         NULL,
  -- 通用列
);
```

### F.6 `contracts` — 合同

```sql
CREATE TABLE contracts (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_code VARCHAR(32)  NOT NULL UNIQUE,
  family_id     UUID         NOT NULL REFERENCES families(id),
  student_id    UUID         NULL REFERENCES students(id),
  contract_type VARCHAR(32)  NOT NULL,           -- 'enrollment' | 'renewal' | 'transfer'
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',     -- pending | signed | expired | terminated
  pdf_url       TEXT         NULL,
  signed_at     TIMESTAMPTZ  NULL,
  signed_by     UUID         NULL REFERENCES guardians(id),
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT chk_contract_status CHECK (status IN ('pending','signed','expired','terminated'))
);

CREATE INDEX idx_contracts_family ON contracts(family_id);
CREATE INDEX idx_contracts_expiry ON contracts(end_date) WHERE status = 'signed';
```

### F.7 `payroll_entries` — 教师工资条

```sql
CREATE TABLE payroll_entries (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id      UUID         NOT NULL REFERENCES staff(id),
  period        CHAR(7)      NOT NULL,           -- 'YYYY-MM'
  sessions_taught SMALLINT   NOT NULL DEFAULT 0,
  hours_taught  NUMERIC(6,2) NOT NULL DEFAULT 0,
  hourly_rate   NUMERIC(8,2) NOT NULL,
  base_amount_cents BIGINT   NOT NULL,
  bonus_cents   BIGINT       NOT NULL DEFAULT 0,
  deduction_cents BIGINT     NOT NULL DEFAULT 0,
  net_amount_cents BIGINT    NOT NULL,
  currency      CHAR(3)      NOT NULL DEFAULT 'USD',
  status        VARCHAR(16)  NOT NULL DEFAULT 'draft',  -- draft | confirmed | paid
  paid_at       TIMESTAMPTZ  NULL,
  notes         TEXT         NULL,
  -- 通用列
  CONSTRAINT uq_payroll UNIQUE (staff_id, period),
  CONSTRAINT chk_payroll_status CHECK (status IN ('draft','confirmed','paid'))
);
```

---

## 模块 G · 运营与申请审批

### G.1 `schedule_requests` — 请假/改期申请

```sql
CREATE TABLE schedule_requests (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID         NOT NULL REFERENCES students(id),
  guardian_id     UUID         NULL REFERENCES guardians(id),
  request_type    VARCHAR(16)  NOT NULL,         -- 'leave' | 'reschedule' | 'withdraw'
  original_session_id UUID     NULL REFERENCES class_sessions(id),
  target_session_id   UUID     NULL REFERENCES class_sessions(id),  -- 改期目标
  target_label    VARCHAR(255) NULL,             -- 改期前的目标描述
  reason          TEXT         NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | canceled
  decided_by      UUID         NULL REFERENCES staff(id),
  decided_at      TIMESTAMPTZ  NULL,
  decision_reason TEXT         NULL,
  submitted_by    UUID         NULL REFERENCES users(id),   -- 可能是 guardian 用户、也可能 staff 代录
  submission_channel VARCHAR(16) NOT NULL DEFAULT 'app',    -- 'app' | 'staff_proxy'
  -- 通用列
  CONSTRAINT chk_request_type CHECK (request_type IN ('leave','reschedule','withdraw')),
  CONSTRAINT chk_request_status CHECK (status IN ('pending','approved','rejected','canceled'))
);

CREATE INDEX idx_requests_student ON schedule_requests(student_id, submitted_at DESC);
CREATE INDEX idx_requests_pending ON schedule_requests(status, created_at) WHERE status = 'pending';
```

### G.2 `approvals` — 财务审批

```sql
CREATE TABLE approvals (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_type   VARCHAR(32)  NOT NULL,         -- 'refund' | 'expense' | 'discount' | 'transfer'
  amount_cents    BIGINT       NOT NULL,
  currency        CHAR(3)      NOT NULL DEFAULT 'USD',
  requester_id    UUID         NOT NULL REFERENCES staff(id),
  related_payment_id UUID      NULL REFERENCES payments(id),
  related_student_id UUID      NULL REFERENCES students(id),
  detail          TEXT         NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  decided_by      UUID         NULL REFERENCES staff(id),
  decided_at      TIMESTAMPTZ  NULL,
  decision_reason TEXT         NULL,
  submitted_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- 通用列
  CONSTRAINT chk_approval_type CHECK (approval_type IN ('refund','expense','discount','transfer','other')),
  CONSTRAINT chk_approval_status CHECK (status IN ('pending','approved','rejected'))
);

CREATE INDEX idx_approvals_status_submitted ON approvals(status, submitted_at) WHERE status = 'pending';
CREATE INDEX idx_approvals_requester ON approvals(requester_id);
```

### G.3 `shift_notes` — 交班记录

```sql
CREATE TABLE shift_notes (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id     UUID         NOT NULL REFERENCES campuses(id),
  shift_date    DATE         NOT NULL,
  shift_type    VARCHAR(16)  NOT NULL DEFAULT 'day',   -- 'morning' | 'day' | 'evening'
  author_id     UUID         NOT NULL REFERENCES staff(id),
  completed_summary TEXT     NULL,
  pending_issues TEXT        NULL,
  tomorrow_focus TEXT        NULL,
  ai_draft_used BOOLEAN      NOT NULL DEFAULT false,
  acknowledged_by JSONB      NOT NULL DEFAULT '[]'::jsonb,  -- [{user_id, ack_at}, ...]
  -- 通用列
);

CREATE INDEX idx_shift_notes_campus_date ON shift_notes(campus_id, shift_date DESC);
```

### G.4 `trial_slots_config` — 试课时段配置

```sql
CREATE TABLE trial_slots_config (
  campus_id     UUID         PRIMARY KEY REFERENCES campuses(id) ON DELETE CASCADE,
  config        JSONB        NOT NULL DEFAULT '{}'::jsonb
  -- 形如：
  -- {
  --   "weekdays": {
  --     "1": [{"start":"16:00","end":"17:00","capacity":3}],
  --     "6": [{"start":"10:00","end":"11:00","capacity":4}, ...]
  --   }
  -- }
);
```

### G.5 `invite_tokens` — 邀请令牌

```sql
CREATE TABLE invite_tokens (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  token         VARCHAR(64)  NOT NULL UNIQUE,
  token_type    VARCHAR(16)  NOT NULL,           -- 'guardian' | 'student' | 'staff'
  family_id     UUID         NULL REFERENCES families(id),
  student_id    UUID         NULL REFERENCES students(id),
  invited_email VARCHAR(255) NULL,
  invited_phone VARCHAR(32)  NULL,
  created_by    UUID         NULL REFERENCES staff(id),
  expires_at    TIMESTAMPTZ  NOT NULL,
  used_at       TIMESTAMPTZ  NULL,
  used_by       UUID         NULL REFERENCES users(id),
  CONSTRAINT chk_invite_type CHECK (token_type IN ('guardian','student','staff'))
);

CREATE INDEX idx_invite_tokens_expires ON invite_tokens(expires_at) WHERE used_at IS NULL;
```

---

## 模块 H · 消息与模板

### H.1 `messages` — 消息出站队列（替代 `minddo_email_outbox`）

```sql
CREATE TABLE messages (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel       VARCHAR(16)  NOT NULL,           -- 'email' | 'sms' | 'wechat' | 'push'
  template_id   UUID         NULL REFERENCES marketing_templates(id),
  to_user_id    UUID         NULL REFERENCES users(id),
  to_address    VARCHAR(255) NOT NULL,           -- 邮箱 / 手机 / wechat id
  subject       VARCHAR(255) NULL,
  body          TEXT         NOT NULL,
  variables     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status        VARCHAR(16)  NOT NULL DEFAULT 'queued',     -- queued | sent | failed | bounced
  attempts      SMALLINT     NOT NULL DEFAULT 0,
  scheduled_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ  NULL,
  failure_reason TEXT        NULL,
  related_lead_id UUID       NULL REFERENCES leads(id),
  related_student_id UUID    NULL REFERENCES students(id),
  -- 通用列
  CONSTRAINT chk_message_channel CHECK (channel IN ('email','sms','wechat','push','inapp')),
  CONSTRAINT chk_message_status CHECK (status IN ('queued','sending','sent','failed','bounced'))
);

CREATE INDEX idx_messages_status_scheduled ON messages(status, scheduled_at) WHERE status IN ('queued','sending');
CREATE INDEX idx_messages_to_user ON messages(to_user_id);
```

### H.2 `feedback` — 通用反馈（家长 / 教师 / 学员均可）

```sql
CREATE TABLE feedback (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type   VARCHAR(16)  NOT NULL,           -- 'parent' | 'teacher' | 'student'
  source_user_id UUID        NULL REFERENCES users(id),
  related_student_id UUID    NULL REFERENCES students(id),
  related_session_id UUID    NULL REFERENCES class_sessions(id),
  category      VARCHAR(32)  NULL,               -- 'attendance' | 'progress' | 'service' | 'complaint'
  rating        SMALLINT     NULL CHECK (rating BETWEEN 1 AND 5),
  content       TEXT         NOT NULL,
  is_addressed  BOOLEAN      NOT NULL DEFAULT false,
  addressed_by  UUID         NULL REFERENCES staff(id),
  addressed_at  TIMESTAMPTZ  NULL,
  addressed_note TEXT        NULL,
  -- 通用列
);

CREATE INDEX idx_feedback_student ON feedback(related_student_id, created_at DESC);
CREATE INDEX idx_feedback_unaddressed ON feedback(is_addressed) WHERE is_addressed = false;
```

### H.3 `chat_history` — AI 客服对话（用户级）

```sql
CREATE TABLE chat_history (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID         NOT NULL,            -- 同一对话的多条消息共享
  role          VARCHAR(16)  NOT NULL,            -- 'user' | 'assistant' | 'system'
  content       TEXT         NOT NULL,
  page_context  VARCHAR(64)  NULL,                -- 来源页
  confidence    NUMERIC(3,2) NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_chat_role CHECK (role IN ('user','assistant','system'))
);

CREATE INDEX idx_chat_history_user_session ON chat_history(user_id, session_id, created_at);
```

---

## 模块 I · 审计日志

### I.1 `audit_log` — 操作日志

替代 `minddo_audit_log`（前端 500 行 cap）— 后端不设上限，按月分区。

```sql
CREATE TABLE audit_log (
  id            BIGSERIAL    PRIMARY KEY,
  occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actor_user_id UUID         NULL REFERENCES users(id),  -- NULL = 系统操作
  actor_type    VARCHAR(16)  NOT NULL DEFAULT 'user',    -- 'user' | 'system' | 'api'
  ip_address    INET         NULL,
  kind          VARCHAR(64)  NOT NULL,           -- 'lead.update' | 'attendance.write' | 'approval.decide' 等
  entity_type   VARCHAR(32)  NULL,               -- 'lead' | 'student' | 'payment' | ...
  entity_id     UUID         NULL,
  summary       TEXT         NULL,
  diff          JSONB        NULL,               -- {changed: {status:{from:'new',to:'won'}}}
  metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  campus_id     UUID         NULL REFERENCES campuses(id)
) PARTITION BY RANGE (occurred_at);

-- 每月一个分区
CREATE TABLE audit_log_y2026m05 PARTITION OF audit_log FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_log_y2026m06 PARTITION OF audit_log FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- ... 自动化创建未来分区
```

**索引**：

```sql
CREATE INDEX idx_audit_log_actor_time ON audit_log(actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_kind ON audit_log(kind);
CREATE INDEX idx_audit_log_campus_time ON audit_log(campus_id, occurred_at DESC);
```

### I.2 写入约定

每个 API endpoint 在成功修改后，由中间件自动写一条 audit_log。

```js
// 例：考勤修改
await tx.attendance.update({ where: { id }, data: { status: 'leave' } });
await tx.audit_log.create({
  occurred_at: now(),
  actor_user_id: ctx.userId,
  ip_address: ctx.ip,
  kind: 'attendance.update',
  entity_type: 'attendance',
  entity_id: id,
  summary: `${student.name} 改为请假`,
  diff: { status: { from: oldStatus, to: 'leave' } },
  campus_id: student.campusId
});
```

### I.3 用户可见的「变更历史」

学员详情抽屉的「变更历史」tab 查询：

```sql
SELECT * FROM audit_log
WHERE entity_type IN ('student','attendance','membership','payment')
  AND (entity_id = $student_id OR metadata->>'student_id' = $student_id::text)
ORDER BY occurred_at DESC
LIMIT 100;
```

---

## 索引与性能

### 高频查询模式

| 查询 | 涉及表 | 关键索引 |
|---|---|---|
| 校长看本月校区全量看板 | leads / payments / attendance / approvals | `(campus_id, created_at)` |
| campus-ops 看今日课次时间轴 | class_sessions | `(session_date, status)` |
| 续费提醒列表 | memberships | `expires_at WHERE status='active'` |
| 全局搜学员 | students | `GIN(full_name)` |
| 审计查询 | audit_log | `(entity_type, entity_id)` |
| 待办计数 | schedule_requests / approvals | `(status='pending')` 部分索引 |

### 分区策略

- `audit_log` — 按月分区。1 年后过期分区归档到冷存储（如 S3）。
- `attendance` — 数据量大但访问聚焦于近 3 个月，可按季度分区。
- `messages` — 已发送的可按月归档。

### 物化视图

```sql
-- 续费提醒视图（避免每次扫 memberships）
CREATE MATERIALIZED VIEW v_renewals AS
SELECT
  m.id,
  s.id AS student_id,
  s.full_name,
  s.campus_id,
  m.remaining_sessions,
  m.expires_at,
  m.expires_at - CURRENT_DATE AS days_until_expiry,
  CASE
    WHEN m.remaining_sessions <= 3 THEN 'critical'
    WHEN m.remaining_sessions <= 8 THEN 'warning'
    ELSE 'normal'
  END AS urgency
FROM memberships m
JOIN students s ON s.id = m.student_id
WHERE m.status = 'active'
  AND s.deleted_at IS NULL;

CREATE INDEX idx_v_renewals_campus_urgency ON v_renewals(campus_id, urgency);

-- 每小时刷新
REFRESH MATERIALIZED VIEW CONCURRENTLY v_renewals;
```

---

## 数据生命周期

### 软删除

业务表都用 `deleted_at` 软删除。查询统一加 `WHERE deleted_at IS NULL`。

**例外**：`audit_log` 不删除；`messages` 按保留期硬删除。

### 保留期

| 数据 | 保留期 | 处理 |
|---|---|---|
| 日常业务数据 | 永久 | 软删除 |
| `audit_log` | 7 年 | 按 GDPR / SOC2 要求；过期分区归档到 S3 |
| `messages` (sent) | 1 年 | 物理删除 |
| `chat_history` | 90 天 | 物理删除 |
| `user_sessions` | 30 天后 | 物理删除（包含已 revoked） |
| `invite_tokens` (used / expired) | 90 天 | 物理删除 |

### PII 处理

学员姓名、电话、邮箱、家长信息是 PII。

- 静态加密（at rest）：DB 透明加密（如 AWS RDS、Cloud SQL）。
- 备份加密：备份和归档同样加密。
- 访问审计：所有读 PII 的 API 调用记 audit_log（`kind='pii.read'`）。
- 导出请求（GDPR）：单独的 `data_export_requests` 表追踪进度。
- 删除请求：硬删除前迁移到 `deleted_user_archive` 表（去标识化）。

---

## 迁移与种子数据

### 阶段对应表

| 迁移阶段 | 涉及表 |
|---|---|
| 1. 鉴权 + 员工 | `users`, `staff`, `roles`, `permissions`, `role_permissions`, `user_sessions` |
| 2. 校区 + 教室 | `organizations`, `campuses`, `campus_hours`, `classrooms`, `campus_notices`, `campus_holidays` |
| 3. 家庭 + 学员 | `families`, `students`, `guardians`, `student_guardian_links`, `student_growth_records`, `student_portfolio` |
| 4. 销售 CRM | `leads`, `lead_tags`, `lead_contacts`, `assessments`, `trial_evaluations`, `trial_feedback_parent`, `referrals`, `marketing_targets`, `marketing_templates` |
| 5. 教务 | `class_offerings`, `class_sessions`, `class_enrollments`, `attendance`, `assignments`, `assignment_submissions`, `student_level_history`, `teacher_rates`, `teacher_availability` |
| 6. 财务 | `membership_plans`, `memberships`, `session_consumptions`, `payments`, `invoices`, `contracts`, `payroll_entries` |
| 7. 运营 | `schedule_requests`, `approvals`, `shift_notes`, `trial_slots_config`, `invite_tokens` |
| 8. 消息 + 审计 | `messages`, `feedback`, `chat_history`, `audit_log` |

### 种子数据

参考 `assets/minddo-flow.js` 的 `seedDemoData()` — 后端可以提供 `seed.sql` 或 `seed.ts` 脚本，在 dev / staging 环境一键填充。

**最小测试集**：
- 1 个 org, 3 个 campus
- 12 个 staff（包含 4 个角色各 ≥ 1 人）
- 8 个 family, 12 个 student, 14 个 guardian
- 20 个 lead（各 crm_status 阶段都有）
- 10 个 class_offering, 50 个 class_session
- 100 条 attendance
- 8 个 active membership
- 5 条 schedule_request, 3 条 approval

---

## 未决问题

| 问题 | 影响 | 建议 |
|---|---|---|
| 多租户 SaaS 化 | 几乎所有表加 org_id | 设计阶段就预留，本文档已包含 |
| 实时推送（新审批、考勤）需要吗？ | 高 | 用 Postgres LISTEN/NOTIFY + WebSocket，单独 service |
| 文件存储用 S3 还是自建？ | 中 | 推荐 S3 / R2；表只存 URL |
| 跨校区数据（年报）查询性能？ | 中 | 物化视图或 read-replica |
| 离线 / 弱网场景 | 低 | localStorage 保留作 cache；主路径走 API |
| 国际化（货币 / 时区） | 中 | 已用 TIMESTAMPTZ + currency 字段 |
| 学员账号（非家长）是否独立？ | 中 | `users.user_type = 'student'` 已支持 |
| 教师评估（学员评教师） | 低 | 可加 `teacher_reviews` 表 |
| AI 用量计费 / 用 token 计 | 低 | 加 `ai_invocations` 表，记 endpoint / tokens |

---

## 附录 A · 推荐的 PostgreSQL 配置

```ini
# 基础（4 vCPU / 16 GB）
shared_buffers           = 4GB
work_mem                 = 32MB
maintenance_work_mem     = 512MB
effective_cache_size     = 12GB
max_connections          = 200
random_page_cost         = 1.1    # SSD
checkpoint_completion_target = 0.9

# 日志（便于审计 / 慢查询定位）
log_min_duration_statement = 500ms
log_lock_waits           = on
log_temp_files           = 0
```

---

## 附录 B · 完整表清单

按模块：

- **A · 身份**：users, staff, roles, permissions, role_permissions, user_sessions
- **B · 校区**：organizations, campuses, campus_hours, campus_holidays, classrooms, campus_notices
- **C · 家庭**：families, students, guardians, student_guardian_links, student_growth_records, student_portfolio
- **D · 销售**：leads, lead_tags, lead_contacts, assessments, trial_evaluations, trial_feedback_parent, referrals, marketing_targets, marketing_templates
- **E · 教务**：class_offerings, class_sessions, class_enrollments, attendance, assignments, assignment_submissions, student_level_history, teacher_rates, teacher_availability
- **F · 财务**：membership_plans, memberships, session_consumptions, payments, invoices, contracts, payroll_entries
- **G · 运营**：schedule_requests, approvals, shift_notes, trial_slots_config, invite_tokens
- **H · 消息**：messages, feedback, chat_history
- **I · 审计**：audit_log

**总计：49 张表**（不含分区子表 / 物化视图）。

---

*本文档与 [`SCHEMA.md`](SCHEMA.md) 配套维护。每次新增 `minddo_*` key 或调整字段，请同步更新两个文件。如有疑问请联系架构组。*
