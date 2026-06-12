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
//   "ai_behavior"                        → org.ai_behavior
//   "meta.principles"                    → org.meta.principles
//   "artifact_rules.proposal.rules"      → org.artifact_rules.proposal.rules
function resolvePath(obj, source) {
  return source.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, obj);
}

// ── Filtering ──
// Applies a filter specification to an array of rule objects.
// Filter supports:
//   { id: ["AI-001", "AI-003"] }                          — include only rules with matching IDs
//   { severity: "block" }                                 — include only rules with matching severity
//   { id_prefix: "SEC-DB" }                               — include only rules whose ID starts with prefix
//   { id_prefix: "SEC-", exclude_prefix: "SEC-DB" }       — prefix match but exclude another prefix
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

// - {rule} [{id}]  OR  - {string} (for plain string arrays)
function renderBulletList(data) {
  return data.map(item => {
    if (typeof item === 'string') return `- ${item}`;
    return `- ${item.rule} [${item.id}]`;
  });
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

// ── Phase → Artifact ID Mapping ──
// Maps our rendering phase names to OpenSpec artifact IDs.
// OpenSpec uses these IDs to match rules to the artifact being generated.
function getArtifactIdForPhase(phase, subPhase) {
  if (phase === 'propose') return 'proposal';
  if (phase === 'continue' && subPhase) return subPhase; // specs, design, tasks
  return phase; // apply, verify, or fallback
}

// ── Rules Rendering (for OpenSpec rules field) ──
// Renders groups into a flat string array suitable for OpenSpec's rules field.
// OpenSpec expects: rules: { proposal: ["rule1", "rule2"], ... }
// Each string is a plain rule text (without markdown list prefix).
function renderGroupsAsRules(org, groups, config) {
  const rules = [];
  for (const group of groups) {
    const data = resolvePath(org, group.source);
    const filtered = group.filter ? applyFilter(data, group.filter) : data;
    const rendered = renderGroup(filtered, group, config);
    for (const line of rendered) {
      // Skip "no data" placeholders
      if (line.startsWith('_(')) continue;
      // Strip markdown list prefix: "- " or "N. "
      const stripped = line.replace(/^-\s+/, '').replace(/^\d+\.\s+/, '');
      if (stripped) rules.push(stripped);
    }
  }
  return rules;
}

// ── CLI Argument Parsing ──
function parseArgs(argv) {
  const args = { phase: null, subPhase: null, all: false, output: null, check: false, inject: null };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--phase':       args.phase = argv[++i]; break;
      case '--sub-phase':   args.subPhase = argv[++i]; break;
      case '--all':         args.all = true; break;
      case '--output':      args.output = argv[++i]; break;
      case '--check':       args.check = true; break;
      case '--inject':      args.inject = argv[++i]; break;
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
  --inject <project_dir>   Inject into <project_dir>/openspec/config.yaml:
                           - common_groups → context field (shared across all artifacts)
                           - phase groups → rules[artifactId] field (artifact-specific)
  --check                  Compare rendered output against --output file (CI mode)
  --help                   Show this help

Examples:
  node scripts/render-context.mjs --phase propose
  node scripts/render-context.mjs --phase continue --sub-phase specs
  node scripts/render-context.mjs --all --output rendered-context.md
  node scripts/render-context.mjs --phase apply --inject /path/to/project
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
  } else if (args.inject) {
    // Inject mode: split common_groups → context, phase groups → rules[artifactId]
    const configPath = join(resolve(args.inject), 'openspec', 'config.yaml');
    if (!existsSync(configPath)) {
      console.error(`Error: config.yaml not found at ${configPath}`);
      console.error('Ensure the target project has been initialized with OpenSpec (openspec init).');
      process.exit(1);
    }
    const existingConfig = YAML.parse(readFileSync(configPath, 'utf-8'));
    const renderingConfig = org.context_rendering;

    // ── 1. context = common_groups (shared across ALL artifacts) ──
    const commonGroups = renderingConfig.common_groups || [];
    existingConfig.context = commonGroups.length > 0
      ? renderAll(org, commonGroups, renderingConfig)
      : '';

    // ── 2. rules[artifactId] = phase-specific groups as string arrays ──
    const rules = existingConfig.rules || {};
    const phaseEntries = [];  // [{ artifactId, groups }]

    if (args.all) {
      // --all: inject rules for every phase and sub-phase
      for (const [phaseName, phaseConf] of Object.entries(renderingConfig.phases || {})) {
        if (phaseConf.groups) {
          phaseEntries.push({ artifactId: getArtifactIdForPhase(phaseName, null), groups: phaseConf.groups });
        }
        if (phaseConf.sub_phases) {
          for (const [subName, subConf] of Object.entries(phaseConf.sub_phases)) {
            if (subConf.groups) {
              phaseEntries.push({ artifactId: getArtifactIdForPhase(phaseName, subName), groups: subConf.groups });
            }
          }
        }
      }
    } else if (args.phase) {
      const phaseConf = renderingConfig.phases?.[args.phase];
      if (!phaseConf) {
        console.error(`Error: phase '${args.phase}' not found.`);
        process.exit(1);
      }

      if (args.subPhase) {
        // --phase continue --sub-phase specs → rules.specs
        const subConf = phaseConf.sub_phases?.[args.subPhase];
        if (!subConf) {
          console.error(`Error: sub-phase '${args.subPhase}' not found.`);
          process.exit(1);
        }
        phaseEntries.push({ artifactId: getArtifactIdForPhase(args.phase, args.subPhase), groups: subConf.groups || [] });
      } else if (phaseConf.sub_phases) {
        // --phase continue (no sub-phase) → inject all sub-phases
        for (const [subName, subConf] of Object.entries(phaseConf.sub_phases)) {
          phaseEntries.push({ artifactId: getArtifactIdForPhase(args.phase, subName), groups: subConf.groups || [] });
        }
      } else {
        // --phase propose / --phase apply / --phase verify → rules[artifactId]
        phaseEntries.push({ artifactId: getArtifactIdForPhase(args.phase, null), groups: phaseConf.groups || [] });
      }
    }

    for (const { artifactId, groups } of phaseEntries) {
      const ruleStrings = renderGroupsAsRules(org, groups, renderingConfig);
      if (ruleStrings.length > 0) {
        rules[artifactId] = ruleStrings;
      }
    }

    existingConfig.rules = rules;

    // ── 3. Metadata ──
    if (!existingConfig._sdd_merged) {
      existingConfig._sdd_merged = {};
    }
    existingConfig._sdd_merged.org_version = org.version || 'unknown';
    existingConfig._sdd_merged.injected_phase = args.phase || 'all';
    existingConfig._sdd_merged.injected_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    writeFileSync(configPath, YAML.stringify(existingConfig, { lineWidth: 0 }), 'utf-8');
    const injected = phaseEntries.map(p => `${p.artifactId}(${(rules[p.artifactId] || []).length})`).join(', ');
    console.log(`✓ Injected context (${commonGroups.length} common groups) + rules[${injected}] into ${configPath}`);
  } else if (args.output) {
    writeFileSync(args.output, output, 'utf-8');
    console.log(`Written to ${args.output}`);
  } else {
    process.stdout.write(output);
  }
}

main();
