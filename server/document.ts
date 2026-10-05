/** Shared document protocol: edits apply to stable blocks, never to arbitrary files. */
export interface DocumentBlock { id: string; markdown: string }
export interface DocumentEdit { blockId: string; before: string; after: string; reason: string }
export interface ResearchDocument {
  id: string;
  blocks: DocumentBlock[];
  originalMarkdown: string;
  edits: DocumentEdit[];
  reviewedBlockIds: string[];
  status: 'reviewing' | 'complete' | 'interrupted';
}
export function documentMarkdown(doc: ResearchDocument): string {
  return doc.blocks.map(block => block.markdown).filter(Boolean).join('\n\n');
}
export function createDocument(id: string, markdown: string): ResearchDocument {
  const text = markdown.trim();
  if (!text.startsWith('# ') || text.length < 150 || text.length > 100000) throw new Error('The draft is incomplete or too large to review. Please retry.');
  const blocks = text.split(/\n\s*\n/).map((markdown, i) => ({ id: `block-${i + 1}`, markdown }));
  return { id, blocks, originalMarkdown: text, edits: [], reviewedBlockIds: [], status: 'reviewing' };
}

/** One decision for every block. Empty replacement deletes an unsupported paragraph. */
export function applyReviewDecision(doc: ResearchDocument, value: unknown): DocumentEdit | undefined {
  if (!value || typeof value !== 'object') throw new Error('The editor returned an invalid edit.');
  const edit = value as Record<string, unknown>;
  if (typeof edit.blockId !== 'string' || typeof edit.replacement !== 'string' || typeof edit.reason !== 'string' || !edit.reason.trim() || edit.reason.length > 1000 || edit.replacement.length > 20000) throw new Error('The editor returned an invalid edit.');
  const block = doc.blocks.find(block => block.id === edit.blockId);
  if (!block || doc.reviewedBlockIds.includes(block.id)) throw new Error('The editor referenced an unknown or already reviewed paragraph.');
  const replacement = edit.replacement.trim();
  const change = block.markdown === replacement ? undefined : { blockId: block.id, before: block.markdown, after: replacement, reason: edit.reason.trim() };
  block.markdown = replacement;
  doc.reviewedBlockIds.push(block.id);
  if (change) doc.edits.push(change);
  return change;
}
