'use strict';

// fleet.js — inspect the existing agent fleet so a new agent gets a
// non-colliding port and a staggered cron slot. No external dependencies:
// agent.yaml is read with narrow regexes (we only need three scalar fields),
// which is more robust here than pulling in a YAML parser.

const fs = require('fs');
const path = require('path');

const BASE_PORT = 8080;

// A directory is an "agent" if it has both an agent.yaml and a
// portal.config.json at its root — the pair every agent-portal agent ships.
function isAgentDir(dir) {
  return (
    fs.existsSync(path.join(dir, 'agent.yaml')) &&
    fs.existsSync(path.join(dir, 'portal.config.json'))
  );
}

function readField(yamlText, field) {
  // Matches `field: value` or `field: "value"` at line start (top-level key).
  const re = new RegExp('^' + field + ':[ \\t]*(.*)$', 'm');
  const m = yamlText.match(re);
  if (!m) return null;
  let v = m[1].trim();
  v = v.replace(/\s+#.*$/, '').trim(); // strip trailing comment
  v = v.replace(/^["']/, '').replace(/["']$/, ''); // strip quotes
  return v;
}

// Scan an agents-root directory, returning one descriptor per discovered agent.
function scanFleet(agentsRoot) {
  const agents = [];
  let entries;
  try {
    entries = fs.readdirSync(agentsRoot, { withFileTypes: true });
  } catch {
    return agents;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(agentsRoot, ent.name);
    if (!isAgentDir(dir)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(dir, 'agent.yaml'), 'utf8');
    } catch {
      continue;
    }
    const portRaw = readField(text, 'port');
    const port = portRaw != null ? parseInt(portRaw, 10) : NaN;
    agents.push({
      dir,
      name: readField(text, 'name') || ent.name,
      port: Number.isFinite(port) ? port : null,
      cronSchedule: readField(text, 'cron-schedule'),
    });
  }
  return agents;
}

// Smallest free port >= BASE_PORT not already taken by a fleet member.
function allocatePort(agents) {
  const used = new Set(agents.map((a) => a.port).filter((p) => p != null));
  let port = BASE_PORT;
  while (used.has(port)) port += 1;
  return port;
}

// Parse the leading minute field of a 5-field cron expression.
function cronMinute(schedule) {
  if (!schedule) return null;
  const first = schedule.trim().split(/\s+/)[0];
  const n = parseInt(first, 10);
  return String(n) === first ? n : null; // only simple numeric minutes count
}

// Pick a wake minute that spreads load across the fleet. Research agents run
// every 2 hours; we stagger the MINUTE so many agents don't wake at :00 and
// stampede the host. Walk candidate minutes {0,15,30,45,7,22,...} and take the
// first not already in use; fall back to a deterministic spread if all collide.
function allocateCronSchedule(agents, everyHours = 2) {
  const usedMinutes = new Set(
    agents.map((a) => cronMinute(a.cronSchedule)).filter((m) => m != null)
  );
  const candidates = [0, 15, 30, 45, 7, 22, 37, 52, 3, 18, 33, 48];
  let minute = candidates.find((m) => !usedMinutes.has(m));
  if (minute == null) minute = (agents.length * 13) % 60;
  return `${minute} */${everyHours} * * *`;
}

module.exports = {
  BASE_PORT,
  isAgentDir,
  scanFleet,
  allocatePort,
  cronMinute,
  allocateCronSchedule,
};
