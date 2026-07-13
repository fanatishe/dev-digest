import { z } from 'zod';
import type {
  ConventionCandidate,
  ConventionScanStage,
  ConventionSkillDraft,
  Provider,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import {
  MAX_FILE_LINES,
  renderSamples,
  renderSkillBody,
  toCandidate,
  verifyEvidence,
  type Sample,
} from './helpers.js';

/**
 * Conventions extractor. Scans a repo's cloned files for house-style rules and
 * turns the ACCEPTED ones into a single reusable skill.
 *
 * Pipeline (POST /repos/:id/conventions/extract):
 *   1. Sample selection — PURE, no model: config files + top-ranked source files
 *      (via `repoIntel.getConventionSamples`), read from the clone.
 *   2. Model analysis — one cheap structured call returns rule candidates, each
 *      citing a file + line as evidence.
 *   3. Evidence verification — code-level: the cited file must be one we sampled
 *      and the cited line must exist. Candidates without valid evidence are
 *      DISCARDED (a model can't invent a citation past this gate).
 *   4. Persist survivors (replacing the repo's previous set).
 *
 * The model choice is the workspace's `conventions` feature-model (Settings),
 * falling back to the registry default. See settings/feature-models.ts.
 */

const SAMPLE_COUNT = 12;
/** Root config files worth sampling regardless of rank — they encode explicit rules. */
const CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'package.json',
];
/** The model's raw output — enforced out of band by `completeStructured`. */
const ExtractionResult = z.object({
  candidates: z.array(
    z.object({
      category: z.string(),
      rule: z.string(),
      evidence: z.object({ file: z.string(), line: z.number().int() }),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
type ExtractionResult = z.infer<typeof ExtractionResult>;

const SYSTEM_PROMPT = [
  'You extract a repository\'s house coding conventions from sample files.',
  'A convention is a consistent, project-specific rule a reviewer could enforce on a',
  'pull request — e.g. "all route handlers return a typed Result", "Redis access goes',
  'through one singleton", "async/await instead of .then() chains". Ignore generic',
  'language advice and anything not evidenced by the samples.',
  '',
  'For every rule you report you MUST cite ONE real piece of evidence: the exact file',
  'path (as given in the sample headers) and the 1-based line number where the pattern',
  'is visible. Do not invent files or lines. Prefer fewer, high-confidence rules over',
  'many weak ones. Set confidence in [0,1] by how consistently the sample supports it.',
].join('\n');

/** One pipeline-stage transition, relayed by the route to the server log AND the SSE bus. */
export interface ScanProgressEvent {
  stage: ConventionScanStage;
  status: 'start' | 'done';
  /** Human-readable line, shown verbatim in the client's scan log. */
  msg: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** Persisted candidates for a repo. Undefined when the repo isn't in the workspace. */
  async list(
    workspaceId: string,
    repoId: string,
  ): Promise<ConventionCandidate[] | undefined> {
    const ref = await this.repo.repoRef(workspaceId, repoId);
    if (!ref) return undefined;
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toCandidate);
  }

  async accept(
    workspaceId: string,
    id: string,
    patch: { accepted?: boolean; rule?: string },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidate(row) : undefined;
  }

  async reject(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.remove(workspaceId, id);
  }

  /**
   * Run the full extraction pipeline for a repo and return the verified,
   * persisted candidates. Undefined when the repo isn't in the workspace.
   *
   * `onProgress` reports each stage as it STARTS and as it FINISHES. The start events
   * are what make the UI honest: `analyze` (the model call) dominates the wall clock, so
   * without a "starting" event the client would sit silent for most of the scan.
   */
  async extract(
    workspaceId: string,
    repoId: string,
    onProgress?: (e: ScanProgressEvent) => void,
  ): Promise<ConventionCandidate[] | undefined> {
    const ref = await this.repo.repoRef(workspaceId, repoId);
    if (!ref) return undefined;

    const start = (stage: ConventionScanStage, msg: string) =>
      onProgress?.({ stage, status: 'start', msg });
    const done = (stage: ConventionScanStage, msg: string) =>
      onProgress?.({ stage, status: 'done', msg });

    // 1. Sample selection — pure, no model.
    start('sample', `Sampling files from ${ref.fullName}…`);
    const samples = await this.collectSamples(repoId);
    done('sample', `Sampled ${samples.length} file(s) from ${ref.fullName}`);
    if (samples.length === 0) {
      await this.repo.replaceForRepo(workspaceId, repoId, []);
      return [];
    }

    // 2. Model analysis — the slow stage. Resolve the model up front so the "starting"
    //    event can name it (the user is about to wait on this one).
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    start('analyze', `Analyzing ${samples.length} file(s) with ${model}…`);
    const raw = await this.analyze(provider as Provider, model, samples);
    done('analyze', `Model returned ${raw.length} candidate(s)`);

    // 3. Evidence verification — discard anything not grounded in a sampled file/line.
    start('verify', 'Verifying evidence against the sampled files…');
    const byPath = new Map(samples.map((s) => [s.path, s.content]));
    const verified = raw.flatMap((c) => {
      const grounded = verifyEvidence(c, byPath);
      return grounded ? [grounded] : [];
    });
    done('verify', `${verified.length} of ${raw.length} candidate(s) survived evidence verification`);

    // 4. Persist survivors (full replacement of the repo's prior set), stamped with the
    //    clone HEAD we just read them at so the client can deep-link the evidence to the
    //    exact commit (line numbers can't drift). Null sha → the card renders no link.
    start('persist', 'Saving conventions…');
    const evidenceSha = await this.currentHead(ref);
    const rows = await this.repo.replaceForRepo(
      workspaceId,
      repoId,
      verified.map((v) => ({ workspaceId, repoId, evidenceSha, ...v })),
    );
    done('persist', `Saved ${rows.length} convention(s)`);
    return rows.map(toCandidate);
  }

  /**
   * The clone's HEAD sha. Best-effort: a clone that isn't a git repo (or was never
   * cloned) must not fail an otherwise-good extraction — we lose the deep-link, not
   * the conventions. Mirrors `safeCurrentHead` in repo-intel's full pipeline.
   */
  private async currentHead(ref: { owner: string; name: string }): Promise<string | null> {
    try {
      return (await this.container.git.currentHead({ owner: ref.owner, name: ref.name })) || null;
    } catch {
      return null;
    }
  }

  /**
   * Build an unsaved skill draft merging this repo's ACCEPTED conventions into one
   * `<repo>-conventions` skill body. Undefined when the repo isn't in the workspace.
   * Nothing is persisted — the client edits then confirms via `POST /skills`.
   */
  async skillDraft(
    workspaceId: string,
    repoId: string,
  ): Promise<ConventionSkillDraft | undefined> {
    const ref = await this.repo.repoRef(workspaceId, repoId);
    if (!ref) return undefined;
    const accepted = (await this.repo.listByRepo(workspaceId, repoId)).filter((r) => r.accepted);
    const name = `${ref.name}-conventions`;
    return {
      name,
      description: `${accepted.length} house convention${accepted.length === 1 ? '' : 's'} extracted from ${ref.name}`,
      type: 'convention',
      merged_count: accepted.length,
      body: renderSkillBody(name, ref.name, accepted),
    };
  }

  // -- pipeline steps -------------------------------------------------------

  /** Config files + top-ranked source files, read from the clone (missing files skipped). */
  private async collectSamples(repoId: string): Promise<Sample[]> {
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_COUNT);
    const paths = [...CONFIG_FILES, ...ranked];
    const seen = new Set<string>();
    const out: Sample[] = [];
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      const content = await this.container.repoIntel.getFileContent(repoId, path);
      if (content == null || content.trim() === '') continue;
      out.push({ path, content });
    }
    return out;
  }

  /** One structured model call over the sampled files → raw candidates. */
  private async analyze(
    provider: Provider,
    model: string,
    samples: Sample[],
  ): Promise<ExtractionResult['candidates']> {
    const llm = await this.container.llm(provider);
    const res = await llm.completeStructured<ExtractionResult>({
      model,
      schema: ExtractionResult,
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: renderSamples(samples) },
      ],
    });
    return res.data.candidates;
  }
}
