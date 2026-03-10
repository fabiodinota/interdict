#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const defaultRepoRoot = path.resolve(scriptDir, "..", "..");

function printHelp() {
  process.stdout.write(`Phase loop runner for GSD milestones.

Usage:
  node scripts/gsd/run-phase-loop.mjs [options]

Options:
  --dir <path>              Repository root (default: script parent repo)
  --phases <list>           Comma-separated phases to run, e.g. 16,17,18
  --from <phase>            Start at phase number
  --to <phase>              End at phase number
  --max-gap-cycles <n>      Max gap-closure retries per phase (default: 3)
  --model <provider/model>  Pass model through to opencode
  --variant <value>         Pass model variant through to opencode
  --force-research          Re-run /gsd-research-phase even if RESEARCH.md exists
  --force-plan              Re-run /gsd-plan-phase even if PLAN.md files exist
  --dry-run                 Print what would run without invoking opencode
  --help                    Show this help

Behavior:
  1. /gsd-research-phase <phase>
  2. /gsd-plan-phase <phase> --skip-research
  3. /gsd-execute-phase <phase>
  4. If VERIFICATION.md says gaps_found, run:
     - /gsd-plan-phase <phase> --gaps
     - /gsd-execute-phase <phase> --gaps-only
  5. Each opencode call starts a fresh session, so context is cleared between steps.
`);
}

function parseArgs(argv) {
  const options = {
    repoRoot: defaultRepoRoot,
    maxGapCycles: 3,
    phases: null,
    from: null,
    to: null,
    model: null,
    variant: null,
    forceResearch: false,
    forcePlan: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--dir":
        options.repoRoot = path.resolve(argv[++i]);
        break;
      case "--phases":
        options.phases = argv[++i].split(",").map((item) => item.trim()).filter(Boolean);
        break;
      case "--from":
        options.from = argv[++i];
        break;
      case "--to":
        options.to = argv[++i];
        break;
      case "--max-gap-cycles":
        options.maxGapCycles = Number.parseInt(argv[++i], 10);
        break;
      case "--model":
        options.model = argv[++i];
        break;
      case "--variant":
        options.variant = argv[++i];
        break;
      case "--force-research":
        options.forceResearch = true;
        break;
      case "--force-plan":
        options.forcePlan = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxGapCycles) || options.maxGapCycles < 0) {
    throw new Error("--max-gap-cycles must be a non-negative integer");
  }

  return options;
}

function phaseToNumber(phase) {
  const parsed = Number.parseFloat(String(phase));
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid phase number: ${phase}`);
  }
  return parsed;
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readRoadmapPhases(repoRoot) {
  const roadmapPath = path.join(repoRoot, ".planning", "ROADMAP.md");
  const text = await readFile(roadmapPath, "utf8");
  const phases = [];
  const regex = /^- \[(?<checked>[ xX])\] Phase (?<phase>[0-9.]+): (?<name>.+?)(?:\s+--.*)?$/gm;

  let match = regex.exec(text);
  while (match) {
    phases.push({
      phase: match.groups.phase,
      name: match.groups.name.trim(),
      checked: match.groups.checked.toLowerCase() === "x",
    });
    match = regex.exec(text);
  }

  return phases;
}

function selectPhases(phases, options) {
  const byPhase = new Map(phases.map((item) => [item.phase, item]));

  if (options.phases && options.phases.length > 0) {
    return options.phases.map((phase) => {
      const item = byPhase.get(phase);
      if (!item) {
        throw new Error(`Phase ${phase} not found in .planning/ROADMAP.md`);
      }
      return item;
    });
  }

  return phases.filter((item) => {
    if (item.checked) {
      return false;
    }

    const numeric = phaseToNumber(item.phase);
    if (options.from !== null && numeric < phaseToNumber(options.from)) {
      return false;
    }
    if (options.to !== null && numeric > phaseToNumber(options.to)) {
      return false;
    }
    return true;
  });
}

async function findPhaseDir(repoRoot, phase) {
  const phasesRoot = path.join(repoRoot, ".planning", "phases");
  const entries = await readdir(phasesRoot, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`))
    .map((entry) => path.join(phasesRoot, entry.name));

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new Error(`Multiple phase directories found for phase ${phase}: ${matches.join(", ")}`);
  }

  return matches[0];
}

async function listFilesBySuffix(dirPath, prefix, suffix) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

async function getPhaseArtifacts(repoRoot, phase) {
  const phaseDir = await findPhaseDir(repoRoot, phase);
  if (!phaseDir) {
    return {
      phaseDir: null,
      research: null,
      verification: null,
      plans: [],
    };
  }

  const research = path.join(phaseDir, `${phase}-RESEARCH.md`);
  const verification = path.join(phaseDir, `${phase}-VERIFICATION.md`);
  const plans = await listFilesBySuffix(phaseDir, `${phase}-`, "-PLAN.md");

  return {
    phaseDir,
    research: (await fileExists(research)) ? research : null,
    verification: (await fileExists(verification)) ? verification : null,
    plans,
  };
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {};
  }

  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parts = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (parts) {
      result[parts[1]] = parts[2].trim();
    }
  }
  return result;
}

async function readVerificationStatus(verificationPath) {
  const text = await readFile(verificationPath, "utf8");
  const frontmatter = parseFrontmatter(text);
  return frontmatter.status || null;
}

async function hasGapPlans(phaseDir) {
  const planFiles = await listFilesBySuffix(phaseDir, "", "-PLAN.md");
  for (const filePath of planFiles) {
    const text = await readFile(filePath, "utf8");
    if (/^gap_closure:\s*true\s*$/m.test(text)) {
      return true;
    }
  }
  return false;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeSummary(state) {
  const lines = [
    "# GSD Phase Loop Run",
    "",
    `- Started: ${state.startedAt}`,
    `- Updated: ${new Date().toISOString()}`,
    `- Repo: ${state.repoRoot}`,
    `- Logs: ${state.logsDir}`,
    "",
    "| Phase | Name | Result | Verification | Gap Cycles | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const phase of state.phases) {
    lines.push(
      `| ${phase.phase} | ${phase.name} | ${phase.result ?? "pending"} | ${phase.verificationStatus ?? "-"} | ${phase.gapCycles ?? 0} | ${(phase.notes ?? []).join("; ") || "-"} |`,
    );
  }

  lines.push("");
  await writeFile(path.join(state.logsDir, "summary.md"), `${lines.join("\n")}\n`, "utf8");
}

function quoteArg(arg) {
  return /\s/.test(arg) ? `"${arg}"` : arg;
}

async function runOpencode({ repoRoot, logsDir, commandName, commandArgs, phase, step, options, commandLog }) {
  const args = ["run", "--dir", repoRoot, "--command", commandName];
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.variant) {
    args.push("--variant", options.variant);
  }
  args.push("--", ...commandArgs);

  const rendered = `opencode ${args.map(quoteArg).join(" ")}`;
  const startedAt = new Date().toISOString();
  const logEntry = { phase, step, commandName, commandArgs, rendered, startedAt };
  commandLog.push(logEntry);
  await writeJson(path.join(logsDir, "commands.json"), commandLog);

  process.stdout.write(`\n=== Phase ${phase} :: ${step} ===\n${rendered}\n\n`);

  if (options.dryRun) {
    logEntry.finishedAt = new Date().toISOString();
    logEntry.exitCode = 0;
    await writeJson(path.join(logsDir, "commands.json"), commandLog);
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn("opencode", args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${commandName} exited with code ${code}`));
    });
  });

  logEntry.finishedAt = new Date().toISOString();
  logEntry.exitCode = 0;
  await writeJson(path.join(logsDir, "commands.json"), commandLog);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = options.repoRoot;
  const logsDir = path.join(repoRoot, ".planning", "automation-logs", `phase-loop-${timestampForPath()}`);

  await mkdir(logsDir, { recursive: true });

  const roadmapPhases = await readRoadmapPhases(repoRoot);
  const selectedPhases = selectPhases(roadmapPhases, options);

  if (selectedPhases.length === 0) {
    throw new Error("No matching incomplete phases found in .planning/ROADMAP.md");
  }

  const state = {
    startedAt: new Date().toISOString(),
    repoRoot,
    logsDir,
    dryRun: options.dryRun,
    phases: selectedPhases.map((phase) => ({
      phase: phase.phase,
      name: phase.name,
      result: "pending",
      gapCycles: 0,
      notes: [],
    })),
  };
  const commandLog = [];

  await writeJson(path.join(logsDir, "state.json"), state);
  await writeSummary(state);

  for (const phaseState of state.phases) {
    const phase = phaseState.phase;
    const currentArtifacts = await getPhaseArtifacts(repoRoot, phase);

    if (!currentArtifacts.research || options.forceResearch) {
      await runOpencode({
        repoRoot,
        logsDir,
        commandName: "gsd-research-phase",
        commandArgs: [phase],
        phase,
        step: currentArtifacts.research ? "force research" : "research",
        options,
        commandLog,
      });
    } else {
      phaseState.notes.push("reused existing RESEARCH.md");
    }

    const afterResearch = await getPhaseArtifacts(repoRoot, phase);
    if (!options.dryRun && !afterResearch.research) {
      throw new Error(`Phase ${phase} did not produce RESEARCH.md`);
    }

    if (afterResearch.plans.length === 0 || options.forcePlan) {
      await runOpencode({
        repoRoot,
        logsDir,
        commandName: "gsd-plan-phase",
        commandArgs: [phase, "--skip-research"],
        phase,
        step: afterResearch.plans.length > 0 ? "force plan" : "plan",
        options,
        commandLog,
      });
    } else {
      phaseState.notes.push("reused existing PLAN.md files");
    }

    const afterPlan = await getPhaseArtifacts(repoRoot, phase);
    if (!options.dryRun && afterPlan.plans.length === 0) {
      throw new Error(`Phase ${phase} did not produce any PLAN.md files`);
    }

    let gapCycles = 0;
    while (true) {
      await runOpencode({
        repoRoot,
        logsDir,
        commandName: "gsd-execute-phase",
        commandArgs: gapCycles === 0 ? [phase] : [phase, "--gaps-only"],
        phase,
        step: gapCycles === 0 ? "execute" : `execute gap closure ${gapCycles}`,
        options,
        commandLog,
      });

      if (options.dryRun) {
        phaseState.result = "dry-run";
        break;
      }

      const afterExecute = await getPhaseArtifacts(repoRoot, phase);
      if (!afterExecute.verification) {
        phaseState.result = "stopped";
        phaseState.notes.push("missing VERIFICATION.md after execute-phase");
        break;
      }

      const verificationStatus = await readVerificationStatus(afterExecute.verification);
      phaseState.verificationStatus = verificationStatus;
      phaseState.gapCycles = gapCycles;

      if (verificationStatus === "passed") {
        phaseState.result = "passed";
        break;
      }

      if (verificationStatus === "human_needed") {
        phaseState.result = "manual-stop";
        phaseState.notes.push(`human verification required: ${afterExecute.verification}`);
        await writeJson(path.join(logsDir, "state.json"), state);
        await writeSummary(state);
        throw new Error(`Phase ${phase} requires human verification. See ${afterExecute.verification}`);
      }

      if (verificationStatus !== "gaps_found") {
        phaseState.result = "failed";
        phaseState.notes.push(`unexpected verification status: ${verificationStatus ?? "missing"}`);
        break;
      }

      if (gapCycles >= options.maxGapCycles) {
        phaseState.result = "failed";
        phaseState.notes.push(`max gap cycles reached (${options.maxGapCycles})`);
        break;
      }

      gapCycles += 1;
      phaseState.gapCycles = gapCycles;

      await runOpencode({
        repoRoot,
        logsDir,
        commandName: "gsd-plan-phase",
        commandArgs: [phase, "--gaps"],
        phase,
        step: `plan gaps ${gapCycles}`,
        options,
        commandLog,
      });

      const afterGapPlan = await getPhaseArtifacts(repoRoot, phase);
      if (!options.dryRun && (!afterGapPlan.phaseDir || !(await hasGapPlans(afterGapPlan.phaseDir)))) {
        throw new Error(`Phase ${phase} reported gaps but no gap_closure plan was created`);
      }
    }

    await writeJson(path.join(logsDir, "state.json"), state);
    await writeSummary(state);

    if (!["passed", "dry-run"].includes(phaseState.result)) {
      throw new Error(`Stopping after phase ${phase} with result: ${phaseState.result}`);
    }
  }

  process.stdout.write(`\nAll requested phases completed. Summary: ${path.join(logsDir, "summary.md")}\n`);
}

main().catch(async (error) => {
  process.stderr.write(`\nPhase loop stopped: ${error.message}\n`);
  process.exitCode = 1;
});
