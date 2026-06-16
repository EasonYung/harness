# 技术栈治理目录化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把技术栈治理从单个 `org.yaml`（`context_rendering.stacks` + `stack_rules`）拆到 `stacks/<id>.yaml` 自包含文件，并改造 `org-integration.ts` 为多文件按需拉取 + 单次调用内缓存。

**Architecture:** 源端（org 仓库）每栈一个 `stacks/<id>.yaml`（自带 `rules` + `rendering`，`source` 相对本文件解析）；代码端新增 `fetchOrgRelative(dir, relPath)` 统一 3 优先级拉取链 + `FetchCache` 单次调用内缓存，`injectStackContext` 改为逐栈 `getStackFile` 后用既有渲染管线渲染（数据对象=栈文件，config=org `renderingConfig`）。干净切换、约定+容错拉取。渲染管线纯函数零改动。

**Tech Stack:** TypeScript（ESM, NodeNext）、vitest、`yaml` 包、Commander.js。两仓库：源端 `D:\work\harness\org`（git master），代码 `D:\work\harness\OpenSpec`（工作副本，未提交）。

**Spec:** `docs/superpowers/specs/2026-06-16-stacks-directory-design.md`

---

## 全局约定（每个任务遵循）

- **构建（fork）：** `cd D:/work/harness/OpenSpec && node build.js`
- **单测（fork）：** `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run <file>`（pnpm 不在 PATH）
- **提交信息：** conventional commits，末尾追加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **代码仓库提交**（Task 1–7、9）在 `D:/work/harness/OpenSpec`；**源端提交**（Task 8）在 `D:/work/harness/org`。
- ESM：所有相对 import 用 `.js` 扩展名。
- Task 1 的迁移测试在 Task 4 完成前保持 RED（正常 TDD 中间态）。

---

## Task 1: 迁移 stack-governance.test.ts 到目录布局（RED）

建立新契约的失败测试：org.yaml 不再含 stacks，栈内容来自 `stacks/<id>.yaml`。

**Files:**
- Modify: `D:/work/harness/OpenSpec/test/core/stack-governance.test.ts`

- [ ] **Step 1: 替换 `ORG_YAML` 常量（删除 `stacks:` + `stack_rules:`）**

把第 69–93 行的 `ORG_YAML` 整体替换为（仅保留 org 级 rendering 配置，无 stacks）：

```ts
  const ORG_YAML = `version: "test"
context_rendering:
  severity_labels:
    warn: "(warn)"
    block: "(block)"
  id_format: "[{id}]"
`;
```

- [ ] **Step 2: beforeEach 写入 `stacks/typescript.yaml` fixture**

在 `beforeEach`（第 99–118 行）中，`writeFileSync(path.join(orgRoot, 'org.yaml'), ORG_YAML);` 之后新增：

```ts
    // Layer-2 stacks now live as self-contained files under stacks/.
    mkdirSync(path.join(orgRoot, 'stacks'), { recursive: true });
    writeFileSync(
      path.join(orgRoot, 'stacks', 'typescript.yaml'),
      `id: typescript
rules:
  - { id: TS-001, rule: "no any", severity: warn, enforcement: lintable }
  - { id: TS-T-001, rule: "task boundary", severity: warn, enforcement: prompt-only }
rendering:
  common_groups:
    - title: "TypeScript 约束"
      source: "rules"
      filter: { exclude_prefix: "TS-T-" }
      format: "severity_tagged"
  phases:
    tasks:
      groups:
        - title: "TypeScript 任务约束"
          source: "rules"
          filter: { id_prefix: "TS-T-" }
          format: "severity_tagged"
`
    );
```

（`mkdirSync` 已在文件顶部 import：第 2 行 `import { existsSync, mkdirSync, writeFileSync, ... }`。）

- [ ] **Step 3: 把 `no_stack_rendering_config` 用例替换为 `no_stack_files`**

删除第 209–217 行的 `it('returns no_stack_rendering_config ...')` 整块，替换为：

```ts
  it('returns no_stack_files when a declared stack has no stacks/<id>.yaml', async () => {
    // typescript declared but no stacks/typescript.yaml present in orgRoot.
    const res = await injectStackContext(projectDir, { stacks: ['react'] });
    expect(res.injected).toBe(false);
    expect(res.reason).toBe('no_stack_files');
    // pre-existing rules untouched
    const cfg = readConfig();
    expect((cfg.context as string)).toContain('ORG-P-001');
  });
```

- [ ] **Step 4: 运行测试，确认 RED**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/stack-governance.test.ts`
Expected: FAIL。原因：当前 `injectStackContext` 读 `context_rendering.stacks`（已从 fixture 移除），返回 `no_stack_rendering_config`；且 `no_stack_files` reason 尚不存在。多数用例失败。这是预期的 RED 态。

- [ ] **Step 5: 提交（RED 测试入栈）**

```bash
cd D:/work/harness/OpenSpec
git add test/core/stack-governance.test.ts
git commit -m "test(stacks): migrate stack-governance fixtures to stacks/ dir layout (RED)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 泛化 buildFetchTarget（relPath 参数）+ 单元测试

把硬编码的 `org.yaml` 改为可注入 `relPath`，默认 `org.yaml`，支持 `stacks/<id>.yaml`。导出以便单测。

**Files:**
- Modify: `D:/work/harness/OpenSpec/src/core/org-integration.ts`（`buildFetchTarget`，约 L168–195）
- Test: `D:/work/harness/OpenSpec/test/core/org-integration-units.test.ts`（新建）

- [ ] **Step 1: 写失败的单测（新建文件）**

```ts
// test/core/org-integration-units.test.ts
import { describe, it, expect } from 'vitest';
import { buildFetchTarget } from '../../src/core/org-integration.js';

describe('buildFetchTarget', () => {
  it('builds the GitHub Contents API URL for org.yaml by default', () => {
    const t = buildFetchTarget('https://github.com/EasonYung/harness.git', 'master', '');
    expect(t?.url).toBe(
      'https://api.github.com/repos/EasonYung/harness/contents/org.yaml?ref=master'
    );
    expect(t?.headers?.['Accept']).toBe('application/vnd.github.v3.raw');
  });

  it('builds a stacks/<id>.yaml URL when relPath is given (with subPath)', () => {
    const t = buildFetchTarget(
      'https://github.com/EasonYung/harness.git',
      'master',
      'org',
      'stacks/typescript.yaml'
    );
    expect(t?.url).toBe(
      'https://api.github.com/repos/EasonYung/harness/contents/org/stacks/typescript.yaml?ref=master'
    );
  });

  it('builds a GitLab raw URL for a stack file', () => {
    const t = buildFetchTarget(
      'https://gitlab.com/group/repo.git',
      'main',
      '',
      'stacks/vue.yaml'
    );
    expect(t?.url).toBe('https://gitlab.com/group/repo/-/raw/main/stacks/vue.yaml');
  });

  it('returns null for unsupported hosts', () => {
    expect(buildFetchTarget('https://bitbucket.org/x/y', 'main', '')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行，确认 RED（导出不存在 / 签名不匹配）**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/org-integration-units.test.ts`
Expected: FAIL（`buildFetchTarget` 未导出；或 relPath 调用产出错误 URL）。

- [ ] **Step 3: 泛化 buildFetchTarget 并导出**

把 `org-integration.ts` 的 `buildFetchTarget`（L168–195）整体替换为：

```ts
/**
 * Construct a fetch target for any file path within a git repo.
 *
 * GitHub uses the Contents API (raw.githubusercontent.com is blocked in some regions):
 *   https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}
 *   with Accept: application/vnd.github.v3.raw
 *
 * GitLab uses the raw blob endpoint:
 *   https://gitlab.com/{owner}/{repo}/-/raw/{branch}/{path}
 *
 * `relPath` is the file path relative to the repo/subPath root (default 'org.yaml').
 */
export function buildFetchTarget(
  repo: string,
  ref: string,
  subPath: string,
  relPath = 'org.yaml'
): FetchTarget | null {
  // Strip trailing .git
  const cleanRepo = repo.replace(/\.git$/, '');

  const filePath = subPath ? `${subPath}/${relPath}` : relPath;

  // GitHub — use Contents API for better accessibility
  const githubMatch = cleanRepo.match(/^https?:\/\/github\.com\/(.+\/.+)$/);
  if (githubMatch) {
    const repoPath = githubMatch[1];
    return {
      url: `https://api.github.com/repos/${repoPath}/contents/${filePath}?ref=${ref}`,
      headers: { Accept: 'application/vnd.github.v3.raw' },
    };
  }

  // GitLab — use raw blob endpoint
  const gitlabMatch = cleanRepo.match(/^https?:\/\/gitlab\.com\/(.+\/.+)$/);
  if (gitlabMatch) {
    const repoPath = gitlabMatch[1];
    return {
      url: `https://gitlab.com/${repoPath}/-/raw/${ref}/${filePath}`,
    };
  }

  console.warn(
    chalk.dim(
      `  Unsupported git hosting URL: ${repo}. Use harness.url to specify the raw URL directly.`
    )
  );
  return null;
}
```

- [ ] **Step 4: 运行，确认 GREEN**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/org-integration-units.test.ts`
Expected: PASS（4/4）。构建不破坏既有调用（`fetchOrgData` 仍传 3 参数，relPath 取默认 `org.yaml`，URL 不变）。

- [ ] **Step 5: 提交**

```bash
cd D:/work/harness/OpenSpec
git add src/core/org-integration.ts test/core/org-integration-units.test.ts
git commit -m "refactor(org-integration): generalize buildFetchTarget to accept relPath

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 新增 deriveRelativeUrl + fetchOrgRelative + FetchCache + getOrgData/getStackFile；fetchOrgData 委托

建立多文件拉取与缓存基础设施。本任务不触碰 `injectStackContext`（其仍用旧 `fetchOrgData`），故 stack-governance 仍 RED，但新单测 GREEN、org 注入行为不变。

**Files:**
- Modify: `D:/work/harness/OpenSpec/src/core/org-integration.ts`
- Test: `D:/work/harness/OpenSpec/test/core/org-integration-units.test.ts`

- [ ] **Step 1: 写 deriveRelativeUrl 的失败单测**

在 `test/core/org-integration-units.test.ts` 顶部 import 增加 `deriveRelativeUrl`：

```ts
import { buildFetchTarget, deriveRelativeUrl } from '../../src/core/org-integration.js';
```

在文件末尾追加：

```ts
describe('deriveRelativeUrl', () => {
  it('replaces the trailing filename with the relative path', () => {
    expect(deriveRelativeUrl('https://h.example/governance/org.yaml', 'stacks/typescript.yaml'))
      .toBe('https://h.example/governance/stacks/typescript.yaml');
  });

  it('preserves a query string', () => {
    expect(deriveRelativeUrl('https://h.example/org.yaml?token=x', 'stacks/vue.yaml'))
      .toBe('https://h.example/stacks/vue.yaml?token=x');
  });
});
```

- [ ] **Step 2: 运行，确认 RED**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/org-integration-units.test.ts`
Expected: FAIL（`deriveRelativeUrl` 未导出）。

- [ ] **Step 3: 实现 deriveRelativeUrl、fetchOrgRelative、FetchCache、getOrgData、getStackFile；fetchOrgData 委托**

3a. 在 `buildFetchTarget` 之后新增 `deriveRelativeUrl`（导出）：

```ts
/**
 * Derive a URL for a sibling file (e.g. stacks/<id>.yaml) from an org.yaml raw URL
 * (harness.url), by replacing the trailing path segment. Query string preserved.
 */
export function deriveRelativeUrl(orgUrl: string, relPath: string): string {
  const [pathPart, query = ''] = orgUrl.split('?');
  const segs = pathPart.split('/');
  segs[segs.length - 1] = relPath;
  return query ? `${segs.join('/')}?${query}` : segs.join('/');
}
```

3b. 把现有 `fetchOrgData`（L72–109）整体替换为「泛化的 `fetchOrgRelative` + 一行委托的 `fetchOrgData`」：

```ts
/**
 * Fetch any file (org.yaml or stacks/<id>.yaml) relative to the org root, via the
 * 3-priority chain: P1 OPENSPEC_ORG_ROOT (local) → P2 harness.url → P3 harness.repo.
 *
 * `tolerant: true` suppresses the missing-file warning and is used for stack files,
 * where absence is a normal "this stack has no rules" skip rather than an error.
 * Returns null when not found (so callers can skip), never throws on fetch failure.
 */
async function fetchOrgRelative(
  projectDir: string,
  relPath: string,
  opts?: { tolerant?: boolean }
): Promise<unknown | null> {
  // Priority 1: OPENSPEC_ORG_ROOT environment variable → local file
  const envRoot = process.env.OPENSPEC_ORG_ROOT;
  if (envRoot) {
    const filePath = path.join(path.resolve(envRoot), relPath);
    if (existsSync(filePath)) {
      return parseYaml(readFileSync(filePath, 'utf-8'));
    }
    if (!opts?.tolerant) {
      console.warn(chalk.dim(`  ${relPath} not found at ${filePath}`));
    }
    return null;
  }

  // Read harness config from openspec/config.yaml
  const harnessConfig = readHarnessConfig(projectDir);
  if (!harnessConfig) {
    return null; // No harness configuration — silent skip
  }

  // Priority 2: harness.url — derive the sibling URL by replacing the filename
  if (harnessConfig.url) {
    return await fetchFromUrl(deriveRelativeUrl(harnessConfig.url, relPath));
  }

  // Priority 3: harness.repo + ref + path → construct fetch URL
  if (harnessConfig.repo) {
    const fetchTarget = buildFetchTarget(
      harnessConfig.repo,
      harnessConfig.ref ?? 'main',
      harnessConfig.path ?? '',
      relPath
    );
    if (fetchTarget) {
      return await fetchFromTarget(fetchTarget);
    }
  }

  return null;
}

/**
 * Fetch org.yaml (retained as a thin, non-tolerant wrapper for clarity at call sites
 * that specifically want the org document).
 */
async function fetchOrgData(projectDir: string): Promise<unknown | null> {
  return fetchOrgRelative(projectDir, 'org.yaml');
}
```

> 注意：P1 缺失时的 warn 文案由旧 `"OPENSPEC_ORG_ROOT set but org.yaml not found at ..."` 改为 `"<relPath> not found at ..."`（行为一致，无测试断言该文案）。

3c. 在「Layer 2」注释段（L565–577 附近）之后、`StackRenderingConfig` 接口（L578）之前，新增缓存类型与访问器；并把 `StackFile` 接口一并定义在此处：

```ts
interface StackFile {
  id?: string;
  label?: string;
  rules?: unknown[];
  rendering?: StackRenderingConfig;
}

/**
 * Per-command-invocation fetch cache. Avoids refetching org.yaml and stack files
 * when injectOrgContext + injectStackContext run together (e.g. injectGovernance).
 * `org === undefined` means "not yet attempted"; null means "attempted, none".
 */
export interface FetchCache {
  org?: unknown;
  stacks: Map<string, StackFile | null>;
}

async function getOrgData(
  projectDir: string,
  cache: FetchCache
): Promise<unknown | null> {
  if (cache.org !== undefined) return cache.org;
  cache.org = await fetchOrgRelative(projectDir, 'org.yaml');
  return cache.org;
}

async function getStackFile(
  projectDir: string,
  stackId: string,
  cache: FetchCache
): Promise<StackFile | null> {
  if (cache.stacks.has(stackId)) return cache.stacks.get(stackId) ?? null;
  const raw = await fetchOrgRelative(projectDir, `stacks/${stackId}.yaml`, {
    tolerant: true,
  });
  const parsed = (raw ?? null) as StackFile | null;
  cache.stacks.set(stackId, parsed);
  return parsed;
}
```

- [ ] **Step 4: 运行，确认 GREEN**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/org-integration-units.test.ts`
Expected: PASS（deriveRelativeUrl + buildFetchTarget 全绿）。

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/stack-governance.test.ts`
Expected: 仍 RED（injectStackContext 未改写）—符合预期。

- [ ] **Step 5: 构建，确认编译通过**

Run: `cd D:/work/harness/OpenSpec && node build.js`
Expected: 编译成功（`fetchOrgData` 仍被 injectOrgContext/injectStackContext 调用；新代码类型正确）。

- [ ] **Step 6: 提交**

```bash
cd D:/work/harness/OpenSpec
git add src/core/org-integration.ts test/core/org-integration-units.test.ts
git commit -m "feat(org-integration): add fetchOrgRelative, FetchCache, getStackFile

Unified multi-file fetch (3-priority chain) + per-invocation cache;
fetchOrgData delegates to fetchOrgRelative. injectStackContext rewrite follows.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 改写 injectStackContext 读 stacks/*.yaml + 缓存贯通 injectOrgContext/injectGovernance（GREEN）

让 Task 1 的 RED 测试转绿：逐栈 `getStackFile`，用既有渲染管线渲染（数据对象=栈文件，config=org `renderingConfig`）。

**Files:**
- Modify: `D:/work/harness/OpenSpec/src/core/org-integration.ts`

- [ ] **Step 1: 更新类型（reason 与 options）**

把 `StackInjectResult`（L583–588）的 `reason` 字段替换为：

```ts
export interface StackInjectResult {
  injected: boolean;
  reason?:
    | 'no_config'
    | 'no_rendering_config'
    | 'no_stacks'
    | 'no_stack_files'
    | 'inject_failed';
  stacksApplied?: string[];
  artifactCounts?: Record<string, number>;
  message?: string;
}
```

把 `StackInjectOptions`（L590–595）替换为：

```ts
export interface StackInjectOptions {
  /** Scope to a single artifact id; omit to append stack rules for all artifacts. */
  artifactId?: string;
  /** Detected/confirmed stacks. Persisted to config.stacks when provided. */
  stacks?: string[];
  /** Shared fetch cache (created by injectGovernance); defaults to a fresh one. */
  cache?: FetchCache;
}
```

删除 `RenderingConfig` 接口（L52–59）中的 `stacks?` 字段（整行移除该字段，其余字段保留）：

```ts
interface RenderingConfig {
  severity_labels?: Record<string, string>;
  id_format?: string;
  common_groups?: GroupConfig[];
  phases?: Record<string, PhaseConfig>;
}
```

- [ ] **Step 2: 改写 injectOrgContext 使用 getOrgData + 可选 cache**

把 `injectOrgContext` 签名与开头（L440–450）替换为：

```ts
export async function injectOrgContext(
  projectDir: string,
  phase?: string,
  cache?: FetchCache
): Promise<OrgInjectResult> {
  const resolvedDir = path.resolve(projectDir);
  const c: FetchCache = cache ?? { org: undefined, stacks: new Map() };

  // 1. Fetch org data (cached within a single command invocation)
  const org = await getOrgData(resolvedDir, c);
  if (!org) {
    return { injected: false, reason: 'no_config' };
  }
```

（函数体其余部分不变。）

- [ ] **Step 3: 整体替换 injectStackContext 函数体（L634–774）**

用以下完整实现替换整个 `injectStackContext`：

```ts
export async function injectStackContext(
  projectDir: string,
  options?: StackInjectOptions
): Promise<StackInjectResult> {
  const resolvedDir = path.resolve(projectDir);
  const cache: FetchCache = options?.cache ?? { org: undefined, stacks: new Map() };

  const org = await getOrgData(resolvedDir, cache);
  if (!org) {
    return { injected: false, reason: 'no_config' };
  }

  const orgData = org as Record<string, unknown>;
  const renderingConfig = orgData.context_rendering as RenderingConfig | undefined;
  if (!renderingConfig) {
    return { injected: false, reason: 'no_rendering_config' };
  }

  const configPath = path.join(resolvedDir, 'openspec', 'config.yaml');
  const ymlPath = path.join(resolvedDir, 'openspec', 'config.yml');
  const filePath = existsSync(configPath) ? configPath : existsSync(ymlPath) ? ymlPath : null;
  if (!filePath) {
    return {
      injected: false,
      reason: 'no_config',
      message: 'openspec/config.yaml not found',
    };
  }

  let existingConfig: Record<string, unknown>;
  try {
    existingConfig = parseYaml(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      injected: false,
      reason: 'inject_failed',
      message: 'Failed to parse config.yaml',
    };
  }

  // Persist + resolve declared stacks.
  if (options?.stacks) {
    existingConfig.stacks = options.stacks;
  }
  const declaredStacks: string[] =
    options?.stacks ??
    (Array.isArray(existingConfig.stacks)
      ? (existingConfig.stacks.filter((s) => typeof s === 'string') as string[])
      : []);

  if (declaredStacks.length === 0) {
    // Nothing to inject, but persist an empty stacks field if caller passed [].
    if (options?.stacks) {
      try {
        writeFileSync(filePath, stringifyYaml(existingConfig, { lineWidth: 0 }), 'utf-8');
      } catch {
        /* ignore */
      }
    }
    return { injected: false, reason: 'no_stacks' };
  }

  const seen = seedSeenKeys(existingConfig);
  const stacksApplied: string[] = [];
  const artifactCounts: Record<string, number> = {};
  let foundCount = 0;

  // 1. Append stack common_groups → context (global, all artifacts).
  //    Sources resolve against the stack file object; renderingConfig supplies
  //    severity_labels/id_format (inherited from org.yaml).
  const ctxLines =
    typeof existingConfig.context === 'string' ? existingConfig.context.split('\n') : [];
  for (const sid of declaredStacks) {
    const stackFile = await getStackFile(resolvedDir, sid, cache);
    if (!stackFile) {
      console.warn(chalk.dim(`  No stacks/${sid}.yaml found (skipping ${sid})`));
      continue;
    }
    foundCount++;
    const sc = stackFile.rendering;
    if (!sc?.common_groups || sc.common_groups.length === 0) continue;
    const before = ctxLines.length;
    const rendered = renderAll(stackFile, sc.common_groups, renderingConfig);
    appendDedup(ctxLines, rendered.split('\n'), seen);
    if (ctxLines.length > before && !stacksApplied.includes(sid)) stacksApplied.push(sid);
  }
  if (ctxLines.length > 0) {
    existingConfig.context = ctxLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // 2. Append stack phase groups → rules[artifactId] (scoped if artifactId given).
  const rules = (existingConfig.rules ?? {}) as Record<string, string[]>;
  const scopeArtifact = options?.artifactId;

  for (const sid of declaredStacks) {
    const stackFile = await getStackFile(resolvedDir, sid, cache);
    if (!stackFile?.rendering?.phases) continue;
    const sc = stackFile.rendering;

    const tryAppendRules = (aid: string, groups?: GroupConfig[]) => {
      if (!groups || groups.length === 0) return;
      if (scopeArtifact && aid !== scopeArtifact) return;
      const arr = Array.isArray(rules[aid]) ? rules[aid] : [];
      const beforeLen = arr.length;
      const rendered = renderGroupsAsRules(stackFile, groups, renderingConfig);
      appendDedup(arr, rendered, seen);
      if (arr.length > beforeLen) {
        rules[aid] = arr;
        artifactCounts[aid] = (artifactCounts[aid] ?? 0) + (arr.length - beforeLen);
        if (!stacksApplied.includes(sid)) stacksApplied.push(sid);
      } else if (arr.length > 0 && !rules[aid]) {
        rules[aid] = arr;
      }
    };

    for (const [phaseName, phaseConf] of Object.entries(sc.phases)) {
      const pc = phaseConf as PhaseConfig;
      tryAppendRules(getArtifactIdForPhase(phaseName), pc.groups);
      if (pc.sub_phases) {
        for (const [subName, subConf] of Object.entries(pc.sub_phases)) {
          tryAppendRules(getArtifactIdForPhase(phaseName, subName), subConf.groups);
        }
      }
    }
  }
  existingConfig.rules = rules;

  // 3. Metadata.
  if (!existingConfig._sdd_merged) {
    existingConfig._sdd_merged = {};
  }
  const merged = existingConfig._sdd_merged as Record<string, unknown>;
  merged.injected_stacks = declaredStacks;
  merged.injected_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Declared stacks but none had a file — persist stacks field, report nothing injected.
  if (foundCount === 0) {
    try {
      writeFileSync(filePath, stringifyYaml(existingConfig, { lineWidth: 0 }), 'utf-8');
    } catch {
      /* ignore */
    }
    return { injected: false, reason: 'no_stack_files' };
  }

  try {
    writeFileSync(filePath, stringifyYaml(existingConfig, { lineWidth: 0 }), 'utf-8');
  } catch (error) {
    console.warn(
      chalk.dim(
        `  Failed to write config.yaml: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return {
      injected: false,
      reason: 'inject_failed',
      message: 'Failed to write config.yaml',
    };
  }

  return { injected: true, stacksApplied, artifactCounts };
}
```

- [ ] **Step 4: 删除不再被引用的旧 fetchOrgData；贯通 injectGovernance 缓存**

4a. 删除 `fetchOrgData` 函数（Task 3 中保留的一行委托版本）。现在 `getOrgData` 已取代它，无调用点。

> 验证无引用：`injectOrgContext` 与 `injectStackContext` 已改用 `getOrgData`。删整段 `async function fetchOrgData(...)`。

4b. 把 `injectGovernance`（L783–791）替换为：

```ts
export async function injectGovernance(
  projectDir: string,
  phase?: string
): Promise<{ org: OrgInjectResult; stack: StackInjectResult }> {
  const cache: FetchCache = { org: undefined, stacks: new Map() };
  const org = await injectOrgContext(projectDir, phase, cache);
  const artifactId = phase === 'all' ? undefined : phase;
  const stack = await injectStackContext(
    projectDir,
    artifactId ? { artifactId, cache } : { cache }
  );
  return { org, stack };
}
```

- [ ] **Step 5: 运行 stack-governance 测试，确认 GREEN**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/stack-governance.test.ts`
Expected: PASS（全部用例，含迁移后的契约 + no_stack_files）。

- [ ] **Step 6: 构建 + 跑相关单测**

Run: `cd D:/work/harness/OpenSpec && node build.js`
Expected: 编译成功（无未用 `fetchOrgData`、类型一致）。

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/org-integration-units.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
cd D:/work/harness/OpenSpec
git add src/core/org-integration.ts
git commit -m "feat(org-integration): injectStackContext reads stacks/<id>.yaml; cache via injectGovernance

Per-stack getStackFile + tolerant skip; severity_labels/id_format inherited
from org renderingConfig. Render pipeline unchanged. Fixes double org.yaml fetch.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 新增多栈 / 容错跳过 / 缓存计数测试

覆盖设计中的核心新行为。

**Files:**
- Modify: `D:/work/harness/OpenSpec/test/core/stack-governance.test.ts`

- [ ] **Step 1: beforeEach 增加 vue fixture（供多栈用例）**

在 Task 1 Step 2 写入 `typescript.yaml` 之后，再写一个 `vue.yaml`：

```ts
    writeFileSync(
      path.join(orgRoot, 'stacks', 'vue.yaml'),
      `id: vue
rules:
  - { id: VUE-001, rule: "use script setup", severity: warn, enforcement: lintable }
rendering:
  common_groups:
    - title: "Vue 约束"
      source: "rules"
      format: "severity_tagged"
`
    );
```

- [ ] **Step 2: 新增多栈用例**

在 `describe('injectStackContext', ...)` 内追加：

```ts
  it('injects multiple stacks (typescript + vue) into context', async () => {
    const res = await injectStackContext(projectDir, { stacks: ['typescript', 'vue'] });
    expect(res.injected).toBe(true);
    expect(res.stacksApplied).toContain('typescript');
    expect(res.stacksApplied).toContain('vue');
    const ctx = readConfig().context as string;
    expect(ctx).toContain('TS-001');
    expect(ctx).toContain('VUE-001');
  });
```

- [ ] **Step 3: 新增容错跳过用例（声明含无文件栈，其余仍注入）**

```ts
  it('skips a declared stack with no file but still injects the others', async () => {
    const res = await injectStackContext(projectDir, {
      stacks: ['react', 'typescript'],
    });
    expect(res.injected).toBe(true);
    expect(res.stacksApplied).toContain('typescript');
    expect(res.stacksApplied).not.toContain('react');
    const ctx = readConfig().context as string;
    expect(ctx).toContain('TS-001'); // typescript still injected
  });
```

- [ ] **Step 4: 新增缓存计数用例（remote 路径，stub global fetch）**

文件顶部 import 补充 `injectGovernance` 与 `rmSync`（`rmSync` 已 import；补 injectGovernance）：

```ts
import { injectStackContext, injectGovernance } from '../../src/core/org-integration.js';
```

在 `describe('injectStackContext', ...)` 内追加（独立于 OPENSPEC_ORG_ROOT，用 harness.url + stub fetch）：

```ts
  it('injectGovernance fetches org.yaml once (cache shared across org + stack inject)', async () => {
    const prevOrgRoot = process.env.OPENSPEC_ORG_ROOT;
    delete process.env.OPENSPEC_ORG_ROOT; // shadow the local path; exercise harness.url

    const calls: string[] = [];
    const fetchMock = async (url: string | URL | Request): Promise<Response> => {
      const u = String(url);
      calls.push(u);
      let body = '';
      if (u.endsWith('/org.yaml')) {
        body = `version: "test"\ncontext_rendering:\n  severity_labels: { warn: "(warn)" }\n  id_format: "[{id}]"\n  common_groups: []\n  phases: {}\n`;
      } else if (u.endsWith('/stacks/typescript.yaml')) {
        body = `id: typescript\nrules:\n  - { id: TS-001, rule: "no any", severity: warn, enforcement: lintable }\nrendering:\n  common_groups:\n    - title: "TS"\n      source: "rules"\n      format: "severity_tagged"\n`;
      } else {
        return new Response('not found', { status: 404 });
      }
      return new Response(body, { status: 200 });
    };
    vi.stubGlobal('fetch', fetchMock);

    const proj = mkdtempSync(path.join(tmpdir(), 'openspec-cache-'));
    mkdirSync(path.join(proj, 'openspec'), { recursive: true });
    writeFileSync(
      path.join(proj, 'openspec', 'config.yaml'),
      `schema: spec-driven\nharness:\n  url: https://example.test/governance/org.yaml\nstacks: [typescript]\ncontext: ""\nrules: {}\n`
    );

    try {
      await injectGovernance(proj, 'all');
      const orgHits = calls.filter((u) => u.endsWith('/org.yaml')).length;
      expect(orgHits).toBe(1); // was 2 before the in-call cache
    } finally {
      vi.unstubAllGlobals();
      rmSync(proj, { recursive: true, force: true });
      if (prevOrgRoot === undefined) delete process.env.OPENSPEC_ORG_ROOT;
      else process.env.OPENSPEC_ORG_ROOT = prevOrgRoot;
    }
  });
```

> 说明：`vi` 需 import。在文件顶部 import 行追加 `vi`：`import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`（原行仅 `describe, it, expect, beforeEach, afterEach`）。

- [ ] **Step 5: 运行，确认 GREEN**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/stack-governance.test.ts`
Expected: PASS（含 3 个新用例）。若缓存计数失败（orgHits=2），说明 injectGovernance 未贯通 cache——回 Task 4 Step 4b 检查。

- [ ] **Step 6: 提交**

```bash
cd D:/work/harness/OpenSpec
git add test/core/stack-governance.test.ts
git commit -m "test(stacks): multi-stack, tolerant skip, cache-once org.yaml fetch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 迁移 stacks.test.ts（命令级）到目录布局

**Files:**
- Modify: `D:/work/harness/OpenSpec/test/commands/stacks.test.ts`

- [ ] **Step 1: 替换 ORG_YAML（删 stacks/stack_rules）**

把第 15–31 行 `ORG_YAML` 替换为：

```ts
const ORG_YAML = `version: "test"
context_rendering:
  severity_labels:
    warn: "(warn)"
    block: "(block)"
  id_format: "[{id}]"
`;
```

- [ ] **Step 2: beforeEach 写 stacks/typescript.yaml**

在 `writeFileSync(path.join(orgRoot, 'org.yaml'), ORG_YAML);`（L46）之后新增：

```ts
    mkdirSync(path.join(orgRoot, 'stacks'), { recursive: true });
    writeFileSync(
      path.join(orgRoot, 'stacks', 'typescript.yaml'),
      `id: typescript
rules:
  - { id: TS-001, rule: "no any", severity: warn, enforcement: lintable }
rendering:
  common_groups:
    - title: "TypeScript 约束"
      source: "rules"
      format: "severity_tagged"
`
    );
```

- [ ] **Step 3: 运行，确认 GREEN**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/commands/stacks.test.ts`
Expected: PASS（全部 8 个用例；`set injects the stack rule into context` 仍断言 context 含 TS-001）。

- [ ] **Step 4: 提交**

```bash
cd D:/work/harness/OpenSpec
git add test/commands/stacks.test.ts
git commit -m "test(stacks): migrate stacks command test to stacks/ dir layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 更新 stacks.ts / cli/index.ts 文案

**Files:**
- Modify: `D:/work/harness/OpenSpec/src/commands/stacks.ts`
- Modify: `D:/work/harness/OpenSpec/src/cli/index.ts:581`

- [ ] **Step 1: 更新 stacks.ts 顶部注释（L4–5）**

把：
```ts
 * Tech-stack rules are pulled from org.yaml (context_rendering.stacks +
 * stack_rules) and injected into config.yaml via injectStackContext.
```
替换为：
```ts
 * Tech-stack rules are pulled from self-contained stacks/<id>.yaml files
 * (rules + rendering) and injected into config.yaml via injectStackContext.
```

- [ ] **Step 2: 更新 stacks.ts 错误分支（L127–130）**

把：
```ts
  } else if (result.reason === 'no_stack_rendering_config') {
    throw new Error(
      'org.yaml has no context_rendering.stacks section — nothing to inject. Add stack rules to org.yaml first.'
    );
```
替换为：
```ts
  } else if (result.reason === 'no_stack_files') {
    throw new Error(
      `No stacks/<id>.yaml found for: ${stacks.join(', ')}. Add per-stack files under stacks/ in the harness org repo.`
    );
```

- [ ] **Step 3: 更新 cli/index.ts 命令描述（L581）**

把：
```ts
  .description('Persist config.stacks and inject stack rules from org.yaml')
```
替换为：
```ts
  .description('Persist config.stacks and inject stack rules from stacks/<id>.yaml')
```

- [ ] **Step 4: 构建**

Run: `cd D:/work/harness/OpenSpec && node build.js`
Expected: 编译成功。

- [ ] **Step 5: 提交**

```bash
cd D:/work/harness/OpenSpec
git add src/commands/stacks.ts src/cli/index.ts
git commit -m "docs(stacks): update copy to reflect stacks/<id>.yaml source

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 源端迁移 — 创建 stacks/*.yaml + 精简 org.yaml

在真实 org 仓库操作。本任务不跑代码单测（用合成 fixture 的单测已在 Task 1–7 覆盖代码），由 Task 10 的真实 E2E 验证。

**Files:**
- Create: `D:/work/harness/org/stacks/typescript.yaml`
- Create: `D:/work/harness/org/stacks/vue.yaml`
- Modify: `D:/work/harness/org/org.yaml`

- [ ] **Step 1: 创建 stacks/typescript.yaml**

```yaml
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
      source: "rules"
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

- [ ] **Step 2: 创建 stacks/vue.yaml**

```yaml
id: vue
label: Vue
rules:
  - { id: VUE-001, rule: "组件统一使用 <script setup> 语法", severity: warn, enforcement: lintable }
  - { id: VUE-002, rule: "props 用 defineProps 做显式类型化，禁止 any", severity: warn, enforcement: lintable }
  - { id: VUE-003, rule: "状态变更走响应式 API（ref/reactive），禁止直接突变非响应式对象", severity: warn, enforcement: prompt-only }
rendering:
  common_groups:
    - title: "Vue 约束"
      source: "rules"
      format: "severity_tagged"
```

- [ ] **Step 3: 从 org.yaml 删除 context_rendering.stacks 段**

把 `org.yaml` 中下面这块（含上方 4 行注释 + `stacks:` 到 vue 的 `format: "severity_tagged"`）：

```yaml
  # 技术栈专属规则（第二层治理）：按探测到的栈过滤渲染，追加进 context/rules。
  # 形状与 common_groups/phases 一致，source 指向下方 stack_rules 域。
  # 种子示例（typescript/vue 各几条），请按需扩充；ID 前缀区分通用/阶段专属，
  # 避免同一条规则被去重逻辑跨字段误判（如 TS-T-* 只进 tasks，TS-* 只进 context）。
  stacks:
    typescript:
      common_groups:
        - title: "TypeScript 约束"
          source: "stack_rules.typescript"
          filter: { exclude_prefix: "TS-T-" }
          format: "severity_tagged"
      phases:
        tasks:
          groups:
            - title: "TypeScript 任务约束"
              source: "stack_rules.typescript"
              filter: { id_prefix: "TS-T-" }
              format: "severity_tagged"
    vue:
      common_groups:
        - title: "Vue 约束"
          source: "stack_rules.vue"
          format: "severity_tagged"
```

整体替换为单行注释：

```yaml
  # 技术栈专属规则（第二层治理）已迁出至同目录 stacks/<id>.yaml。
```

- [ ] **Step 4: 从 org.yaml 删除 stack_rules 段**

把下面这块（含注释 + `stack_rules:` 到 vue 三条）：

```yaml
# 技术栈专属规则索引（第二层治理）——种子示例，请按栈扩充
stack_rules:
  typescript:
    - { id: TS-001, rule: "禁止使用 any；确需宽松类型时用 unknown 并注释原因", severity: warn, enforcement: lintable }
    - { id: TS-002, rule: "公共 API 与导出函数必须显式标注返回类型", severity: warn, enforcement: lintable }
    - { id: TS-003, rule: "优先用 type 定义联合/工具类型，用 interface 描述可被实现的对象形状", severity: warn, enforcement: prompt-only }
    - { id: TS-T-001, rule: "任务拆分须对齐到单一模块/类型边界，单任务不跨层", severity: warn, enforcement: prompt-only }
  vue:
    - { id: VUE-001, rule: "组件统一使用 <script setup> 语法", severity: warn, enforcement: lintable }
    - { id: VUE-002, rule: "props 用 defineProps 做显式类型化，禁止 any", severity: warn, enforcement: lintable }
    - { id: VUE-003, rule: "状态变更走响应式 API（ref/reactive），禁止直接突变非响应式对象", severity: warn, enforcement: prompt-only }
```

整体替换为单行注释：

```yaml
# 技术栈专属规则索引（第二层治理）已迁出至 stacks/<id>.yaml。
```

- [ ] **Step 5: 本地校验 org.yaml 仍可被渲染脚本读取（org 级渲染不依赖 stacks）**

Run: `cd D:/work/harness/org && node scripts/render-context.mjs --phase apply --output /tmp/_rc_check.md && echo OK`
Expected: 输出 `Written to ...` 且无报错（脚本只读 common_groups/phases，不读 stacks，迁移对其透明）。

> Windows bash 下 `/tmp` 可能不存在；可改为 `--output ./_rc_check.md` 后删除。

- [ ] **Step 6: 提交（org 仓库）**

```bash
cd D:/work/harness/org
git add stacks/typescript.yaml stacks/vue.yaml org.yaml
git commit -m "refactor(org): move tech-stack governance out of org.yaml into stacks/

stacks/<id>.yaml are self-contained (rules + rendering); org.yaml keeps only
Layer-1 org-level rules. Render script unaffected (org-level only).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 更新 harness-integration-guide.md

**Files:**
- Modify: `D:/work/harness/OpenSpec/docs/harness-integration-guide.md`

- [ ] **Step 1: 更新「技术栈治理（Layer 2）」段（L185–200 附近）**

把第 187 行：
```md
组织级规则（Layer 1）在 `openspec init` 时全量注入，但技术栈无关。技术栈特定规则（Layer 2，如 TypeScript 的禁用 `any`、Vue 的 `<script setup>`）在**生成 design 时**才确认并注入——此时技术决策刚刚成型，比 init（常为绿地）更适合探测。
```
替换为：
```md
组织级规则（Layer 1）在 `openspec init` 时全量注入，但技术栈无关。技术栈特定规则（Layer 2，如 TypeScript 的禁用 `any`、Vue 的 `<script setup>`）在**生成 design 时**才确认并注入——此时技术决策刚刚成型，比 init（常为绿地）更适合探测。Layer-2 规则按栈存放在 harness 仓库的 `stacks/<id>.yaml`（自包含：`rules` + `rendering`），按探测到的栈逐个拉取，缺失即跳过。
```

把第 195 行：
```md
openspec stacks set --stacks typescript,vue # 持久化 config.stacks + 从 org.yaml 注入栈规则
```
替换为：
```md
openspec stacks set --stacks typescript,vue # 持久化 config.stacks + 从 stacks/<id>.yaml 注入栈规则
```

- [ ] **Step 2: 提交（fork）**

```bash
cd D:/work/harness/OpenSpec
git add docs/harness-integration-guide.md
git commit -m "docs(harness): note stacks/<id>.yaml as Layer-2 source

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 最终验证（构建 + 全测试 + 本地 E2E + SEC 预检）

**Files:** 无（仅运行验证）

- [ ] **Step 1: 全量构建**

Run: `cd D:/work/harness/OpenSpec && node build.js`
Expected: 编译成功，无 TS 错误。

- [ ] **Step 2: 跑全部 stacks + org 相关测试**

Run: `cd D:/work/harness/OpenSpec && node_modules/.bin/vitest run test/core/stack-governance.test.ts test/commands/stacks.test.ts test/core/org-integration-units.test.ts`
Expected: 全 PASS。

- [ ] **Step 3: 本地 E2E（真实 org 仓库作源）**

准备一个 vue+ts demo 项目（可复用 `D:/work/_git_pull_demo` 或新建 tmp），设 `OPENSPEC_ORG_ROOT=D:/work/harness/org`：

```bash
cd D:/work/harness/OpenSpec && OPENSPEC_ORG_ROOT=D:/work/harness/org node dist/cli/index.js stacks set --stacks typescript,vue --json
```
Expected: JSON `injected: true`，`stacksApplied` 含 typescript、vue。

校验产物 config.yaml：
- `context` 含 `TS-001` 与 `VUE-001`，且 org 级规则（如 `AI-001`、`SEC-001`）共存。
- `rules.tasks` 含 `TS-T-001`，且 org 级 `ORG-T-001/002/003` 共存。
- 重复运行 `stacks set` 幂等（无重复行）。

再校验 instructions：
```bash
OPENSPEC_ORG_ROOT=D:/work/harness/org node dist/cli/index.js instructions tasks --json
```
Expected: 输出 `.rules` 含 `TS-T-001`。

> 若 demo 项目无 `openspec/config.yaml`，先 `openspec init` 一次（init 会注入 org context）。

- [ ] **Step 4: SEC 预检（推送前）**

对 `stacks/typescript.yaml`、`stacks/vue.yaml` 做密钥扫描（规则文本应无真实 secret）：
```bash
cd D:/work/harness/org && (grep -rniE "(api[_-]?key|secret|password|token|private[_-]?key)\\s*[:=]" stacks/ && echo "REVIEW NEEDED" || echo "clean")
```
Expected: `clean`（仅规则文本，无命中）。命中需人工复核后再推送。

- [ ] **Step 5: 远程 E2E（可选，需先 push org 仓库）**

先 `git -C D:/work/harness/org push origin master`，再在 unset `OPENSPEC_ORG_ROOT`、`harness.repo`+`ref=master` 的项目里 `openspec update --force`，校验 config.yaml 规则与推送的 org.yaml + stacks/ 一致。

> 远程依赖代理可达 `api.github.com`（CN 网络）。

- [ ] **Step 6: 记录验证结果**

把 E2E 关键产物（context 含 TS-001/VUE-001、rules.tasks 含 TS-T-001、幂等）截图或粘贴到 PR/提交说明。更新 memory（`tech-stack-governance-layer2` 与 `stacks-directory-refactor`）反映目录化已落地。

---

## Self-Review（计划对 spec 的覆盖核对）

- **spec §3.1（源端新建 stacks/*.yaml + 删 org.yaml 两段）** → Task 8 ✓
- **spec §3.2.1 类型（StackFile）** → Task 3 Step 3c ✓
- **spec §3.2.2 fetchOrgRelative（3 优先级 + tolerant）** → Task 3 Step 3b ✓
- **spec §3.2.3 buildFetchTarget relPath** → Task 2 ✓
- **spec §3.2.4 deriveRelativeUrl** → Task 3 Step 3a ✓
- **spec §3.2.5 FetchCache + getOrgData/getStackFile + injectGovernance 贯通** → Task 3 Step 3c + Task 4 Step 4b ✓
- **spec §3.2.6 injectStackContext 重写（含 no_stack_files、severity_labels 继承、渲染管线零改）** → Task 4 Step 3 ✓
- **spec §3.2.7 stacks.ts / cli/index.ts 文案** → Task 7 ✓
- **spec §3.3 测试迁移 + 多栈/容错/缓存/no_stack_files** → Task 1（迁移）、Task 5（新增）、Task 6（命令级）✓
- **spec §3.4 文档** → Task 9 ✓
- **spec §3.5 不变项** → 计划未触碰 stack-detection/init/update/instructions/render-context.mjs/渲染纯函数 ✓
- **spec §6 SEC 预检 + 干净切换** → Task 8（迁移）、Task 10 Step 4（SEC）✓
- **spec §7 验证计划** → Task 10 ✓

类型一致性核对：`FetchCache`（Task 3 导出）在 `StackInjectOptions.cache`（Task 4 Step 1）、`injectOrgContext` 第 3 参（Task 4 Step 2）、`injectGovernance`（Task 4 Step 4b）中签名一致；`StackFile.rendering` 类型为 `StackRenderingConfig`（既有，未改）；reason 枚举 `no_stack_files` 在实现（Task 4）、命令错误分支（Task 7）、测试（Task 1/5）三处一致。无占位符。
