/**
 * DOMAIN ring — the import-graph walk behind Blast Radius. PURE: no container,
 * no Drizzle, no fs. It takes edges as plain data and returns plain data.
 *
 * WHY IT WALKS THE GRAPH BACKWARDS. `file_edges` is stored importer → imported
 * (`from_file` imports `to_file`). Blast radius asks the opposite question — "if
 * I change this file, who breaks?" — and that is the set of files that *depend
 * on* it. So we invert the edge set and expand from the changed files outward
 * along `to_file → from_file`. (`file_edges_repo_to_idx` is keyed
 * `(repo_id, to_file)` precisely because this is the direction reads go.)
 *
 * Walking it the natural way instead would answer "what does this file import?",
 * which is the changed file's own dependencies — never affected by the change,
 * and the single easiest way to get this feature backwards.
 */

/** One import edge: `fromFile` imports `toFile`. */
export interface ImportEdge {
  fromFile: string;
  toFile: string;
}

/**
 * Files within `depth` REVERSE import-hops of each seed — i.e. each seed's
 * transitive dependents, nearest first.
 *
 * Returns `seed → dependents`. A seed is never listed as its own dependent, so a
 * self-import (or a cycle back to the seed) cannot make a file its own caller.
 * Cycles terminate: each file is visited at most once per seed.
 */
export function reachableDependents(
  edges: readonly ImportEdge[],
  seeds: readonly string[],
  depth: number,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (depth <= 0 || seeds.length === 0 || edges.length === 0) {
    for (const seed of seeds) out.set(seed, []);
    return out;
  }

  // Reverse adjacency, built ONCE and shared across every seed: imported → importers.
  const dependentsOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = dependentsOf.get(e.toFile);
    if (arr) arr.push(e.fromFile);
    else dependentsOf.set(e.toFile, [e.fromFile]);
  }

  for (const seed of seeds) {
    const found: string[] = [];
    const visited = new Set<string>([seed]); // seeds itself → never its own dependent
    let frontier = [seed];

    for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const file of frontier) {
        for (const dependent of dependentsOf.get(file) ?? []) {
          if (visited.has(dependent)) continue; // cycle guard + dedupe
          visited.add(dependent);
          found.push(dependent);
          next.push(dependent);
        }
      }
      frontier = next;
    }

    out.set(seed, found);
  }

  return out;
}
