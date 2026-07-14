/**
 * TRANSPORT ring — the body of the `get_blast_radius` stub, and nothing else.
 *
 * The message IS the tool (plan §5.5), so it is data, not a string literal buried in a
 * handler: it has to be assertable, and it has to have exactly ONE source of truth.
 * That source is `NOT_IMPLEMENTED_BLAST` in the pure domain ring (`errors.ts`, WP0),
 * where the rest of the "errors lead onward" catalogue lives and is tested. This file
 * only appends the precise pointers a person needs to *do* the exercise — the two
 * artefacts that already exist, with file and line. Composing beats copying: a second
 * copy of the prose would drift from the first the day either is edited.
 *
 * Cost note: unlike a tool *description*, this text is not loaded at chat start. It is
 * only ever paid for by a model that actually called the stub — i.e. by exactly the
 * caller who needs the instructions. That is why it can afford to be precise.
 */
import { NOT_IMPLEMENTED_BLAST } from '../errors.js';

/** Where the two halves that already exist live. Only the HTTP route is missing. */
export const BLAST_RADIUS_POINTERS = [
  'This is the course exercise, left deliberately unfinished. Both halves already exist:',
  '  · the engine   — server/src/modules/repo-intel/service.ts:220',
  '                   container.repoIntel.getBlastRadius(repoId, changedFiles)',
  '  · the contract — server/src/vendor/shared/contracts/brief.ts  (the `BlastRadius` Zod schema)',
  'What is missing is the HTTP route between them: repo-intel/routes.ts exposes only',
  'GET /repos/:id/index-state and POST /repos/:id/resync, and this MCP server reaches',
  'DevDigest over HTTP only — so it physically cannot call the engine.',
].join('\n');

/**
 * The whole handler body. `NOT_IMPLEMENTED_BLAST` states the situation and the three
 * steps; the pointers say precisely where. Both end where every error in this package
 * ends (P4): naming the next tool to call.
 */
export const BLAST_RADIUS_STUB_MESSAGE = [NOT_IMPLEMENTED_BLAST, '', BLAST_RADIUS_POINTERS].join(
  '\n',
);
