'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fleet = require('../lib/fleet');

function mkAgent(root, name, port, cron) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent.yaml'),
    `name: ${name}\nport: ${port}\ncron-schedule: "${cron}"\n`);
  fs.writeFileSync(path.join(dir, 'portal.config.json'), '{}');
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-test-'));
}

test('scanFleet finds only dirs with both config files', () => {
  const root = tmpRoot();
  mkAgent(root, 'alpha', 8080, '0 */2 * * *');
  // A dir with agent.yaml but no portal.config.json is not an agent.
  fs.mkdirSync(path.join(root, 'notanagent'));
  fs.writeFileSync(path.join(root, 'notanagent', 'agent.yaml'), 'name: x\n');
  const agents = fleet.scanFleet(root);
  assert.strictEqual(agents.length, 1);
  assert.strictEqual(agents[0].name, 'alpha');
  assert.strictEqual(agents[0].port, 8080);
});

test('allocatePort returns smallest free port >= 8080', () => {
  const root = tmpRoot();
  mkAgent(root, 'a', 8080, '0 */2 * * *');
  mkAgent(root, 'b', 8081, '30 */2 * * *');
  mkAgent(root, 'c', 8085, '15 */2 * * *');
  const agents = fleet.scanFleet(root);
  assert.strictEqual(fleet.allocatePort(agents), 8082);
});

test('allocatePort skips no gaps when contiguous', () => {
  const agents = [{ port: 8080 }, { port: 8081 }, { port: 8082 }];
  assert.strictEqual(fleet.allocatePort(agents), 8083);
});

test('cronMinute parses simple numeric minute, rejects wildcards', () => {
  assert.strictEqual(fleet.cronMinute('0 */2 * * *'), 0);
  assert.strictEqual(fleet.cronMinute('30 1,3,5 * * *'), 30);
  assert.strictEqual(fleet.cronMinute('*/5 * * * *'), null);
  assert.strictEqual(fleet.cronMinute(null), null);
});

test('allocateCronSchedule avoids used minutes', () => {
  const agents = [
    { cronSchedule: '0 */2 * * *' },
    { cronSchedule: '15 */2 * * *' },
  ];
  const sched = fleet.allocateCronSchedule(agents);
  const minute = fleet.cronMinute(sched);
  assert.ok(![0, 15].includes(minute), `expected staggered minute, got ${minute}`);
  assert.match(sched, /\*\/2 \* \* \*$/);
});

test('empty fleet gets base port and minute 0', () => {
  assert.strictEqual(fleet.allocatePort([]), 8080);
  assert.strictEqual(fleet.cronMinute(fleet.allocateCronSchedule([])), 0);
});
