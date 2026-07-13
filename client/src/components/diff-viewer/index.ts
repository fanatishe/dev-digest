/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   optional review-finding badges.
   Public surface: the flat DiffViewer, the FileCard it is built from (the Smart
   Diff view composes its own groups out of FileCards), and the two data
   contracts (inline comments · findings). */
export { DiffViewer } from "./DiffViewer";
export { FileCard } from "./FileCard";
export type { DiffCommentApi } from "./comments";
export type { DiffFinding } from "./findings";
