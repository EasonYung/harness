# Context Rendering 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 org.yaml 中冗余的 `context_injection` 节，新增 `context_rendering` 渲染配置和渲染脚本，实现按阶段精准注入治理规则。

**Architecture:** 结构化规则为唯一事实来源。新增 `context_rendering` 声明式渲染配置定义分组与格式。Node.js 脚本读取 org.yaml 结构化规则，按阶段渲染为 markdown 文本，供 skill 注入 AI prompt。

**Tech Stack:** Node.js ESM (`.mjs`)，`yaml@2.9.0`（已有依赖），无新增依赖。

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `org/org.yaml` | 修改 | 删除 `context_injection`，新增 `context_rendering` |
| `org/scripts/render-context.mjs` | 创建 | 渲染脚本主体 |

---

### Task 1: Add `context_rendering` config to `org.yaml`

**Files:**
- Modify: `org/org.yaml` (在 `data_classification` 之后、原 `context_injection` 之前插入)

- [ ] **Step 1: Insert `context_rendering` config block**

在 `org.yaml` 的 `data_classification` 节（第 146 行 `handling_rules` 结束）之后，`context_injection` 注释头（第 147 行）之前，插入以下内容：

```yaml

# ───────────────────────────────────────────────────────────────
# context_rendering: 定义如何将结构化规则渲染为 AI 可消费的文本
# ───────────────────────────────────────────────────────────────
# 本节是声明式渲染配置，由 org/scripts/render-context.mjs 脚本读取。
# 脚本按 phase 过滤规则，生成精简的 markdown 文本注入 AI prompt。
# 不再有手工维护的 context_injection——渲染输出即为唯一消费版。

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

注意：此步骤仅新增配置，不删除 `context_injection`。暂时保留两份内容以便后续对比验证。

- [ ] **Step 2: Verify YAML is still valid**

Run: `node -e "const YAML=require('./.opencode/node_modules/yaml'); YAML.parse(require('fs').readFileSync('org.yaml','utf-8')); console.log('YAML valid')"` (从 `org/` 目录运行)

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add org/org.yaml
git commit -m "feat(org): add context_rendering config for phase-aware rule rendering"
```

---

### Task 2: Create `render-context.mjs` — YAML parsing and path resolution

**Files:**
- Create: `org/scripts/render-context.mjs`

- [ ] **Step 1: Create script with imports and path resolution**

Create `org/scripts/render-context.mjs` with the foundational code — imports, YAML loading, and the `resolvePath` utility:

```javascript
#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ── Bootstrap: resolve yaml from .opencode/node_modules ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const orgRoot = resolve(__dirname, '..');
const require = createRequire(join(orgRoot, '.opencode', 'package.json'));
const YAML = require('yaml');

// ── YAML Loading ──
function loadOrgYaml() {
  const yamlPath = join(orgRoot, 'org.yaml');
  if (!existsSync(yamlPath)) {
    console.error(`Error: ${yamlPath} not found`);
    process.exit(1);
  }
  return YAML.parse(readFileSync(yamlPath, 'utf-8'));
}

// ── Path Resolution ──
// Resolves a dot-separated source path against the org data object.
// Examples:
//   "ai_behavior"                → org.ai_behavior
//   "meta.principles"            → org.meta.principles
//   "artifact_rules.proposal.rules" → org.artifact_rules.proposal.rules
function resolvePath(obj, source) {
  return source.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, obj);
}

export { loadOrgYaml, resolvePath, orgRoot, YAML };
```

- [ ] **Step 2: Verify the script loads without error**

Run: `node org/scripts/render-context.mjs` (will fail with "No phase specified" — that's OK, means imports work)

Expected: No import/syntax errors. May show a usage error since main() isn't defined yet — that's fine.

- [ ] **Step 3: Commit**

```bash
git add org/scripts/render-context.mjs
git commit -m "feat(scripts): add render-context.mjs skeleton with YAML loading and path resolution"
```

---

### Task 3: Add filter and format renderer logic

**Files:**
- Modify: `org/scripts/render-context.mjs`

- [ ] **Step 1: Add `applyFilter` function**

Append to `render-context.mjs` (before the export line):

```javascript
// ── Filtering ──
// Applies a filter specification to an array of rule objects.
// Filter supports:
//   { id: ["AI-001", "AI-003"] }         — include only rules with matching IDs
//   { severity: "block" }                — include only rules with matching severity
//   { id_prefix: "SEC-DB" }              — include only rules whose ID starts with prefix
//   { id_prefix: "SEC-", exclude_prefix: "SEC-DB" } — prefix match but exclude another prefix
// All filter conditions are ANDed together. No filter = return all.
function applyFilter(data, filter) {
  if (!filter || !data) return data || [];
  let result = data;

  if (filter.id) {
    const idSet = new Set(filter.id);
    result = result.filter(item => idSet.has(item.id));
  }
  if (filter.severity) {
    result = result.filter(item => item.severity === filter.severity);
  }
  if (filter.id_prefix) {
    result = result.filter(item => item.id && item.id.startsWith(filter.id_prefix));
  }
  if (filter.exclude_prefix) {
    result = result.filter(item => !item.id || !item.id.startsWith(filter.exclude_prefix));
  }

  return result;
}
```

Update the export line to include `applyFilter`:

```javascript
export { loadOrgYaml, resolvePath, applyFilter, orgRoot, YAML };
```

- [ ] **Step 2: Add format renderers**

Append the `renderGroup` function that handles all format types:

```javascript
// ── Format Renderers ──
// Each renderer takes data and config, returns an array of markdown lines (without the title).

function renderGroup(data, group, config) {
  if (!data) return [`_(no data for source: ${group.source})_`];

  switch (group.format) {
    case 'bullet_list':
      return renderBulletList(data);
    case 'severity_tagged':
      return renderSeverityTagged(data, config);
    case 'numbered_list':
      return renderNumberedList(data, config);
    case 'key_value':
      return renderKeyValue(data);
    case 'data_classification':
      return renderDataClassification(data);
    case 'static':
      return renderStatic(group);
    default:
      return renderBulletList(data);
  }
}

// - {rule} [{id}]
function renderBulletList(data) {
  return data.map(item => `- ${item.rule} [${item.id}]`);
}

// - {rule} (block/warn) [{id}]
function renderSeverityTagged(data, config) {
  return data.map(item => {
    const label = config.severity_labels?.[item.severity] ?? `(${item.severity})`;
    const idFmt = config.id_format?.replace('{id}', item.id) ?? `[${item.id}]`;
    return `- ${item.rule} ${label} ${idFmt}`;
  });
}

// 1. {rule} [{id}]
function renderNumberedList(data, config) {
  return data.map((item, idx) => {
    const idFmt = config.id_format?.replace('{id}', item.id) ?? `[${item.id}]`;
    return `${idx + 1}. ${item.rule} ${idFmt}`;
  });
}

// - {key}: {subfield.description}
// For objects like severity_levels: { block: { description, action }, warn: { ... } }
function renderKeyValue(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value.description) {
      lines.push(`- ${key}: ${value.description}`);
    } else if (typeof value === 'string') {
      lines.push(`- ${key}: ${value}`);
    }
  }
  return lines;
}

// data_classification: levels array with name, description, rules
function renderDataClassification(data) {
  if (!data.levels) return ['_(no levels defined)_'];
  return data.levels.map(level => {
    let line = `- ${level.name}: ${level.description}`;
    if (level.rules && level.rules.length > 0) {
      line += ` → ${level.rules.join(', ')}`;
    }
    return line;
  });
}

// static: raw content from group.content
function renderStatic(group) {
  if (!group.content) return [];
  return group.content.trim().split('\n');
}
```

Update the export:

```javascript
export { loadOrgYaml, resolvePath, applyFilter, renderGroup, orgRoot, YAML };
```

- [ ] **Step 3: Verify script still loads**

Run: `node -e "import('./org/scripts/render-context.mjs').then(() => console.log('OK'))"` (from project root)

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add org/scripts/render-context.mjs
git commit -m "feat(scripts): add applyFilter and format renderers"
```

---

### Task 4: Add CLI and main rendering pipeline

**Files:**
- Modify: `org/scripts/render-context.mjs`

- [ ] **Step 1: Add `parseArgs`, `collectGroups`, `renderAll`, and `main`**

Append to `render-context.mjs`:

```javascript
// ── CLI Argument Parsing ──
function parseArgs(argv) {
  const args = { phase: null, subPhase: null, all: false, output: null, check: false };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--phase':       args.phase = argv[++i]; break;
      case '--sub-phase':   args.subPhase = argv[++i]; break;
      case '--all':         args.all = true; break;
      case '--output':      args.output = argv[++i]; break;
      case '--check':       args.check = true; break;
      case '--help':        args.help = true; break;
    }
  }
  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/render-context.mjs [options]

Options:
  --phase <phase>          Phase to render: propose | continue | apply | verify
  --sub-phase <sub>        Sub-phase for continue: specs | design | tasks
  --all                    Render all phases concatenated
  --output <file>          Write output to file instead of stdout
  --check                  Compare rendered output against --output file (CI mode)
  --help                   Show this help

Examples:
  node scripts/render-context.mjs --phase propose
  node scripts/render-context.mjs --phase continue --sub-phase specs
  node scripts/render-context.mjs --all --output rendered-context.md
  node scripts/render-context.mjs --check --output rendered-context.md
`);
}

// ── Group Collection ──
function collectGroups(org, args) {
  const config = org.context_rendering;
  if (!config) {
    console.error('Error: context_rendering not found in org.yaml');
    process.exit(1);
  }

  const groups = [...(config.common_groups || [])];

  if (args.all) {
    // Collect all phase groups
    for (const [, phaseConfig] of Object.entries(config.phases || {})) {
      if (phaseConfig.groups) {
        groups.push(...phaseConfig.groups);
      }
      if (phaseConfig.sub_phases) {
        for (const [, subConfig] of Object.entries(phaseConfig.sub_phases)) {
          groups.push(...(subConfig.groups || []));
        }
      }
    }
  } else if (args.phase) {
    const phaseConfig = config.phases?.[args.phase];
    if (!phaseConfig) {
      console.error(`Error: phase '${args.phase}' not found. Available: ${Object.keys(config.phases || {}).join(', ')}`);
      process.exit(1);
    }

    if (args.subPhase) {
      const subConfig = phaseConfig.sub_phases?.[args.subPhase];
      if (!subConfig) {
        console.error(`Error: sub-phase '${args.subPhase}' not found. Available: ${Object.keys(phaseConfig.sub_phases || {}).join(', ')}`);
        process.exit(1);
      }
      groups.push(...(subConfig.groups || []));
    } else if (phaseConfig.sub_phases && !args.subPhase) {
      // continue without sub-phase: include all sub-phase groups
      for (const [, subConfig] of Object.entries(phaseConfig.sub_phases)) {
        groups.push(...(subConfig.groups || []));
      }
    } else {
      groups.push(...(phaseConfig.groups || []));
    }
  }

  return { groups, config };
}

// ── Main Render Pipeline ──
function renderAll(org, groups, config) {
  const lines = [];

  for (const group of groups) {
    // Resolve data from source path
    const data = resolvePath(org, group.source);

    // Apply filter if present
    const filtered = group.filter ? applyFilter(data, group.filter) : data;

    // Render the group
    lines.push(`## ${group.title}`);
    const rendered = renderGroup(filtered, group, config);
    lines.push(...rendered);
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

// ── Main Entry Point ──
function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.phase && !args.all) {
    printUsage();
    console.error('Error: specify --phase or --all');
    process.exit(1);
  }

  const org = loadOrgYaml();
  const { groups, config } = collectGroups(org, args);
  const output = renderAll(org, groups, config);

  if (args.check) {
    // CI check mode: compare rendered output against file
    const checkFile = args.output;
    if (!checkFile) {
      console.error('Error: --check requires --output to specify the file to check against');
      process.exit(1);
    }
    const existing = existsSync(checkFile) ? readFileSync(checkFile, 'utf-8') : '';
    if (existing === output) {
      console.log('✓ Rendered output matches file. All good.');
      process.exit(0);
    } else {
      console.error('✗ Rendered output differs from file. Run without --check to regenerate.');
      process.exit(1);
    }
  } else if (args.output) {
    writeFileSync(args.output, output, 'utf-8');
    console.log(`Written to ${args.output}`);
  } else {
    process.stdout.write(output);
  }
}

main();
```

- [ ] **Step 2: Test --help**

Run: `node org/scripts/render-context.mjs --help`

Expected: Usage text printed, exit code 0.

- [ ] **Step 3: Test --phase propose renders without error**

Run: `node org/scripts/render-context.mjs --phase propose`

Expected: Markdown output containing `## 治理原则`, `## AI 行为底线（proposal 相关）`, `## Proposal 规则` etc. No error messages.

- [ ] **Step 4: Commit**

```bash
git add org/scripts/render-context.mjs
git commit -m "feat(scripts): add CLI, group collection, and main rendering pipeline"
```

---

### Task 5: Test all phases and validate output

**Files:**
- No new files

- [ ] **Step 1: Test propose phase**

Run: `node org/scripts/render-context.mjs --phase propose > /tmp/propose.md`

Verify the output contains:
- `## 治理原则` with bullet list
- `## 严重级别` with block/warn descriptions
- `## 数据分级` with public/internal/sensitive/secret
- `## AI 行为底线（proposal 相关）` with AI-001 and AI-003 only
- `## Proposal 规则` with ORG-P-001 through ORG-P-006
- `## 语言规范` with LANG-001/002/003
- `## 命名规范` with NAM-001/002/003
- `## 依赖管理` with DEP-001/002/003

Count total rules: should be ~25, NOT ~150.

- [ ] **Step 2: Test continue --sub-phase design**

Run: `node org/scripts/render-context.mjs --phase continue --sub-phase design`

Verify: contains `## AI 行为底线` (ALL ai_behavior rules), `## Design 规则`, `## 数据库安全底线`, `## 依赖管理`.

- [ ] **Step 3: Test apply phase**

Run: `node org/scripts/render-context.mjs --phase apply`

Verify: contains `## 安全红线（不可违反）` as numbered list (1. 2. 3. ...), `## 代码质量`, `## 性能底线`, `## 可观测性`, `## DDL/DML 目录约定`.

- [ ] **Step 4: Test verify phase**

Run: `node org/scripts/render-context.mjs --phase verify`

Verify: contains only AI-009, CQ-003/004/006, CR-001/002/003. Should be ~15 rules total.

- [ ] **Step 5: Test --all mode**

Run: `node org/scripts/render-context.mjs --all --output org/rendered-context.md`

Verify: `org/rendered-context.md` is created with all phases concatenated. Should be comparable in scope to the old `context_injection`.

- [ ] **Step 6: Test --check mode**

Run: `node org/scripts/render-context.mjs --all --output org/rendered-context.md --check`

Expected: `✓ Rendered output matches file. All good.`

Then modify `org/rendered-context.md` slightly (add a space) and re-run --check:

Expected: `✗ Rendered output differs from file.`

Then revert the modification.

---

### Task 6: Delete `context_injection` from `org.yaml`

**Files:**
- Modify: `org/org.yaml`

- [ ] **Step 1: Delete the `context_injection` section**

Delete the following from `org.yaml`:
- Lines 147-153: The comment block starting with `# ── context_injection` through `# 不以手工方式独立维护。`
- Lines 154-301: The `context_injection: |` block and all its markdown content
- The empty lines immediately after

The section to delete starts with:
```
# ───────────────────────────────────────────────────────────────
# context_injection: 精简版治理约束
```
and ends with the last line of the markdown content before the next major section comment block:
```
# ═══════════════════════════════════════════════════════════════
# 以下为结构化规则索引（带 ID，供 skill 提取和追溯）
```

Keep the structural comment block for the structured rules section (the `═══` line above).

- [ ] **Step 2: Verify YAML is still valid**

Run: `node -e "const YAML=require('./.opencode/node_modules/yaml'); const d=YAML.parse(require('fs').readFileSync('org.yaml','utf-8')); console.log('YAML valid'); console.log('context_injection present:', !!d.context_injection); console.log('context_rendering present:', !!d.context_rendering);"` (from `org/` directory)

Expected:
```
YAML valid
context_injection present: false
context_rendering present: true
```

- [ ] **Step 3: Re-run the rendering script to confirm it still works**

Run: `node org/scripts/render-context.mjs --phase propose`

Expected: Same valid output as Task 5.

- [ ] **Step 4: Commit**

```bash
git add org/org.yaml
git commit -m "refactor(org): remove redundant context_injection, replaced by context_rendering + script"
```

---

### Task 7: Final verification and cleanup

**Files:**
- Potentially: `org/rendered-context.md`

- [ ] **Step 1: Generate full reference output**

Run: `node org/scripts/render-context.mjs --all --output org/rendered-context.md`

- [ ] **Step 2: Verify each phase individually produces valid markdown**

Run all phases in sequence and confirm no errors:

```bash
for phase in propose apply verify; do
  echo "=== $phase ==="
  node org/scripts/render-context.mjs --phase $phase | head -3
done

for sub in specs design tasks; do
  echo "=== continue/$sub ==="
  node org/scripts/render-context.mjs --phase continue --sub-phase $sub | head -3
done
```

Expected: Each phase outputs `## 治理原则` as the first section (from common_groups), followed by its phase-specific rules. No errors.

- [ ] **Step 3: Decide whether to commit `rendered-context.md`**

If the team wants a human-readable reference file committed to git:
```bash
git add org/rendered-context.md
git commit -m "docs(org): add rendered-context.md (auto-generated from structured rules)"
```

If not (prefer to generate on demand), add to `.gitignore`:
```bash
echo "rendered-context.md" >> org/.gitignore
git add org/.gitignore
git commit -m "chore: ignore auto-generated rendered-context.md"
```

- [ ] **Step 4: Final commit — bump version**

Update the version in `org.yaml` header:
```yaml
version: "3.2"  # was "3.1"
updated_at: "2026-06-12"
```

```bash
git add org/org.yaml
git commit -m "chore(org): bump version to 3.2 — context_injection replaced by context_rendering"
```
