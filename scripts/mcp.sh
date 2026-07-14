#!/usr/bin/env bash
# Test / drive the DevDigest MCP server BY HAND — without an MCP host.
#
# You normally don't need this. The root `.mcp.json` registers the server, so Claude Code
# spawns it over stdio in every session in this repo (approve the trust prompt once, and
# turn it off with `{"disabledMcpjsonServers": ["devdigest"]}` in
# `.claude/settings.local.json`). `./scripts/dev.sh` does NOT start it — it is not a
# long-lived service; the host owns its lifetime.
#
# This script is for the case the host can't cover: driving the protocol yourself while
# changing the server.
#
#   ./scripts/mcp.sh check      # is it wired up? (deps, typecheck, tests, onion)
#   ./scripts/mcp.sh tools      # list the 5 tools over real JSON-RPC (no API needed)
#   ./scripts/mcp.sh inspect    # open the MCP Inspector web UI to click through it
#   ./scripts/mcp.sh call <tool> '<json-args>'   # call one tool for real
#
# Examples:
#   ./scripts/mcp.sh call list_agents '{}'
#   ./scripts/mcp.sh call get_findings '{"repo":"owner/name","pr":3}'
#   ./scripts/mcp.sh call get_blast_radius '{"repo":"owner/name","pr":3}'
#
# NOTE: `call run_agent_on_pr` starts a PAID model call. It is the one tool that spends
# money, so the script asks before it runs.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP="$ROOT/mcp"
API_URL="${DEVDIGEST_API_URL:-http://localhost:3001}"
CMD="${1:-help}"

cd "$MCP"
[ -d node_modules ] || { echo "→ installing mcp deps (first run)…"; npm install --silent; }

# Speak JSON-RPC to the server over stdio and print the result for one request.
# The server's stderr is kept — that is where its logs go; stdout is the protocol frame.
rpc() {
  local body="$1"
  { printf '%s\n' \
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"mcp.sh","version":"1"}}}' \
      '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
      "$body"
  } | DEVDIGEST_API_URL="$API_URL" "$MCP/bin/devdigest-mcp" 2>/dev/null
}

# Spawn the server EXACTLY as the host does — straight from `.mcp.json`, from the repo
# root — and complete a real handshake. This is the check that catches the whole class of
# "failed to connect" bugs, where the config is wrong even though the code is fine: an
# `npx` registry fetch, an unexpanded `${VAR}`, an assumed cwd. Testing the server the way
# YOU like to run it proves nothing about the way the HOST runs it.
handshake_as_host() {
  local cmd env_kv
  cmd=$(cd "$ROOT" && node -e "const s=require('./.mcp.json').mcpServers.devdigest; console.log([s.command,...(s.args||[])].join(' '))")
  env_kv=$(cd "$ROOT" && node -e "const e=require('./.mcp.json').mcpServers.devdigest.env||{}; console.log(Object.entries(e).map(([k,v])=>k+'='+v).join(' '))")
  echo "  spawning: $cmd   (env: ${env_kv:-none}, cwd: repo root)"
  ( cd "$ROOT" && printf '%s\n%s\n%s\n' \
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"mcp.sh","version":"1"}}}' \
      '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
      '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
    | env $env_kv timeout 60 $cmd 2>/dev/null ) \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const m=d.trim().split("\n").filter(Boolean).map(JSON.parse).find(x=>x.id===2);
        if (!m) { console.log("  ✖ the host would report FAILED TO CONNECT — the server never completed a handshake."); process.exit(1); }
        console.log("  ok — handshake complete, " + m.result.tools.length + " tools");
      })'
}

case "$CMD" in
  check)
    echo "→ typecheck";      npx --no-install tsc --noEmit -p tsconfig.json && echo "  ok"
    echo "→ tests";          npx --no-install vitest run 2>&1 | grep -E "Test Files|Tests "
    echo "→ onion boundary"; npx --no-install depcruise --config .dependency-cruiser.cjs src 2>&1 | grep -E "✔|✖"
    # One source of truth: the same script CI runs (stdout purity + domain-ring purity).
    # The old inline grep here lived only in this file, so CI never ran it.
    echo "→ stdout + domain purity"; node scripts/purity-check.mjs || exit 1
    echo "→ API at $API_URL"
    curl_ok=$(node -e "fetch('$API_URL/health').then(r=>r.json()).then(j=>console.log(j.status)).catch(()=>console.log('DOWN'))")
    echo "  $curl_ok $([ "$curl_ok" = "DOWN" ] && echo '(start it with ./scripts/dev.sh — the tools will tell you so too)')"
    echo "→ host handshake (spawns it exactly as Claude Code does, from .mcp.json)"
    handshake_as_host
    ;;

  tools)
    echo "→ tools/list (works with the API down — this is pure protocol)"
    rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node -e '
      let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const m=d.trim().split("\n").map(JSON.parse).find(x=>x.id===2);
        for (const t of m.result.tools) {
          const args=Object.keys(t.inputSchema.properties||{}).join(", ")||"—";
          const w = t.annotations?.readOnlyHint===false ? "  ⚠ WRITE — spends money" : "";
          console.log(`\n  ${t.name}(${args})${w}\n    ${t.description}`);
        }
      });'
    ;;

  call)
    TOOL="${2:?usage: ./scripts/mcp.sh call <tool> '<json-args>'}"
    ARGS="${3:-{\}}"
    if [ "$TOOL" = "run_agent_on_pr" ]; then
      echo "⚠  run_agent_on_pr makes a REAL, BILLED model call, and it blocks until the review finishes."
      read -r -p "   Continue? [y/N] " ok; [ "$ok" = "y" ] || { echo "   aborted."; exit 0; }
    fi
    echo "→ $TOOL $ARGS  (API: $API_URL)"
    rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}" | node -e '
      let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const m=d.trim().split("\n").map(JSON.parse).find(x=>x.id===3);
        if (m.error) { console.error("\nJSON-RPC error:", m.error.message); process.exit(1); }
        if (m.result.isError) console.log("\n  isError: true");
        console.log("\n" + m.result.content.map(c=>c.text).join("\n"));
        if (m.result.structuredContent) {
          console.log("\n---- structuredContent ----");
          console.log(JSON.stringify(m.result.structuredContent, null, 2).slice(0, 2000));
        }
      });'
    ;;

  inspect)
    echo "→ MCP Inspector — opens a web UI (usually http://localhost:6274)"
    echo "  Click 'Connect', then 'List Tools'. You can call each tool by hand from there."
    DEVDIGEST_API_URL="$API_URL" npx -y @modelcontextprotocol/inspector npx tsx src/index.ts
    ;;

  *)
    sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
esac
