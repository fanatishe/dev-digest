# `@devdigest/mcp` — DevDigest as five MCP tools

A local **MCP server over stdio**. It puts DevDigest's reviewer where a coding agent
already is — inside the repo — so an agent can ask *"what did the reviewer flag on PR
482?"* or *"run the security agent over this PR"* without a human tabbing to
`localhost:3000`.

It reaches DevDigest **only over the existing HTTP API** (`http://localhost:3001` by
default): no server imports, no Drizzle, no DB connection, no auth (the local API has
none). Start the stack with `./scripts/dev.sh` first — every tool needs it.

## The five tools

| Tool | Cost | What it does |
|---|---|---|
| `list_agents` | free | The configured reviewer agents. **Call it first** — it is where a valid `agent` comes from. |
| `run_agent_on_pr` | **PAID** | Runs an agent on a PR, **waits** for it to finish, returns the verdict + findings — in one call. |
| `get_findings` | free | The verdict + findings of a completed review. Defaults to the latest. Never starts a review. |
| `get_conventions` | free | The house-style conventions DevDigest extracted from a repo, with the evidence each was grounded in. |
| `get_blast_radius` | free | Which symbols a PR changes, what calls them, and the endpoints/crons they put at risk. Reads the index built at clone time — no model call. |

Identifiers are forgiving by design: `repo` takes `"owner/name"` **or** a uuid, `pr`
takes a number **or** a uuid, `agent` takes an id **or** a name (case-insensitive).
`resolve.ts` turns all of them into uuids before anything touches the API.

`run_agent_on_pr` is the only write tool and it **spends money**. Its annotations say
so (`idempotentHint: false`), and so does its description — a host that retried it
would bill the user twice. On timeout it does not cancel and does not re-run; it points
you at `get_findings` with the `run_id` you already paid for.

## Use it

The root **`.mcp.json`** registers this server, so every Claude Code session in the repo
starts with the five tools connected. The first session prompts you once to approve it (the
standard trust prompt for a checked-in config that spawns a process); after that it just
works.

The only thing you must start yourself is the API it talks to:

```bash
./scripts/dev.sh        # the API on :3001 — without it, every tool says so and tells you this
```

`dev.sh` does **not** start the MCP server: the **host** spawns it over stdio and kills it
with the session. There is no long-lived process to manage.

**To turn it off**, add the server to `disabledMcpjsonServers` in
`.claude/settings.local.json` — remove the entry to turn it back on:

```json
{ "disabledMcpjsonServers": ["devdigest"] }
```

`/mcp` in a session shows its connection status and tool count; `/context` shows what its
tool definitions cost you (~700–900 tokens for all five).

To load *only* this server and ignore every other MCP source (the GitHub plugin, user-scoped
servers), point the same file at a strict session:

```bash
claude --mcp-config .mcp.json --strict-mcp-config
```

To drive it without Claude Code at all — this is how to test a change:

```bash
./scripts/mcp.sh check                              # deps · typecheck · tests · onion · API health
./scripts/mcp.sh tools                              # the 5 tools, over real JSON-RPC
./scripts/mcp.sh call list_agents '{}'              # call one for real
./scripts/mcp.sh inspect                            # the MCP Inspector web UI
```

`call run_agent_on_pr` prompts first — it is the one tool that spends money.

Env knobs: `DEVDIGEST_API_URL` · `DEVDIGEST_MCP_POLL_MS` (2000) ·
`DEVDIGEST_MCP_RUN_TIMEOUT_MS` (180000) · `DEVDIGEST_MCP_HTTP_TIMEOUT_MS` (30000).

## "Failed to connect"

A host cannot tell a server that **crashed on boot** from one that doesn't exist — both
surface as a bare *"failed to connect"*. So the launch command carries **no unknowns**:

- `.mcp.json` runs **`mcp/bin/devdigest-mcp`**, a launcher that resolves its own directory
  and `exec`s the **local** `node_modules/.bin/tsx`. It installs deps on first run.
- **No `npx -y`** in the launch path: that fetches from the npm registry on *every* spawn,
  needs a writable npm cache, and can outrun the host's ~30s startup timeout.
- **No `${VAR}`** in `.mcp.json`: an unexpanded `${DEVDIGEST_API_URL:-…}` reaches the
  server as a literal, fails `z.string().url()` in `config.ts`, and exits 1 on boot.
- **The launcher is cwd-independent** once it starts: it resolves its own directory, so it
  does not care where it was spawned from. The one residual assumption is the *spawn*
  itself — `.mcp.json` names the **relative** path `mcp/bin/devdigest-mcp`, which the host
  resolves against the project root. Claude Code does start it there; a host that did not
  would fail to find the file. A relative path is the deliberate trade: an absolute one is
  not portable across machines, and `${VAR}` is banned above.

If it still won't connect, reproduce the host's own spawn — this runs the command straight
out of `.mcp.json`, from the repo root, and completes a real handshake:

```bash
./scripts/mcp.sh check          # ends in "host handshake … ok — 5 tools"
```

Then run the launcher by hand to read its **stderr** (stdout is the JSON-RPC frame, so
that is where every diagnostic goes):

```bash
./mcp/bin/devdigest-mcp
# → [devdigest-mcp] ready on stdio · 5 tools · API http://localhost:3001 (poll 2000ms, run timeout 180000ms)
```

## Develop it

```bash
cd mcp
npm install
npm run typecheck
npm test                                   # vitest — no network, no live API
npm run arch:check                         # dependency-cruiser: the onion, mechanically
npm run purity:check                       # the two globals depcruise CANNOT see (below)
npx @modelcontextprotocol/inspector npx tsx src/index.ts   # protocol smoke
```

`typecheck`, `test`, `arch:check` and `purity:check` all run in CI
(`.github/workflows/mcp.yml`). `purity:check` exists because `arch:check` reasons about
**import edges**, and this package's two worst failure modes are **globals**: a
`console.log` (stdout is the JSON-RPC frame — one stray line corrupts it, and the host
reports only an unreadable *"failed to connect"*) and a `fetch()` / `process.env` leaking
into the pure domain ring. Neither has an import to cruise, so depcruise stays green on
both. `purity:check` greps for them and fails the build.

The Inspector line (and `./scripts/mcp.sh inspect`) is the one exception to the `npx` ban
above: the Inspector is a *developer* tool, not the launch path, so fetching it from the
registry is fine — but it does need network, so it is the one documented command that
fails on an offline machine.

The layering, the money rules and the three ways to break the protocol are in
`CLAUDE.md`; the hard-won ones are in `INSIGHTS.md`; the full design (rings, frozen tool
descriptions, error catalogue) is in `../docs/plans/2026-07-13-mcp-server.md`.
