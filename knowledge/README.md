# Shared evidence-backed claims

AutoWiki's shared ontology represents **source assertions**, rather than declaring
that an extracted sentence is true. Articles, timelines, concept maps and GeoJSON
are projections over the same immutable claim revisions. The philosophy controls
admission under a versioned policy key; it does not change the underlying ontology.
The AI subject requires **Schematic primary evidence** (`schematic@2`): every
factual article line is compiled from an admitted factoid. Sources remain captured
documents; extraction is selective, not a claim that every source sentence has
been represented. Other policies do not inherit these admissions.

The design borrows from the historical evidence implementation reviewed in
`../history`, whose configured remote is `yueranyuan/history`: its
[`italia.ttl`](https://github.com/yueranyuan/history/blob/main/data/ontology/italia.ttl),
claim/evidence schema, revision admissions and spatial-role queries. AutoWiki uses
typed JSON and local SQLite for this first implementation; it does not implement
that project's full RDF/SHACL ontology or historical interpretation workflow.

## Records and projections

- **Entity:** a stable identity and type, such as a researcher, paper, organization,
  model, benchmark, technique, hardware, law or place. Similar labels do not merge
  identities. Unresolved entities remain proposed.
- **Source capture:** an original URL, retrieval time, classification rationale,
  extracted text and its SHA-256. This checksum describes the extracted text,
  not raw HTML or a PDF. The current reader captures at most 14,000 characters.
- **Claim revision:** one sentence, a controlled predicate and typed arguments,
  modality/attribution, evaluation conditions, optional temporal bounds, explicit
  spatial role, uncertainty and conflicting claim IDs. Corrections append a new
  revision referencing the previous one; evidence and old revisions remain intact.
- **Evidence use:** an exact quotation and character offsets into a capture,
  marked as supporting, contradicting or contextual evidence. Substring agreement
  alone does not establish support for the statement or its structured fields.
- **Audit and approval:** an independent model pass checks every candidate. Only
  supported candidates enter draft projections. A separate human decision binds
  to the exact revision digest; the model cannot grant it. Approval is scoped to
  the recorded policy. Conflicting claims can coexist without majority voting.

A shared claim can describe multiple entities. Its revision can therefore change
several entity articles and relationships at once. Each generated article records
its revision dependencies and gets sentence citations from the same captures.
`GET /api/knowledge/impact` reports stale registered article projections. Existing
free-form prose articles keep their current contents; they have not been migrated
or silently rewritten. Projections with too little evidence cannot fabricate a
full article to satisfy the existing article validator.

`shared/schematic.ts` declares and enforces each predicate's allowed subject and
object entity types, required roles and role cardinality. Literals have explicit
text/number/boolean/date types. Properties must use registered shapes; numeric
properties require compatible registered units, and measured results require
attribution and evidenced conditions. Unknown properties require a maintainer to
add a shape, rather than accepting an arbitrary prose placeholder. An AI evidence
audit checks the meaning of every field; schema compliance does not itself prove
truth or global logical consistency.

The host rejects additional prose, changed claims, missing or reordered pins and
wrong citation identities. Every final line must exactly match its bound supported
revision. The same shape validator runs during intake, storage, bundle admission
and projection. Human approval remains a separate exact-content gate.

Timelines use evidenced event/condition dates, with precision and open bounds.
Publication and retrieval dates are not automatically event dates. Undated claims
remain outside the timeline. The coordinate view requires numeric latitude and
longitude explicitly labeled in supporting evidence; a place name is insufficient.
Concept edges come from explicit claim arguments. These limits deliberately avoid
invented dates, inferred map pins and relationships based only on matching names.

## Local source intake

Open **Shared knowledge** in the local app. Supply an original source URL to
extract candidates, then audit them in a second model request. The page shows the
source, pending candidates and audit outcomes; committed draft views update from
an event cursor. Company specifications and scores remain attributed statements,
not independently replicated results. Source classification is itself an AI
assessment and must be checked during human moderation.

Hover a shared claim, timeline entry or sentence in a generated claim article to
preview its supporting source. The exact quoted passage is highlighted inside
bounded surrounding captured text. Click/tap or Enter pins the preview, and Escape
or Close dismisses it. Only the inspected instance is highlighted. Preview reads
invoke no model or source re-fetch. Revision digests bind previews to the displayed
statement; invalid anchors or capture checksums fail closed. Public catalogue
previews show the approved quote with a context-availability label when the full
capture is intentionally omitted.

Host limits apply to requests, runtime, output size, entities, claims and evidence
anchors. Failed attempts count against the selected allowance. Interrupted tasks
retain their capture, extraction and completed audit, belong to the signed-in
ChatGPT account and resume with a fresh explicit allowance. Viewing or projecting
records invokes no model. This is explicit source intake, not a background feed
subscription or a claim of exhaustive coverage of a source. With `schematic@2`,
ordinary topic research automatically collects original evidence, extracts typed
candidates, audits their quotations and meaning, removes unsupported candidates
in the live document, then renders the admitted factoids. It performs a completion
check and can collect more evidence within the same request allowance. Interrupted
topic tasks retain their child source-task checkpoints; continuing reserves a new
explicit allowance and reuses completed extraction/audit work. One allowance is
shared across search, selection, extraction, audit and completion calls. Each topic
task is bounded to eight sources, 24 hosted search operations, 160 candidate
revisions and 120 live document blocks; final article views cap at 80 claims. Source
selection is also capped by the chosen allowance, reserving extraction and audit
requests for every selected source rather than declaring completion after a short lead.
The local Codex comparison adapter remains available for other philosophies;
schematic research currently uses the standard engine. Earlier prose and earlier
claim-policy records remain distinct and gain no new approval or classification.

Inspect a claim and, only after human review, approve its exact local revision:

```sh
volter world run -- npm run knowledge:review -- inspect REVISION_ID
volter world run -- npm run knowledge:review -- approve REVISION_ID DIGEST HUMAN_REVIEWER
```

The second command is a human approval action. Local approval does not publish or
supply a GitHub publication receipt. There is no agent-facing approval endpoint.
The private database and full captured text remain under `.data/knowledge.sqlite`.

## GitHub review and publication

Export a subject's history, or one source task and its required prior revisions:

```sh
volter world run -- npm run knowledge:export -- ai
volter world run -- npm run knowledge:export -- ai SOURCE_TASK_UUID
```

The export is a bounded packet (160 KB, eight captures, 200 revisions). It includes
entities, immutable revisions, audits, capture hashes and passage anchors; full
captured text, account identities, credentials and local approvals are omitted.
`changes/` accepts one JSON file per PR. Bundles use the existing admission gateway
and **100 submissions per GitHub user per UTC day** quota, counted per changed PR
head, rather than per fact. Uploaded approval arrays confer no authority. No AI
runs in Actions.

The local article reader's **Contribute** action downloads the exact article's
factoid dependencies and their history/conflict closure as a bundle. It omits full
captures and local approvals. Schematic prose uploads are rejected by both the
community validator and GitHub contribution parser, even if clients attach claim
IDs. The public schematic articles are generated solely from admitted bundles.

Use the existing `review:prepare` workflow locally. It independently re-fetches
each source, verifies the captured-text checksum and quote offsets, and presents
the full evidence for review. Changed or unavailable source text stops approval
until a fresh bundle is prepared. Review every sentence, entity identity,
relationship, date, coordinate, qualification, abuse concern and source policy.
Then explicitly approve the exact PR bytes using the report's command.

Merge and Pages release remain separate manual actions. The public build admits
only bundles with a trusted approval receipt matching their exact path and bytes.
It derives several cited entity articles from those admitted revisions, credits
the contributors and includes the shared records in the catalogue. One approved
bundle can update several generated articles in that explicit release. Previously
published prose does not automatically change. Subject forks copy code and their
subject configuration, with no claims, captures, approvals or account data.

The three AI demo articles are migrated through `npm run demo:migrate`. Each original
sentence has an independent preserve/correct/omit decision in `demo/migrations/`;
schema failures can receive one correction round within the same allowance. Original prose stays in
`demo/archives/`. Validated unapproved bundles and checksummed source captures seed
local previews on a fresh checkout, while Pages consumes only approved
`knowledge/changes/` bundles. Section headings are host-controlled navigation; every
body sentence binds exactly one audited immutable revision.

The operator migration has a shared hard cap of 60 model requests across resumptions
and a 30-minute runtime per invocation. Checkpoints are private and account-bound.
Use `volter world run -- npm run demo:migrate`; restarting reuses completed source
batches, audits and valid retained extraction output rather than paying to replay them.
Every original sentence needs a completed initial audit; optional corrections stop
at the cap. The host records exclusions for missing topic relationships or the
80-fact article limit, retaining additional audited detail in the knowledge bundles.

An article may include facts about a related technique or variant only through
an explicit audited relationship path (at most three edges and twelve additional
revision pins). Negated and proposed relationships cannot establish that scope.
Those relationship pins travel with exports, require human approval in approved
views, and participate in dependency invalidation; the agent cannot invent an
article participant to bypass relevance checks.
