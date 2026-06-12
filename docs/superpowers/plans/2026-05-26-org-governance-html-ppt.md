# Org Governance HTML PPT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained single-file HTML presentation that introduces the organization-level governance spec in a modern tech style for a team briefing.

**Architecture:** Create one standalone HTML file with embedded CSS and JavaScript. The file will contain 10 slides, inline visual structures (cards, grids, timeline, flow, split-responsibility diagram), keyboard-based navigation, page indicators, and no external dependencies.

**Tech Stack:** HTML, CSS, vanilla JavaScript, PowerShell, Python launcher (`py`) for validation.

**Execution note:** The current workspace is not a git repository. Do not add commit steps unless the workspace is later initialized as a repo.

---

## File Structure

- Create: `docs/presentations/org-governance-overview.html`
  - Single-file PPT artifact
  - Contains all slide content, styles, diagrams, navigation, and transitions
- Reference: `docs/superpowers/specs/2026-05-26-org-governance-html-ppt-design.md`
  - Approved design source for content scope and slide structure
- Reference: `org-merged-draft.yaml`
  - Source-of-truth for governance principles, modules, artifact boundaries, conflict policy, exemption policy, and stage gates

## Implementation Constraints

- Keep the final deliverable to one HTML file
- Do not load CDN fonts, icon libraries, JS frameworks, or remote CSS
- Do not introduce reveal.js or other slideshow frameworks
- Do not turn the deck into a rule-by-rule manual
- Keep the deck to exactly 10 slides
- Use modern tech styling, but prioritize readability over decoration

## Acceptance Criteria

- `docs/presentations/org-governance-overview.html` exists and opens directly in a browser
- The file contains exactly 10 slides
- The deck covers: why governance, four principles, six-part overview, AI/SEC/CQ core lines, pipeline, artifact boundaries, conflict/exemption, org-vs-tech-stack split, closing summary
- Left/right arrow keys switch slides
- Page number and current-slide state are visible
- No external URLs or remote assets are required for rendering

---

### Task 1: Scaffold the single-file HTML deck

**Files:**
- Create: `docs/presentations/org-governance-overview.html`
- Reference: `docs/superpowers/specs/2026-05-26-org-governance-html-ppt-design.md`

- [ ] **Step 1: Write the failing existence check**

Run:

```powershell
py -c "from pathlib import Path; p = Path('docs/presentations/org-governance-overview.html'); assert p.exists(), 'missing docs/presentations/org-governance-overview.html'"
```

Expected: FAIL with `missing docs/presentations/org-governance-overview.html`

- [ ] **Step 2: Create the HTML shell with 10 slide containers**

Write `docs/presentations/org-governance-overview.html` with this initial structure:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>组织级别规范总览</title>
    <style>
      :root {
        --bg-1: #0b1020;
        --bg-2: #111936;
        --panel: rgba(17, 25, 54, 0.72);
        --panel-border: rgba(99, 179, 237, 0.22);
        --text-main: #eef4ff;
        --text-sub: #a9b7d9;
        --accent: #4de2ff;
        --accent-2: #7c5cff;
        --danger: #ff7b72;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: radial-gradient(circle at top, #17234d 0%, #090d1b 58%, #06070d 100%); color: var(--text-main); font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
      body { overflow: hidden; }

      .deck {
        position: relative;
        width: 100vw;
        height: 100vh;
      }

      .slide {
        position: absolute;
        inset: 0;
        padding: 56px 72px 88px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        opacity: 0;
        transform: translateX(36px);
        pointer-events: none;
      }

      .slide.is-active {
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
      }

      .slide__eyebrow {
        color: var(--accent);
        font-size: 14px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }

      .slide__title {
        margin: 12px 0 0;
        font-size: 46px;
        line-height: 1.1;
      }

      .slide__body {
        display: grid;
        align-content: center;
        gap: 24px;
      }

      .slide__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--text-sub);
        font-size: 14px;
      }

      .page-indicator {
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }

      .page-indicator__bar {
        width: 180px;
        height: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        overflow: hidden;
      }

      .page-indicator__fill {
        height: 100%;
        width: 10%;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
      }

      .hero-kicker,
      .panel,
      .grid,
      .timeline,
      .split-layout,
      .summary-cards {
        min-height: 40px;
      }
    </style>
  </head>
  <body>
    <main class="deck" id="deck">
      <section class="slide is-active" data-slide="1"><div class="slide__body"><div class="slide__eyebrow">Org Governance</div><h1 class="slide__title">组织级别规范</h1></div><div class="slide__footer"><span>封面</span><div class="page-indicator"><span id="page-text">01 / 10</span><span class="page-indicator__bar"><span class="page-indicator__fill" id="page-fill"></span></span></div></div></section>
      <section class="slide" data-slide="2"><div class="slide__body"><div class="slide__eyebrow">Why</div><h2 class="slide__title">为什么需要组织级规范</h2></div><div class="slide__footer"><span>必要性</span><span>02</span></div></section>
      <section class="slide" data-slide="3"><div class="slide__body"><div class="slide__eyebrow">Principles</div><h2 class="slide__title">四条设计原则</h2></div><div class="slide__footer"><span>设计逻辑</span><span>03</span></div></section>
      <section class="slide" data-slide="4"><div class="slide__body"><div class="slide__eyebrow">Map</div><h2 class="slide__title">六大部分全景图</h2></div><div class="slide__footer"><span>体系地图</span><span>04</span></div></section>
      <section class="slide" data-slide="5"><div class="slide__body"><div class="slide__eyebrow">Core Lines</div><h2 class="slide__title">三条核心约束主线</h2></div><div class="slide__footer"><span>核心底线</span><span>05</span></div></section>
      <section class="slide" data-slide="6"><div class="slide__body"><div class="slide__eyebrow">Pipeline</div><h2 class="slide__title">流程治理</h2></div><div class="slide__footer"><span>研发过程</span><span>06</span></div></section>
      <section class="slide" data-slide="7"><div class="slide__body"><div class="slide__eyebrow">Artifacts</div><h2 class="slide__title">Artifact 规则</h2></div><div class="slide__footer"><span>协作边界</span><span>07</span></div></section>
      <section class="slide" data-slide="8"><div class="slide__body"><div class="slide__eyebrow">Governance</div><h2 class="slide__title">冲突与豁免机制</h2></div><div class="slide__footer"><span>治理裁定</span><span>08</span></div></section>
      <section class="slide" data-slide="9"><div class="slide__body"><div class="slide__eyebrow">Layer Split</div><h2 class="slide__title">组织层 vs 技术栈层</h2></div><div class="slide__footer"><span>职责分层</span><span>09</span></div></section>
      <section class="slide" data-slide="10"><div class="slide__body"><div class="slide__eyebrow">Closing</div><h2 class="slide__title">总结与推行建议</h2></div><div class="slide__footer"><span>行动方向</span><span>10</span></div></section>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Run the structure validation**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8'); assert text.count('class=\"slide') == 10, f'slide count={text.count("class=\\\"slide")}' ; assert '组织级别规范' in text; assert '为什么需要组织级规范' in text; assert '组织层 vs 技术栈层' in text; print('structure ok')"
```

Expected: PASS with `structure ok`

---

### Task 2: Fill all 10 slides with approved governance content

**Files:**
- Modify: `docs/presentations/org-governance-overview.html`
- Reference: `org-merged-draft.yaml`
- Reference: `docs/superpowers/specs/2026-05-26-org-governance-html-ppt-design.md`

- [ ] **Step 1: Write the failing content validation**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8'); required = ['组织层定义底线，不定义技术栈细节', 'AI 编码行为底线', 'proposal → specs → design → tasks → implementation', 'stricter wins', 'SEC-* 和 NG-* 不可豁免']; missing = [item for item in required if item not in text]; assert not missing, f'missing content: {missing}'"
```

Expected: FAIL with one or more missing content items

- [ ] **Step 2: Replace empty slide bodies with full content blocks and inline diagrams**

Implement these content patterns inside the existing slides:

```html
<!-- Slide 2 body -->
<div class="slide__body hero-kicker">
  <div class="panel panel--hero">
    <p class="lead">AI 编码能力快速增强，但行为边界、输出稳定性和交付标准并不会自动统一。</p>
    <div class="summary-cards summary-cards--four">
      <article class="panel stat-card"><strong>规则口径不一致</strong><span>团队之间标准漂移，导致交付质量波动</span></article>
      <article class="panel stat-card"><strong>安全底线难统一</strong><span>没有统一红线就会把风险下放到项目现场</span></article>
      <article class="panel stat-card"><strong>流程容易被跳过</strong><span>直接写代码会让规格、设计和验证缺位</span></article>
      <article class="panel stat-card"><strong>治理不可审计</strong><span>没有统一规范就难形成可检查、可追责的闭环</span></article>
    </div>
  </div>
</div>

<!-- Slide 3 body -->
<div class="slide__body grid grid--two">
  <article class="panel principle-card"><h3>组织层定义底线，不定义技术栈细节</h3><p>保持通用约束，不把 Java、Vue、MyBatis 等实现细节塞进组织层。</p></article>
  <article class="panel principle-card"><h3>技术栈层可以更严格，但不能更宽松</h3><p>技术栈层负责把底线进一步具体化，但不得突破组织约束。</p></article>
  <article class="panel principle-card"><h3>每条规则必须可被 AI 在特定环节执行</h3><p>规则不是口号，必须能在生成、评审、发布等环节被落实。</p></article>
  <article class="panel principle-card"><h3>无法执行的规则不进入正式约束</h3><p>确保规则具备落地性，避免只有形式没有执行抓手。</p></article>
</div>

<!-- Slide 4 body -->
<div class="slide__body">
  <div class="governance-map">
    <article class="panel module-card"><span>AI</span><h3>AI 编码行为底线</h3><p>先思考、少假设、精确改动、必须验证</p></article>
    <article class="panel module-card"><span>SEC</span><h3>安全红线</h3><p>定义绝对不可突破的风险边界</p></article>
    <article class="panel module-card"><span>CQ</span><h3>代码质量规范</h3><p>错误处理、测试、审查、反模式治理</p></article>
    <article class="panel module-card"><span>PL</span><h3>SDD 流程治理</h3><p>proposal 到 implementation 的阶段门禁</p></article>
    <article class="panel module-card"><span>ORG</span><h3>Artifact 生成规则</h3><p>文档职责边界、追溯链路与测试要求</p></article>
    <article class="panel module-card"><span>GOV</span><h3>冲突与豁免机制</h3><p>冲突裁定、不可豁免范围、审批治理</p></article>
  </div>
</div>

<!-- Slide 6 body -->
<div class="slide__body">
  <div class="timeline">
    <div class="timeline__item"><strong>proposal</strong><span>明确为什么做、做什么</span></div>
    <div class="timeline__item"><strong>specs</strong><span>定义行为、输入输出、异常与测试场景</span></div>
    <div class="timeline__item"><strong>design</strong><span>说明如何实现、影响范围与关键决策</span></div>
    <div class="timeline__item"><strong>tasks</strong><span>拆解执行步骤、依赖与验证要求</span></div>
    <div class="timeline__item"><strong>implementation</strong><span>只有在 gate 满足后才进入编码</span></div>
  </div>
  <div class="panel note-panel">主线：proposal → specs → design → tasks → implementation</div>
</div>

<!-- Slide 8 body -->
<div class="slide__body grid grid--two">
  <article class="panel"><h3>默认冲突策略</h3><p><strong>stricter wins</strong>：更严格者优先；数值取更大、范围取更窄、严重级别取更高。</p></article>
  <article class="panel"><h3>不可豁免范围</h3><p><strong>SEC-* 和 NG-* 不可豁免</strong>，安全红线和 No-Go 反模式是组织底线。</p></article>
  <article class="panel"><h3>可审批豁免</h3><p>AI-*、PL-*、CQ-*、ORG-* 可申请，但需要说明风险、截止时间与补救计划。</p></article>
  <article class="panel"><h3>AI 的裁定边界</h3><p>遇到无法自动判断的定性冲突，AI 必须停下来询问人工，不得自行拍板。</p></article>
</div>

<!-- Slide 9 body -->
<div class="slide__body split-layout">
  <article class="panel split-layout__panel">
    <div class="chip">组织层</div>
    <h3>定义底线</h3>
    <ul>
      <li>原则与规则声明</li>
      <li>严重级别与执行者</li>
      <li>通用 detection_principle</li>
      <li>冲突与豁免治理逻辑</li>
    </ul>
  </article>
  <article class="panel split-layout__panel">
    <div class="chip chip--secondary">技术栈层</div>
    <h3>定义具体检测</h3>
    <ul>
      <li>patterns / AST / lint 规则</li>
      <li>false positive 说明</li>
      <li>true positive 示例</li>
      <li>语言与框架专项约束</li>
    </ul>
  </article>
</div>
```

Also fill the other slides with the approved copy from the design doc so that all 10 slides have presentable text, not just headings.

- [ ] **Step 3: Run the content validation**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8'); required = ['组织层定义底线，不定义技术栈细节', '技术栈层可以更严格，但不能更宽松', 'AI 编码行为底线', '安全红线', '代码质量规范', 'proposal → specs → design → tasks → implementation', 'stricter wins', 'SEC-* 和 NG-* 不可豁免']; missing = [item for item in required if item not in text]; assert not missing, f'missing content: {missing}'; print('content ok')"
```

Expected: PASS with `content ok`

---

### Task 3: Add modern tech styling, navigation, and stateful slide switching

**Files:**
- Modify: `docs/presentations/org-governance-overview.html`

- [ ] **Step 1: Write the failing interaction validation**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8'); required = ['document.addEventListener(\'keydown\'', 'slides.forEach', 'page-fill', 'requestAnimationFrame']; missing = [item for item in required if item not in text]; assert not missing, f'missing interaction markers: {missing}'"
```

Expected: FAIL because the interaction layer is not complete yet

- [ ] **Step 2: Add polished layout styles, responsive grids, and keyboard navigation logic**

Append and update the file with styles and scripts like these:

```html
<style>
  .panel {
    background: linear-gradient(180deg, rgba(17, 25, 54, 0.82), rgba(8, 13, 29, 0.78));
    border: 1px solid var(--panel-border);
    border-radius: 24px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.05);
    padding: 24px;
    backdrop-filter: blur(12px);
  }

  .grid--two,
  .summary-cards--four,
  .governance-map,
  .split-layout {
    display: grid;
    gap: 20px;
  }

  .grid--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-cards--four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .governance-map { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .split-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  .timeline {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
  }

  .timeline__item,
  .module-card,
  .principle-card,
  .stat-card {
    position: relative;
    overflow: hidden;
  }

  .timeline__item::before,
  .module-card::before,
  .principle-card::before {
    content: "";
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), transparent);
  }

  .slide {
    transition: opacity 320ms ease, transform 320ms ease;
  }

  @media (max-width: 1280px) {
    .summary-cards--four,
    .governance-map,
    .timeline { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>

<script>
  const slides = Array.from(document.querySelectorAll('.slide'));
  const pageText = document.getElementById('page-text');
  const pageFill = document.getElementById('page-fill');
  let currentIndex = 0;

  function renderSlide(index) {
    currentIndex = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, idx) => {
      slide.classList.toggle('is-active', idx === currentIndex);
      slide.setAttribute('aria-hidden', idx === currentIndex ? 'false' : 'true');
    });

    const page = String(currentIndex + 1).padStart(2, '0');
    const total = String(slides.length).padStart(2, '0');
    pageText.textContent = `${page} / ${total}`;
    requestAnimationFrame(() => {
      pageFill.style.width = `${((currentIndex + 1) / slides.length) * 100}%`;
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      renderSlide(currentIndex + 1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      renderSlide(currentIndex - 1);
    }
    if (event.key === 'Home') {
      renderSlide(0);
    }
    if (event.key === 'End') {
      renderSlide(slides.length - 1);
    }
  });

  renderSlide(0);
</script>
```

- [ ] **Step 3: Run the interaction validation**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8'); required = ['document.addEventListener(\'keydown\'', 'slides.forEach', 'requestAnimationFrame', 'ArrowRight', 'ArrowLeft', 'page-fill']; missing = [item for item in required if item not in text]; assert not missing, f'missing interaction markers: {missing}'; print('interaction ok')"
```

Expected: PASS with `interaction ok`

- [ ] **Step 4: Perform browser verification**

Run:

```powershell
Start-Process -FilePath "docs/presentations/org-governance-overview.html"
```

Manual checklist:

- First slide opens on the cover, not a blank screen
- Left/right arrow keys move between slides
- Page number updates as slides change
- Slide 4 module cards are readable and do not overflow
- Slide 6 pipeline is visible on one screen in 16:9 layout
- Slide 9 org-vs-tech-stack split appears as two distinct columns
- No broken icons, missing assets, or network dependency prompts appear

Expected: All checklist items pass

---

### Task 4: Final QA for single-file integrity and presentation readiness

**Files:**
- Modify: `docs/presentations/org-governance-overview.html` (only if fixes are needed)

- [ ] **Step 1: Write the failing dependency-integrity check**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8').lower(); banned = ['http://', 'https://', '<link rel=\"stylesheet\"', '<script src=']; found = [item for item in banned if item in text]; assert not found, f'external dependency markers present: {found}'"
```

Expected: PASS immediately if the file stayed self-contained; if it fails, remove the external dependency and re-run until it passes

- [ ] **Step 2: Verify the final content against the approved design**

Run:

```powershell
py -c "from pathlib import Path; text = Path('docs/presentations/org-governance-overview.html').read_text(encoding='utf-8'); required_titles = ['组织级别规范','为什么需要组织级规范','四条设计原则','六大部分全景图','三条核心约束主线','流程治理','Artifact 规则','冲突与豁免机制','组织层 vs 技术栈层','总结与推行建议']; missing = [title for title in required_titles if title not in text]; assert not missing, f'missing slide titles: {missing}'; assert text.count('class=\"slide') == 10, 'slide count changed'; print('final qa ok')"
```

Expected: PASS with `final qa ok`

- [ ] **Step 3: Do a final presenter-oriented review**

Review this checklist directly in the browser:

- Can a speaker explain each slide in under 60 seconds?
- Does each slide have one clear headline instead of multiple competing ideas?
- Are the colors readable in a meeting-room projector setting?
- Is the deck still understandable if the audience only remembers the six-part map and the execution closed loop?

If any answer is “no”, trim copy or simplify the layout in `docs/presentations/org-governance-overview.html`, then repeat browser verification.

---

## Self-Review Checklist

- Spec coverage: all 10 approved slides are represented in tasks above
- No placeholders: the plan contains exact file paths, validation commands, and concrete HTML/CSS/JS snippets
- Consistency: all tasks target the same final file and preserve the single-file constraint

## Done Definition

The work is done when `docs/presentations/org-governance-overview.html` opens directly, shows 10 readable slides, supports keyboard navigation, stays fully self-contained, and reflects the approved governance overview structure.
