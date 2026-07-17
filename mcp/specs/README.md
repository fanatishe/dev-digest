# mcp/specs — tool contracts & feature specs

The MCP server's contract of record is [`tools.md`](tools.md): the five tools this server
registers, **exactly as shipped** — when it and the code disagree, the code wins and the file
is a bug. Document here the tool-level invariants that outlive any single implementation.

`mcp/CLAUDE.md` points here with "Read when… the tools, their frozen descriptions and the design".

Feature specs here are authored by the [`spec-creator`](../../.claude/agents/spec-creator.md)
agent (EARS acceptance criteria + boundaries; behaviour, not code). Cross-module specs live in
the top-level [`spec/`](../../spec/README.md).
