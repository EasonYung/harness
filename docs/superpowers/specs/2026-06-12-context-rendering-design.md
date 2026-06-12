# context_injection 去冗余设计：脚本驱动的按阶段渲染

> 版本：1.0
> 日期：2026-06-12
> 状态：已批准
> 关联文件：org/org.yaml

---

## 一、问题

`org.yaml` 中 `context_injection`（第 148-301 行）与结构化规则节（`ai_behavior`、`security`、`code_quality` 等）维护同一套规则的两份表述：

- **结构化规则**：带 ID、severity、enforcement，是规则的事实来源
- **context_injection**：手工编写的 markdown 文本，供 AI prompt 消费

两份内容必须同步维护，存在漂移风险。此外全量注入所有规则会导致上下文膨胀，不同阶段（propose/apply/verify）实际上只需要各自相关的规则子集。

## 二、方案

**脚本驱动的按阶段渲染**：删除 `context_injection`，新增 `context_rendering` 渲染配置和渲染脚本，从结构化规则按阶段生成 AI 可消费的文本。

### 核心架构

```
org.yaml
├── 结构化规则 (source of truth)
│   ├── ai_behavior: [{id, rule, severity, enforcement}, ...]
│   ├── security: [...]
│   ├── code_quality: [...]
│   └── ...
│
├── context_rendering (渲染配置)
│   ├── common_groups:        # 所有阶段共享的规则
│   ├── phases:               # 按阶段分组的规则
│   │   ├── propose: ...
│   │   ├── continue:         # 含 sub_phases: specs/design/tasks
│   │   ├── apply: ...
│   │   └── verify: ...
│   └── severity_labels / id_format
│
└── [context_injection — 删除]

        ↓  node org/scripts/render-context.mjs --phase <phase>

    渲染后的 markdown（stdout 或文件）
        ↓
    skill 注入 AI prompt 的 <context> 块
```

## 三、具体变更

### 3.1 删除 `context_injection`

删除 `org.yaml` 第 148-301 行（`context_injection` 节及其注释头）。

### 3.2 新增 `context_rendering` 渲染配置

在 `org.yaml` 中 `data_classification` 之后、原 `context_injection` 位置新增：

```yaml
context_rendering:
  # 通用规则：所有阶段都注入
  common_groups:
    - title: "治理原则"
      source: "meta.principles"
      format: "bullet_list"
    - title: "严重级别"
      source: "meta.severity_levels"
      format: "key_value"
    - title: "数据分级"
      source: "data_classification"
      format: "data_classification"

  # 阶段专属规则
  phases:
    propose:
      description: "创建 proposal 时注入"
      groups:
        - title: "AI 行为底线（proposal 相关）"
          source: "ai_behavior"
          filter: { id: ["AI-001", "AI-003"] }
          format: "severity_tagged"
        - title: "Proposal 规则"
          source: "artifact_rules.proposal.rules"
          format: "bullet_list"
        - title: "语言规范"
          source: "language"
          format: "severity_tagged"
        - title: "命名规范"
          source: "naming"
          format: "severity_tagged"
        - title: "依赖管理"
          source: "dependency_management"
          format: "severity_tagged"

    continue:
      description: "生成 specs/design/tasks 时注入"
      sub_phases:
        specs:
          groups:
            - title: "AI 行为底线"
              source: "ai_behavior"
              format: "severity_tagged"
            - title: "Specs 规则"
              source: "artifact_rules.specs.rules"
              format: "bullet_list"
            - title: "安全红线"
              source: "security"
              filter: { severity: block, id_prefix: "SEC-", exclude_prefix: "SEC-DB" }
              format: "numbered_list"
        design:
          groups:
            - title: "AI 行为底线"
              source: "ai_behavior"
              format: "severity_tagged"
            - title: "Design 规则"
              source: "artifact_rules.design.rules"
              format: "bullet_list"
            - title: "数据库安全底线"
              source: "security"
              filter: { id_prefix: "SEC-DB" }
              format: "bullet_list"
            - title: "依赖管理"
              source: "dependency_management"
              format: "severity_tagged"
        tasks:
          groups:
            - title: "AI 行为底线"
              source: "ai_behavior"
              format: "severity_tagged"
            - title: "Tasks 规则"
              source: "artifact_rules.tasks.rules"
              format: "bullet_list"

    apply:
      description: "实现编码任务时注入"
      groups:
        - title: "AI 行为底线（apply 相关）"
          source: "ai_behavior"
          filter: { id: ["AI-004", "AI-006", "AI-007", "AI-008", "AI-009"] }
          format: "severity_tagged"
        - title: "安全红线（不可违反）"
          source: "security"
          filter: { severity: block }
          format: "numbered_list"
        - title: "数据库安全底线"
          source: "security"
          filter: { id_prefix: "SEC-DB" }
          format: "bullet_list"
        - title: "代码质量"
          source: "code_quality"
          format: "severity_tagged"
        - title: "性能底线"
          source: "performance"
          format: "severity_tagged"
        - title: "可观测性"
          source: "observability"
          format: "severity_tagged"
        - title: "DDL/DML 目录约定"
          source: "conventions"
          format: "severity_tagged"
        - title: "Apply 阶段规则"
          source: "artifact_rules.apply.rules"
          format: "bullet_list"

    verify:
      description: "验证实现一致性时注入"
      groups:
        - title: "AI 行为底线（verify 相关）"
          source: "ai_behavior"
          filter: { id: ["AI-009"] }
          format: "severity_tagged"
        - title: "代码质量（verify 相关）"
          source: "code_quality"
          filter: { id: ["CQ-003", "CQ-004", "CQ-006"] }
          format: "severity_tagged"
        - title: "代码审查"
          source: "code_review"
          format: "severity_tagged"

  # 渲染格式配置
  severity_labels:
    block: "(block)"
    warn: "(warn)"
  id_format: "[{id}]"
```

### 3.3 新增渲染脚本

路径：`org/scripts/render-context.mjs`

#### 脚本接口

```bash
# 按阶段渲染
node org/scripts/render-context.mjs --phase propose
node org/scripts/render-context.mjs --phase apply
node org/scripts/render-context.mjs --phase continue --sub-phase specs
node org/scripts/render-context.mjs --phase continue --sub-phase design
node org/scripts/render-context.mjs --phase continue --sub-phase tasks

# 全量渲染（调试/审阅用）
node org/scripts/render-context.mjs --all

# 输出到文件
node org/scripts/render-context.mjs --phase apply --output org/rendered-context.md

# CI 校验
node org/scripts/render-context.mjs --check
```

#### 脚本核心逻辑

```
1. 解析命令行参数（--phase, --sub-phase, --all, --output, --check）
2. 读取并解析 org.yaml
3. 根据 phase 参数确定要渲染的 groups：
   a. 始终包含 common_groups
   b. 追加 phases[phase].groups（有 sub_phase 时取 sub_phases[sub_phase].groups）
4. 遍历每个 group：
   a. resolvePath(org, source) 定位数据
   b. applyFilter(data, filter) 过滤规则
   c. render(data, format, config) 格式化输出
5. 拼接所有 group 的渲染结果
6. 输出到 stdout 或文件（--check 模式下比对现有文件）
```

#### 数据源路径解析

`source` 字段使用点号分隔的路径访问 org.yaml 中的数据：

| source | 解析目标 |
|--------|---------|
| `meta.principles` | `org.meta.principles`（字符串数组） |
| `ai_behavior` | `org.ai_behavior`（对象数组） |
| `security` | `org.security`（对象数组） |
| `artifact_rules.proposal.rules` | `org.artifact_rules.proposal.rules`（对象数组） |
| `data_classification` | `org.data_classification`（含 levels 子节） |

#### filter 规则

| 过滤条件 | 含义 | 示例 |
|---------|------|------|
| `{ id: ["AI-001", "AI-003"] }` | 只包含指定 ID 的规则 | 精确选择 |
| `{ severity: block }` | 只包含指定严重级别 | 按级别过滤 |
| `{ id_prefix: "SEC-DB" }` | 只包含 ID 以指定前缀开头 | 按前缀过滤 |
| `{ id_prefix: "SEC-", exclude_prefix: "SEC-DB" }` | 前缀匹配但排除另一前缀 | 组合过滤 |

#### format 格式

| 格式 | 渲染输出 | 适用数据 |
|------|---------|---------|
| `bullet_list` | `- {rule} [{id}]` | artifact_rules 中的规则 |
| `severity_tagged` | `- {rule} (block/warn) [{id}]` | 带 severity 的规则 |
| `numbered_list` | `1. {rule} [{id}]` | 安全红线等高优先级规则 |
| `key_value` | `- {key}: {子字段.description}` | severity_levels 等嵌套对象，取每个 key 下的 description 字段 |
| `data_classification` | 遍历 data_classification.levels，输出 `- {name}: {description}`；若有 rules 则追加 `→ {rules}` | data_classification 特殊结构 |
| `static` | 原样输出 group.content 字段 | 固定文本（如 SDD 流程描述） |

### 3.4 依赖

脚本依赖 `yaml` npm 包解析 YAML。`org/.opencode/` 目录已有 `yaml` 依赖（`node_modules/yaml`），可直接复用，无需新增依赖。

## 四、Token 预算对比

| 阶段 | 当前（全量注入） | 按阶段注入 | 节省比例 |
|------|-----------------|-----------|---------|
| propose | ~150 条规则 | ~25 条 | ~83% |
| continue/specs | ~150 条规则 | ~40 条 | ~73% |
| continue/design | ~150 条规则 | ~35 条 | ~77% |
| continue/tasks | ~150 条规则 | ~30 条 | ~80% |
| apply | ~150 条规则 | ~60 条 | ~60% |
| verify | ~150 条规则 | ~15 条 | ~90% |

## 五、消费方式

### 场景 A：skill 消费（主要）

```
skill 执行 OpenSpec 命令
  → 确定当前 phase（propose/continue/apply/verify）
  → 调用 node org/scripts/render-context.mjs --phase <phase>
  → 获取渲染后的 markdown
  → 注入 AI prompt 的 <context> 块
```

### 场景 B：人工审阅

```
运行 node org/scripts/render-context.mjs --all --output org/rendered-context.md
  → 生成全量规则文本供人阅读
  → git commit 或仅本地查看
```

### 场景 C：CI 校验

```
CI 流水线执行 node org/scripts/render-context.mjs --check
  → 比对生成物与已提交文件
  → 不一致则失败，提醒维护者重新生成
```

## 六、一致性保证机制

1. **单一来源**：结构化规则是唯一的事实来源，`context_injection` 不再存在
2. **确定性渲染**：相同输入（org.yaml + phase）始终产生相同输出
3. **CI 守门**：`--check` 模式防止手工修改生成物或忘记同步
4. **配置驱动**：分组、排序、格式由 `context_rendering` 声明，不硬编码在脚本中

## 七、遗留项与后续扩展

- **`trigger_vocabulary` 整合**：当前 `trigger_vocabulary` 和 `context_rendering.phases` 有部分重叠（都定义了命令到规则的映射），未来可考虑统一
- **artifact_rules 补充 severity/enforcement**：当前 `artifact_rules` 下的规则缺少 `severity` 和 `enforcement` 字段，建议后续统一补充
- **ORG-A-* 编号修正**：`artifact_rules.apply` 中编号不连续（001-004-007-005-006），建议重新排序
