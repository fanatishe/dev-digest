# Examples — Good vs. Bad Structure

Concrete patterns for [SKILL.md](SKILL.md), grounded in DevDigest `client/` idioms.
Focus is **placement/structure**, not component internals (see `react-best-practices`).

---

## 1. Thin page → view component

**✅ Good** — `app/agents/page.tsx` delegates; all logic is colocated.

```tsx
// app/agents/page.tsx
import { AgentsListView } from "./_components/AgentsListView";

// Route: /agents. Thin entry — view, its modal, styles, constants, helpers and
// i18n are colocated under _components/AgentsListView.
export default function AgentsPage() {
  return <AgentsListView />;
}
```

**❌ Bad** — page owns data fetching, state, and markup. Not reusable, not testable in
isolation, and it bloats the routing layer.

```tsx
// app/agents/page.tsx
export default function AgentsPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery(...);            // fetching in the routing layer
  const filtered = data?.filter(a => a.name.includes(q));  // business logic in JSX file
  return <div style={{ padding: 24 }}>{/* 150 lines of markup */}</div>;
}
```

---

## 2. Component folder anatomy

**✅ Good** — one folder, files added only as needed.

```
_components/AgentCard/
├── AgentCard.tsx        # component
├── AgentCard.test.tsx   # colocated test
├── index.ts             # barrel (single re-export)
├── constants.ts         # MODEL_COLOR lookup
├── helpers.ts           # modelColor() — pure, testable
└── styles.ts            # s = { card, headerRow, … }
```

```ts
// index.ts — cheap single-export barrel (house style, fine)
export { AgentCard, AgentCard as default } from "./AgentCard";
```

```ts
// constants.ts — static lookup, no logic
export const MODEL_COLOR: Record<string, string> = {
  "gpt-4o": "#10b981",
  o1: "#f59e0b",
};
```

```ts
// helpers.ts — business logic extracted out of the component, unit-testable
import { MODEL_COLOR } from "./constants";
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}
```

```tsx
// AgentCard.tsx — orchestrates; imports its constants/helpers/styles
"use client";
import { Icon, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({ ag, onToggle }: { ag: Agent; onToggle?: (v: boolean) => void }) {
  const del = useDeleteAgent();
  const color = modelColor(ag.model);           // logic via helper, not inline
  return <div style={s.card(color)}>{/* … */}</div>;
}
```

**❌ Bad** — everything in one file: inline color map, inline styles, ad-hoc logic,
no test seam.

```tsx
export function AgentCard({ ag }) {
  const color = { "gpt-4o": "#10b981", o1: "#f59e0b" }[ag.model] ?? "#888"; // constant inline
  return <div style={{ padding: 14, border: "1px solid #333" /* … */ }}>{ag.name}</div>;
}
```

---

## 3. Data fetching lives in `lib/hooks`, never in a component

**✅ Good** — component calls a hook; the hook owns the query; `api.ts` owns the network.

```ts
// lib/hooks/agents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent } from "@devdigest/shared";

export function useAgents() {
  return useQuery({ queryKey: ["agents"], queryFn: () => api.get<Agent[]>("/agents") });
}
export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}
```

```tsx
// _components/AgentsListView/AgentsListView.tsx
const { data: agents, isLoading } = useAgents();   // one line; testable by mocking the hook
```

**❌ Bad** — `fetch` in the component. Duplicates auth/error/caching, couples UI to the
transport, and makes the component impossible to test without a live network.

```tsx
export function AgentsListView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    fetch("http://localhost:3001/agents").then(r => r.json()).then(setAgents); // ❌
  }, []);
}
```

---

## 4. Route-scoped vs. shared — promote only on the second consumer

**✅ Good** — `AgentCard` is only used on `/agents`, so it stays colocated. `diff-viewer`
is used by multiple screens, so it lives in `src/components/`.

```
app/agents/_components/AgentCard/       # one route → colocated
src/components/diff-viewer/             # many routes → shared
```

**❌ Bad** — a component used once, parked in `src/components/` "in case it's reused."
Now an unrelated screen's code lives far from where it's used, and the shared folder is a
junk drawer.

```
src/components/AgentCard/   # only /agents uses it → premature sharing
```

---

## 5. Barrel files — cheap re-export ✅ vs. aggregation barrel ❌

**✅ Good** — per-component single re-export (stable import path, tree-shake friendly).

```ts
// _components/AgentCard/index.ts
export { AgentCard, AgentCard as default } from "./AgentCard";
```

**✅ Good** — the design system's public edge is the sanctioned barrel.

```tsx
import { Button, Badge, Icon } from "@devdigest/ui";   // never deep-import past it
```

**❌ Bad** — a wide app-internal aggregation barrel. Wildcard re-exports defeat
tree-shaking, bloat the bundle, slow the dev server, and cause circular imports.

```ts
// components/index.ts  ❌
export * from "./AgentCard";
export * from "./diff-viewer";
export * from "./app-shell";
// …then `import { AgentCard } from "@/components"` pulls the whole folder graph.
```

Import the file you need instead: `import { AgentCard } from "@/components/AgentCard"`.

---

## 6. Contracts & strings come from one source

**✅ Good**

```tsx
import type { Agent } from "@devdigest/shared";        // server-owned Zod contract
const t = useTranslations("agents");
return <button>{t("delete")}</button>;                 // string from messages/<locale>
```

**❌ Bad**

```tsx
type Agent = { id: string; name: string; model: string };  // ❌ redeclared local shape
return <button>Delete</button>;                            // ❌ hard-coded UI literal
```

---

## 7. Where each kind of code landed (quick recap)

| Thing | Landed in |
|-------|-----------|
| `/agents` route entry | `app/agents/page.tsx` (thin) |
| Agents screen | `app/agents/_components/AgentsListView/` |
| A card within it | `app/agents/_components/AgentCard/` |
| `modelColor()` logic | `AgentCard/helpers.ts` |
| `MODEL_COLOR` table | `AgentCard/constants.ts` |
| Card styles | `AgentCard/styles.ts` |
| List/delete queries | `lib/hooks/agents.ts` |
| Network call | `lib/api.ts` |
| `Agent` type | `@devdigest/shared` |
| "Delete" label | `messages/en/agents.json` |
| Diff viewer (multi-route) | `src/components/diff-viewer/` |
