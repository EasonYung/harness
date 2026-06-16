# 技术栈治理目录化重构设计：stacks/ 拆分 + 多文件按需拉取

> 版本：1.0
> 日期：2026-06-16
> 状态：已批准
> 关联文件：org/org.yaml、org/stacks/\*.yaml、OpenSpec/src/core/org-integration.ts、OpenSpec/src/commands/stacks.ts、OpenSpec/test/core/stack-governance.test.ts、OpenSpec/test/commands/stacks.test.ts、OpenSpec/docs/harness-integration-guide.md
> 前置：[2026-06-12-context-rendering-design.md](./2026-06-12-context-rendering-design.md)（Layer-1 按阶段渲染）、Layer-2 技术栈治理（`injectStackContext` 已落地并 17/17 测试通过）

---

## 一、问题

Layer-2 技术栈治理目前把所有栈的**渲染配置**与**规则数据**都塞在单个 `org.yaml` 里：

- `context_rendering.stacks`（org.yaml L262–284）：每个栈的渲染配置（`common_groups` / `phases`）。
- 顶层 `stack_rules`（org.yaml L290–300）：每个栈的规则数据数组（TS-001、VUE-001…）。

随着支持的栈增多（typescript / vue / react / go / python …），单文件膨胀、栈之间相互干扰、规则归属不清。需要把每个栈拆成独立文件 `stacks/<id>.yaml`，便于独立维护、review 与扩展。

这是**源端 + 代码端**双侧改动：

- **源端**：把上述两节从 `org.yaml` 搬到 `stacks/<id>.yaml`。
- **代码端**：`org-integration.ts` 当前只拉取**单个** org.yaml，`injectStackContext` 从同一个对象读 `context_rendering.stacks` 与 `stack_rules`；需扩展为**按栈拉取多个文件并渲染**。

### 已确认的关键决策（brainstorm 已定）

1. **干净切换（clean cutover）**：栈内容从 org.yaml 整体迁出，代码只读 `stacks/` 目录；同步更新 org.yaml 与测试。不做双模兼容（私有 fork，源码自持，无外部消费内联格式）。
2. **约定 + 容错拉取（convention + tolerant 404）**：按已声明/探测到的栈逐个拉取 `stacks/<id>.yaml`，404/缺失即跳过该栈；本地（`OPENSPEC_ORG_ROOT`）用免费的 `readdir`。并引入**单次调用内缓存**，使 org.yaml + 各栈文件在一次命令内只拉取一次（顺带修掉当前 `injectGovernance` 重复拉取 org.yaml 的浪费）。

## 二、方案概览

```
org 仓库
├── org.yaml                         # 仅保留 Layer-1（org 级）规则 + common_groups/phases
│                                    #   删除 context_rendering.stacks + 顶层 stack_rules
└── stacks/                          # 新增：每栈一个自包含文件
    ├── typescript.yaml              #   { id, label, rules[], rendering{common_groups,phases} }
    └── vue.yaml

OpenSpec fork（代码）
├── src/core/org-integration.ts
│   ├── fetchOrgRelative(dir, relPath, {tolerant?})   # 新：统一拉取任意相对路径（3 优先级链）
│   ├── FetchCache {org?, stacks:Map}                 # 新：单次调用内缓存
│   ├── injectOrgContext / injectStackContext          # 改：接收/创建 cache，避免重复拉取
│   └── buildFetchTarget(repo, ref, subPath, relPath)  # 改：relPath 默认 'org.yaml'，支持 'stacks/<id>.yaml'
├── src/commands/stacks.ts           # 改：缺失栈文件的错误文案 + 注释
└── test/core/stack-governance.test.ts, test/commands/stacks.test.ts
                                     # 改：ORG_YAML 去 stacks，beforeEach 写 stacks/*.yaml；新增多栈/容错/缓存用例
```

### 核心原则

- **渲染管线零改动**：`renderAll` / `renderGroupsAsRules` / `applyFilter` / `getArtifactIdForPhase` 的签名已是 `(dataObject, groups, config)`；栈拆分后只需把「数据对象」换成栈文件对象、把「config」换成 org 的 `renderingConfig`（提供 `severity_labels`/`id_format`）。
- **栈文件自包含**：每个 `stacks/<id>.yaml` 自带 `rules`（数据）+ `rendering`（渲染组），`source` 相对**本文件**解析（如 `source: "rules"`）。
- **severity_labels / id_format 仍由 org.yaml 提供**：栈文件继承，不重复定义，保持当前渲染行为不变。

## 三、具体变更

### 3.1 源端：org 仓库

#### 3.1.1 新建 `stacks/typescript.yaml`（自包含示例）

```yaml
# stacks/typescript.yaml
id: typescript
label: TypeScript
rules:
  - { id: TS-001, rule: "禁止使用 any；确需宽松类型时用 unknown 并注释原因", severity: warn, enforcement: lintable }
  - { id: TS-002, rule: "公共 API 与导出函数必须显式标注返回类型", severity: warn, enforcement: lintable }
  - { id: TS-003, rule: "优先用 type 定义联合/工具类型，用 interface 描述可被实现的对象形状", severity: warn, enforcement: prompt-only }
  - { id: TS-T-001, rule: "任务拆分须对齐到单一模块/类型边界，单任务不跨层", severity: warn, enforcement: prompt-only }
rendering:
  common_groups:
    - title: "TypeScript 约束"
      source: "rules"                # 相对本文件解析（原为 stack_rules.typescript）
      filter: { exclude_prefix: "TS-T-" }
      format: "severity_tagged"
  phases:
    tasks:
      groups:
        - title: "TypeScript 任务约束"
          source: "rules"
          filter: { id_prefix: "TS-T-" }
          format: "severity_tagged"
```

`stacks/vue.yaml` 同构（`rules` 含 VUE-001/002/003 + `rendering.common_groups`，无 `phases`）。

> 关键映射：旧 `source: "stack_rules.typescript"`（解析对象=org）→ 新 `source: "rules"`（解析对象=栈文件本身）。

#### 3.1.2 `org.yaml` 删除

- 删除 `context_rendering.stacks`（L262–284）。
- 删除顶层 `stack_rules`（L290–300）。
- 其余全部保留（Layer-1 规则、`common_groups`、`phases`、`severity_labels`、`id_format`、`meta`、`data_classification` 等）。
- 可在 `context_rendering` 末尾加一行注释指向 `stacks/` 目录。

### 3.2 代码端：`src/core/org-integration.ts`

#### 3.2.1 类型调整

```ts
interface StackFile {
  id?: string;
  label?: string;
  rules?: unknown[];                  // 原 stack_rules.<id>
  rendering?: StackRenderingConfig;   // 原 context_rendering.stacks.<id>：{ common_groups?, phases? }
}
```

`RenderingConfig.stacks` 字段删除（不再从 org 读栈渲染配置）。

#### 3.2.2 拉取层泛化：`fetchOrgRelative`

统一按相对路径拉取，复用现有 3 优先级链：

```ts
async function fetchOrgRelative(
  projectDir: string,
  relPath: string,
  opts?: { tolerant?: boolean }
): Promise<unknown | null> {
  // P1: OPENSPEC_ORG_ROOT（本地文件）
  const envRoot = process.env.OPENSPEC_ORG_ROOT;
  if (envRoot) {
    const p = path.join(path.resolve(envRoot), relPath);
    if (existsSync(p)) return parseYaml(readFileSync(p, 'utf-8'));
    if (!opts?.tolerant) console.warn(chalk.dim(`  ${relPath} not found at ${p}`));
    return null;
  }
  // 无 harness 配置 → 跳过
  const harnessConfig = readHarnessConfig(projectDir);
  if (!harnessConfig) return null;
  // P2: harness.url（替换文件名派生栈 URL）
  if (harnessConfig.url) {
    const url = deriveRelativeUrl(harnessConfig.url, relPath);
    return await fetchFromUrl(url);            // 失败（含 404）返回 null
  }
  // P3: harness.repo + ref + path
  if (harnessConfig.repo) {
    const target = buildFetchTarget(
      harnessConfig.repo, harnessConfig.ref ?? 'main', harnessConfig.path ?? '', relPath
    );
    if (target) return await fetchFromTarget(target);  // 404 返回 null
  }
  return null;
}
```

- `fetchOrgData(projectDir)` 收敛为 `fetchOrgRelative(projectDir, 'org.yaml')`（保留 org.yaml 缺失时的 warn 行为）。
- `fetchStackFile(projectDir, sid)` = `fetchOrgRelative(projectDir, 'stacks/${sid}.yaml', { tolerant: true }) as StackFile | null`。

#### 3.2.3 `buildFetchTarget` 泛化

签名增加 `relPath`（默认 `'org.yaml'`）：

```ts
function buildFetchTarget(repo: string, ref: string, subPath: string, relPath = 'org.yaml'): FetchTarget | null
```

GitHub：`contents/{subPath?}/{relPath}?ref={ref}`；GitLab：`-/raw/{ref}/{subPath?}/{relPath}`。

- org.yaml + subPath=`org` → `org/org.yaml`
- `stacks/typescript.yaml` + subPath=`org` → `org/stacks/typescript.yaml`

#### 3.2.4 `harness.url` 派生：`deriveRelativeUrl`

把 org.yaml 的 raw URL 替换为任意 relPath，保留 query：

```ts
function deriveRelativeUrl(orgUrl: string, relPath: string): string {
  const [pathPart, query = ''] = orgUrl.split('?');
  const segs = pathPart.split('/');
  segs[segs.length - 1] = relPath;   // 替换最后一段（org.yaml → stacks/typescript.yaml）
  return query ? `${segs.join('/')}?${query}` : segs.join('/');
}
```

> 约定：`harness.url` 视为指向 org.yaml 的 raw 文件 URL；非文件型 URL 不保证栈派生成功，失败即容错跳过（不影响 org.yaml 注入）。

#### 3.2.5 单次调用内缓存：`FetchCache`

```ts
interface FetchCache {
  org?: unknown;                         // 已解析的 org.yaml
  stacks: Map<string, StackFile | null>; // stackId → 文件（null=确认缺失）
}

async function getOrgData(projectDir, cache): Promise<unknown | null> { /* 缓存命中直返 */ }
async function getStackFile(projectDir, sid, cache): Promise<StackFile | null> { /* 缓存命中直返 */ }
```

- `injectGovernance` 创建一个 `cache` 并传入 `injectOrgContext` + `injectStackContext`，使 org.yaml 一次命令只拉取 **1 次**（当前是 2 次：两个子函数各 `fetchOrgData` 一次）。
- 独立入口（`init.ts` 调 `injectOrgContext`、`stacks.ts` 调 `injectStackContext`）通过可选 `cache` 参数自建（默认新建空 cache），保持既有签名兼容。

#### 3.2.6 `injectStackContext` 重写要点

- 移除 `renderingConfig.stacks` / `stacksConfig` 读取与 `no_stack_rendering_config` 分支。
- 用 `getOrgData` 拿 org（取 `severity_labels`/`id_format` 用的 `renderingConfig`）。
- 对每个 declared stack：`getStackFile(sid, cache)` → 无文件则 `continue`（容错跳过，可加 dim 提示）；有文件则：
  - `renderAll(stackFile, sc.common_groups, renderingConfig)` 追加进 context（`source` 相对 `stackFile`）。
  - `renderGroupsAsRules(stackFile, groups, renderingConfig)` 追加进 `rules[aid]`（同上）。
- 去重 / 幂等 / artifactId 作用域逻辑不变（`seedSeenKeys` / `appendDedup` / `tryAppendRules` 全部复用）。
- 新 reason：所有 declared 栈都无文件 → `{ injected: false, reason: 'no_stack_files' }`。

#### 3.2.7 `stacks.ts` / `cli/index.ts` 文案

- `stacks.ts` L4–5 注释、L129 错误文案；`cli/index.ts:581` 命令描述：把「from org.yaml / context_rendering.stacks」改为「from `stacks/<id>.yaml`」。

### 3.3 测试变更（cutover，两文件迁目录布局）

`ORG_YAML` 去掉 `stacks:` + `stack_rules:`；`beforeEach` 额外 `writeFileSync('<orgRoot>/stacks/typescript.yaml', ...)`。既有断言不变（TS-001 入 context、TS-T-001 入 tasks、幂等、作用域、`no_stacks`、持久化等）。

新增用例：

- **多栈**：`stacks/{typescript,vue}.yaml` 同时存在 → 两者规则都被注入。
- **容错跳过**：声明含一个无文件的栈（如 `react`）→ 该栈跳过、无报错，其余栈仍注入。
- **缓存**：`vi.spyOn(fs, 'readFileSync')` 计数，`injectGovernance` 一次调用中 org.yaml 只读 1 次（验证修复了重复拉取）。
- 用 `no_stack_files` 替换旧 `no_stack_rendering_config` 用例。

### 3.4 文档变更

`docs/harness-integration-guide.md`「技术栈治理（Layer 2）」段：把「从 org.yaml 拉取对应规则」改为「按探测栈从 `stacks/<id>.yaml` 拉取」；补充 `stacks/` 目录布局说明。

### 3.5 不变项

`stack-detection.ts`（仅注释更新）、`init.ts`、`update.ts`、`instructions.ts`、`render-context.mjs`（仅 org 级渲染，栈是项目相关、不入 repo 级 `rendered-context.md`），以及全部渲染管线纯函数。

## 四、拉取策略与速率限制

GitHub Contents API 未授权 60/小时/IP。一次 `injectGovernance` 的拉取数对比：

| | 当前 | 重构后 |
|---|---|---|
| org.yaml | 2 次（injectOrg + injectStack 各一次） | **1 次**（缓存） |
| stacks | 0（内联在 org） | N（N=已声明栈数，通常 2–4） |
| 单命令合计 | 2 | 1 + N |

结论：即使栈拆成多文件，引入缓存后单命令调用数 ≤ 今天（N 通常 ≤ 2，被 org.yaml 由 2→1 抵消）。404/缺失计入请求数但栈数受探测约束、有上界。`harness.url` 派生与 `harness.repo` 路径同上述优先级。

## 五、文件清单

**org 仓库（`D:\work\harness\org`）**

- 新增：`stacks/typescript.yaml`、`stacks/vue.yaml`
- 修改：`org.yaml`（删 `context_rendering.stacks` + `stack_rules`）
- 新增：本设计文档 `docs/superpowers/specs/2026-06-16-stacks-directory-design.md`

**OpenSpec fork（`D:\work\harness\OpenSpec`）**

- 修改：`src/core/org-integration.ts`、`src/commands/stacks.ts`、`src/cli/index.ts`（描述串）
- 修改：`test/core/stack-governance.test.ts`、`test/commands/stacks.test.ts`
- 修改：`docs/harness-integration-guide.md`

## 六、向后兼容 / 安全 / 推送前检查

- **干净切换，无双模**：不做内联回退。org.yaml、代码、测试一次性迁移。
- **SEC 扫描**：`stacks/*.yaml` 推送至公开 `EasonYung/harness.git` 前，按 org.yaml 同等标准 SEC 扫描（仅规则文本，无真实密钥；`SEC-*` / `NG-*` 不可豁免）。
- **网络**：`api.github.com` 走代理（CN）；`raw.githubusercontent.com` 被墙——沿用 `harness.repo` 的 Contents API 路径。

## 七、验证计划

1. `cd D:/work/harness/OpenSpec && node build.js` 构建通过。
2. `node_modules/.bin/vitest run test/core/stack-governance.test.ts test/commands/stacks.test.ts` 全绿。
3. E2E（本地，`OPENSPEC_ORG_ROOT=D:/work/harness/org`）：
   - vue+ts demo 项目：`stacks set --stacks typescript,vue` → config.yaml 的 context 含 TS-001+VUE-001，`rules.tasks` 含 TS-T-001，且 org 级规则（ORG-T-\* 等）共存不丢。
   - `openspec instructions tasks --json` 的 `.rules` 含 TS-T-001。
   - 重复运行幂等（无重复行）。
4. 远程 E2E（`OPENSPEC_ORG_ROOT` 不设，`harness.repo`+`ref=master`）：先 push org 仓库改动（含 `stacks/`），再 `update --force`，校验 config.yaml 规则与推送的 org.yaml + stacks/ 一致。

## 八、遗留项

- `stacks show` 暂不利用本地 `readdir(stacks/)` 列出可用栈（YAGNI，`ALL_STACK_IDS` 仍是校验全集）；未来可增强为「仅展示有文件的栈」。
- 若日后栈数显著增多导致 60/h 紧张，可考虑 GitHub Trees API 单次取整树或 `GITHUB_TOKEN` 鉴权（提升至 5000/h）。
