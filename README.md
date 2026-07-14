# agent-factory

A fleet-aware generator for persistent autonomous agents that run on the
[agent-portal](https://github.com/robhunter/agent-portal) framework. It stamps
out a new agent repo from a template, allocating a non-colliding port and a
staggered cron slot by inspecting the agents you already have, and wires up a
two-tier state layout so per-cycle churn stays local while durable knowledge is
backed up to the remote.

Each agent is its own repo; the **templates live here**, inside the factory, so
there is one place to evolve the shared shape.

## Usage

```bash
node new-agent.js <name> [options]
```

Example — a research agent for FleetHD work:

```bash
node new-agent.js "FleetHD Research" --repo robhunter/fleethd-research
```

The generator:

1. **Scans the fleet** (the parent directory by default) for existing agents and
   allocates the next free port (`>= 8080`) and a cron minute that doesn't
   collide with theirs.
2. **Materializes the template**, substituting the agent's name, port, cron,
   repo, and timezone.
3. **Sets up the two-tier state layout** (see below) and `git init`s both tiers.
4. **Prints next steps** — create `.env`, onboard via `agentbox`, launch via
   agent-portal's `docker-create.sh`.

### Options

| Option | Default | Purpose |
|---|---|---|
| `--dir <path>` | `<agents-root>/<name>` | Destination directory |
| `--agents-root <path>` | parent of this repo | Fleet to scan + default parent |
| `--template <name>` | `research` | Template under `templates/` |
| `--port <n>` | auto-allocated | Override the port |
| `--cron <expr>` | auto-allocated | Override the cron schedule |
| `--repo <owner/name>` | empty | GitHub repo for the pushed tier |
| `--timezone <tz>` | `America/Los_Angeles` | Agent timezone |
| `--data-policy <p>` | `local-only` | `local-only` or `push-all` |
| `--no-git` | (git on) | Scaffold files without `git init` |

## Two-tier state model

The default `local-only` policy splits an agent's state by **push behavior**,
which is the right axis for a personal fleet (keep durable preferences backed up;
keep noisy per-cycle history local and recoverable):

- **Pushed** — `memory/` (persona, human, values, projects, and self-authored
  `operational.yaml` learnings), `skills/`, code, and config. Committed and
  pushed to the remote every cycle by `scripts/commit.sh`.
- **Local-only** — `data/` (journals, logs, outputs, `today.md`, uploads). Its
  own git repo inside `data/`, snapshotted each cycle by the
  `post-cycle.d/50-commit-data.sh` hook but **never pushed**, so a bad cycle can
  be rolled back (`git -C data reset --hard <yesterday>`) without polluting the
  remote. Human feedback under `data/input/` is not committed at all — this keeps
  human input from fusing into an agent commit at cycle start.

Choose `--data-policy push-all` to get the legacy behavior (everything at the
repo root, committed and pushed), where `dataDir` is `.` and there is no separate
`data/.git`.

## Templates

- **`research`** — a Bobbo-like personal research agent: wakes on a schedule,
  reads memory, does research/work, journals, and notifies sparingly. Ships an
  interactive onboarding conversation (`ONBOARDING.md`) that the agent runs on
  its first `agentbox` session to learn who its human is.

## Development

```bash
npm test   # node unit tests (fleet allocation) + end-to-end generator test
```
