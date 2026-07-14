#!/usr/bin/env node
'use strict';

// new-agent.js — generate a new persistent agent from a template.
//
// Fleet-aware: scans the agents-root for existing agents and allocates a
// non-colliding port and a staggered cron slot. Materializes the chosen
// template with the agent's identity, sets up the two-tier state layout
// (pushed main repo + local-only data/ git for "reset to yesterday"), and
// prints next steps. No external dependencies.
//
// Usage:
//   node new-agent.js <name> [options]
//
// Options:
//   --dir <path>           destination (default: <agents-root>/<name>)
//   --agents-root <path>   fleet dir to scan + default parent (default: parent of this repo)
//   --template <name>      template under templates/ (default: research)
//   --port <n>             override allocated port
//   --cron <expr>          override allocated cron schedule
//   --repo <owner/name>    GitHub repo for the agent's pushed tier (default: empty)
//   --timezone <tz>        default: America/Los_Angeles
//   --data-policy <p>      local-only (default) | push-all
//   --no-git               skip git init for both tiers (scaffold files only)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const fleet = require('./lib/fleet');

const FACTORY_ROOT = __dirname;

function parseArgs(argv) {
  const opts = {
    template: 'research',
    timezone: 'America/Los_Angeles',
    dataPolicy: 'local-only',
    git: true,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dir': opts.dir = argv[++i]; break;
      case '--agents-root': opts.agentsRoot = argv[++i]; break;
      case '--template': opts.template = argv[++i]; break;
      case '--port': opts.port = parseInt(argv[++i], 10); break;
      case '--cron': opts.cron = argv[++i]; break;
      case '--repo': opts.repo = argv[++i]; break;
      case '--timezone': opts.timezone = argv[++i]; break;
      case '--data-policy': opts.dataPolicy = argv[++i]; break;
      case '--no-git': opts.git = false; break;
      case '-h': case '--help': opts.help = true; break;
      default:
        if (a.startsWith('--')) { throw new Error(`Unknown option: ${a}`); }
        positional.push(a);
    }
  }
  opts.name = positional[0];
  return opts;
}

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Recursively copy `src` → `dest`, replacing tokens in file contents.
function copyTree(src, dest, tokens) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyTree(s, d, tokens);
    } else if (ent.isFile()) {
      let text = fs.readFileSync(s, 'utf8');
      for (const [k, v] of Object.entries(tokens)) {
        text = text.split(k).join(v);
      }
      fs.writeFileSync(d, text);
      // Preserve executability for shell scripts.
      if (ent.name.endsWith('.sh')) fs.chmodSync(d, 0o755);
    }
  }
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// Commit everything currently staged/unstaged, with an identity fallback so a
// host without global git config still succeeds (these commits are cosmetic).
function gitInitCommit(cwd, message) {
  git(cwd, ['init', '-q']);
  git(cwd, ['add', '-A']);
  const idArgs = [];
  let hasName = false;
  try { hasName = !!execFileSync('git', ['config', 'user.name'], { cwd }).toString().trim(); } catch { /* none */ }
  if (!hasName) {
    idArgs.push('-c', `user.name=${process.env.GIT_AUTHOR_NAME || 'agent-factory'}`);
    idArgs.push('-c', `user.email=${process.env.GIT_AUTHOR_EMAIL || 'agent-factory@localhost'}`);
  }
  git(cwd, [...idArgs, 'commit', '-q', '-m', message]);
}

function writeFileTokens(destPath, srcPath, tokens) {
  let text = fs.readFileSync(srcPath, 'utf8');
  for (const [k, v] of Object.entries(tokens)) text = text.split(k).join(v);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, text);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.name) {
    console.log('Usage: node new-agent.js <name> [--dir p] [--template research] ' +
      '[--port n] [--cron expr] [--repo owner/name] [--timezone tz] ' +
      '[--data-policy local-only|push-all] [--no-git]');
    process.exit(opts.help ? 0 : 1);
  }

  const name = slugify(opts.name);
  if (!name) throw new Error(`Invalid agent name: "${opts.name}" slugifies to empty.`);
  if (name !== opts.name) console.log(`Note: using slug "${name}" (from "${opts.name}").`);

  if (!['local-only', 'push-all'].includes(opts.dataPolicy)) {
    throw new Error(`--data-policy must be local-only or push-all (got "${opts.dataPolicy}").`);
  }

  const agentsRoot = path.resolve(opts.agentsRoot || path.dirname(FACTORY_ROOT));
  const dest = path.resolve(opts.dir || path.join(agentsRoot, name));
  const templateDir = path.join(FACTORY_ROOT, 'templates', opts.template);

  if (!fs.existsSync(templateDir)) throw new Error(`No template "${opts.template}" at ${templateDir}`);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    throw new Error(`Destination ${dest} already exists and is not empty.`);
  }

  // Fleet-aware allocation.
  const agents = fleet.scanFleet(agentsRoot);
  const port = opts.port || fleet.allocatePort(agents);
  const cron = opts.cron || fleet.allocateCronSchedule(agents);

  const dataDir = opts.dataPolicy === 'local-only' ? 'data' : '.';
  const statePrefix = opts.dataPolicy === 'local-only' ? 'data/' : '';

  const tokens = {
    __AGENT_NAME__: name,
    __AGENT_PORT__: String(port),
    __CRON_SCHEDULE__: cron,
    __AGENT_REPO__: opts.repo || '',
    __TIMEZONE__: opts.timezone,
    __DATA_DIR__: dataDir,
    __STATE__: statePrefix,
  };

  console.log(`\nGenerating agent "${name}"`);
  console.log(`  template:     ${opts.template}`);
  console.log(`  destination:  ${dest}`);
  console.log(`  port:         ${port}${opts.port ? ' (override)' : ' (allocated)'}`);
  console.log(`  cron:         ${cron}${opts.cron ? ' (override)' : ' (allocated)'}`);
  console.log(`  data policy:  ${opts.dataPolicy}`);
  console.log(`  fleet seen:   ${agents.length} existing agent(s)`);

  // 1. Copy the template tree (excluding today.md, which is state and belongs
  //    under the data dir, not the repo root).
  copyTree(templateDir, dest, tokens);
  const templateToday = path.join(dest, 'today.md');
  if (fs.existsSync(templateToday)) fs.rmSync(templateToday);

  // 2. Main-repo .gitignore.
  const baseIgnore = [
    '# Credentials', '.env', '.env.*', '',
    '# Node', 'node_modules/', '',
    '# Python', '__pycache__/', '*.pyc', '.venv/', 'venv/', '',
    '# OS / editor', '.DS_Store', '*.swp', '*.swo', '.idea/', '.vscode/', '',
    '# Ephemeral', '*.tmp', '*.bak', '',
  ];
  if (opts.dataPolicy === 'local-only') {
    baseIgnore.push('# Local-only data tier (its own git repo, never pushed)', '/data/', '');
  } else {
    baseIgnore.push('# Churn not worth pushing', 'logs/cycles/*.log', 'logs/supervisor.log',
      'logs/*.pid', 'pending_notification.txt', '');
  }
  fs.writeFileSync(path.join(dest, '.gitignore'), baseIgnore.join('\n'));

  // 3. State skeleton under <dataDir>.
  const stateDir = dataDir === '.' ? dest : path.join(dest, 'data');
  for (const sub of ['journals', 'logs/cycles', 'output', 'uploads', 'input/feedback/processed']) {
    fs.mkdirSync(path.join(stateDir, sub), { recursive: true });
    fs.writeFileSync(path.join(stateDir, sub, '.gitkeep'), '');
  }
  writeFileTokens(path.join(stateDir, 'today.md'), path.join(templateDir, 'today.md'), tokens);

  // 4. git init — main (pushed) tier, then local-only data tier.
  if (opts.git) {
    gitInitCommit(dest, `chore: scaffold ${name} from agent-factory ${opts.template} template`);

    if (opts.dataPolicy === 'local-only') {
      // The data tier keeps its OWN history and is never pushed. Human feedback
      // and verbose cycle logs are excluded from it entirely.
      const dataIgnore = [
        '# Human feedback — never committed (avoids fusing human input into',
        '# agent commits at cycle start).', 'input/', '',
        '# Verbose per-cycle logs and transient files.',
        'logs/cycles/', 'pending_notification.txt', '*.tmp', '',
      ].join('\n');
      fs.writeFileSync(path.join(stateDir, '.gitignore'), dataIgnore);
      gitInitCommit(stateDir, 'chore: initialize local-only data tier');
    }
  }

  // 5. Next steps.
  console.log('\nDone. Next steps:');
  console.log(`  1. cd ${dest}`);
  console.log('  2. Create .env (GH_TOKEN + git identity) — see SETUP.md');
  console.log('  3. Onboard interactively:  agentbox');
  console.log('  4. Launch persistent:      bash ../agent-portal/scripts/docker-create.sh .');
  if (opts.repo) {
    console.log(`\n  Remote not configured. To publish the pushed tier:`);
    console.log(`    git -C ${dest} remote add origin https://github.com/${opts.repo}.git`);
  }
}

try {
  main();
} catch (err) {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}
