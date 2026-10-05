# WikiChat — GitHub edition

The active publishing design uses article JSON files, GitHub pull requests, a persistent 100-revisions/account/day ledger, local source review, exact-content approval receipts, and manually dispatched GitHub Pages releases. No Actions workflow calls a model. The staging repository is `volter-ai/autowiki`. It is private, public admission and publication are gated, and nothing has been deployed. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full review and setup process.

Run `volter world run -- npm run pages:build` to build the static reader. Until approved articles are merged, its catalog is empty. The local researcher at port 4317 now exports GitHub contribution files, and `/community` shows the static reader.

Verification uses five focused tests in `test/core.test.ts`. Both local and Pages production builds pass, and `actionlint` accepts both workflows. Browser checks verified the static reader and GitHub contribution dialog. GitHub Pages uses a manual workflow and a required deployment reviewer. No site is released until the local review cycle and explicit release approval are complete.

The Cloudflare implementation below is retained as historical prototype code; it is not the active contribution or deployment path. Its deploy command is disabled.

# WikiChat

A local research app and a shared encyclopedia with a Wikipedia-inspired reading experience. Choose a research philosophy and use your ChatGPT plan to synthesize an article from live sources. Every prose sentence must have a supporting citation. A second AI pass edits the draft as a structured document, with changes visible in place and recorded in View history. Completed articles can be exported or submitted to the shared library for moderation.

## Run locally

Requires Node.js 22+, npm, and the Volter CLI (`npm install -g @volter/world`).

```sh
npm ci
volter world up
volter world run -- npm run dev
```

Open **http://127.0.0.1:4317**. Click **Connect ChatGPT**, then **Continue with ChatGPT**, then **Open ChatGPT sign-in**. Complete sign-in and grant ChatGPT plan usage in the browser. The app discovers the models available to your account. Choose a model, enter a topic, and select Research.

The app uses the new [Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) personal/local-app flow, not Codex authentication or a ChatGPT backend endpoint. An eligible ChatGPT plan and granted plan-usage permission are required. You can manage usage or disconnect inside the app. No API key or client secret is needed.

For a production build:

```sh
volter world run -- npm run build
volter world run -- npm start
```

Stop the app with Ctrl+C before running `volter world down`. The World has no selected vendor substitutions: Wikipedia and ChatGPT are intentionally live integrations. Do not put real credentials in `.volter/` or inject them into the World environment.

The community preview adds local Cloudflare D1/R2 emulation and a fake email mailbox; OpenAI moderation is exercised with credential-free test fixtures. Coverage detection lists Cloudflare, OpenAI, and Resend as unsubstituted vendors. No twin coverage is claimed for these integrations, and production API calls need separate deployment verification.

## Data and authentication

- Draft documents: `.data/drafts/`, with the original text, stable paragraph IDs, review status, and edits. Interrupted reviews remain drafts and do not enter the library.
- Articles: `.data/articles/`, ignored by Git. Research content is local plaintext; remove the folder to clear your library while the app is stopped.
- Encrypted ChatGPT profiles and installation ID: `~/.config/wiki-chat/chatgpt/`, outside the project and World configuration.
- Encryption: AES-256-GCM; key stored under service `wiki-chat` in the OS credential store via `@napi-rs/keyring`. No plaintext fallback. macOS uses Keychain; other platforms need a working supported system credential store.
- The loopback server binds only to `127.0.0.1`, checks Host and Origin, and requires a session CSRF token for mutations. OAuth credentials never enter the frontend.
- Sign-in uses OpenAI's official local devkit with documented local adapters, vendored because `@siwc/local` is not published on npm. Its license and pinned upstream revision are in `vendor/siwc/`.
- The writer streams a first draft, then the app saves a document. The editor receives that document plus the same source excerpts and must return a review decision for every block. Each streamed replacement updates the visible document. View history shows before/after text and the stated reason.
- Both model calls must receive `response.completed`. The final document must contain valid source IDs and a citation on every prose sentence before it can enter the library. A stopped, incomplete, malformed, or uncited review is retained as an interrupted draft.
- Structural validation checks citation coverage, not truth. The second model pass compares claims against supplied excerpts, but that is not independent verification. Standard research uses a user-selected allowance (default eight model requests and eight minutes), reserved by AutoWiki before each model call. After editing, it checks for evidence gaps and may search and review again. It stops when no further evidence is requested, when searches make no progress, or when the allowance is exhausted. Incomplete work requires an explicit continuation with a new allowance. Request counts are enforceable; they are not exact token or dollar caps.

## Research scope

Version 2 presets are Independent research, Primary sources only, Scientific literature, Independent sources, and Competing perspectives. Custom standards are supported. Version 1 articles retain their original Wikipedia/reference-based standards; old Wikipedia-backed drafts must be restarted to use independent evidence.

Standard research uses hosted web search through the existing ChatGPT connection to discover candidate URLs, then AutoWiki independently downloads their HTML/text evidence. Wikipedia/Wikimedia sources are excluded. Search summaries and model-invented excerpts are not evidence. Each page fetch permits HTTPS only, resolves and pins a public IP on every redirect, rejects private/reserved addresses, sends no app credentials, and limits redirects, time, and body size. Scripts, navigation and other page furniture are stripped. PDFs and pages requiring login or browser execution currently fail closed.

The evidence-selection pass applies the chosen philosophy and records a rationale shown in the Sources tab. Primary status, publisher ownership and relevance are model judgments, not guarantees from domain suffixes. Competing perspectives asks for substantive counterevidence without manufactured balance. Scientific literature retains Europe PMC journal abstracts and its life-sciences emphasis. Each page contributes at most 14,000 characters; the collection is bounded, not exhaustive. Empty or inaccessible results never fall back to Wikipedia. Search and selection calls consume the same user-set model-request allowance as writing and editing. Hosted search is cancelled if it reports more than three operations in a request; this is not a provider-side billing cap (`max_tool_calls` is unsupported on the SIWC route).

GitHub local review re-fetches original public pages through the same guarded fetcher. It still discards uploader excerpts and requires explicit human approval of the exact revision and standards. The legacy Cloudflare moderation prototype cannot retrieve arbitrary web pages and remains disabled.

Up to six initial source excerpts are used, with at most two additional excerpts selected through bounded follow-up searches. Citation coverage does not establish truth; models can miss factual errors. The overview-effect example is prewritten and explicitly labeled. Failed, cancelled, and incomplete runs are never saved as completed research.

## Publishing on GitHub

Use **Contribute → Download article for GitHub** after the local editing pass. Submit the JSON in an article-only PR and comment `/submit`. Follow [CONTRIBUTING.md](CONTRIBUTING.md) to prepare the local evidence report, approve the exact revision, merge, and manually release Pages.

Configured staging repository: [volter-ai/autowiki](https://github.com/volter-ai/autowiki). The admission App is restricted to this repository. Its ledger branch permits only App writes; the default branch requires a PR and the App-issued local approval status. The Pages environment requires explicit approval by `yueranyuan` and accepts only `main`.

A repository-scoped Actions budget is set to **$0**, with **Stop usage** enabled, in the enterprise billing controls. Standard runners can use included minutes; these workflows hold no paid AI credentials and make no model calls. Public comment-triggered admission remains disabled during staging. The 100-revisions/account/UTC-day quota controls accepted submissions, not the initial Actions invocation.

GitHub identities provide contributor credit and account-based quotas, not proof of a unique person. The earlier Cloudflare prototype's endorsements and reputation scores are not part of the GitHub reader. All publications require local source and abuse review; no hosted AI moderation service is configured.

The Cloudflare prototype remains in `community/` for reference. Its deployment command is disabled and it is not the active publishing path.

## Verification

```sh
volter world run -- npm test
volter world run -- npm run build
```

The five automated checks cover typed article evidence, the selected research allowance, the 100-submissions-per-user daily quota, exact-content publication approval, and a full application smoke test. The smoke starts the real local server, serves the app, streams a schematic research draft, removes an unsupported claim in the audit, inserts a licensed article illustration with credit, rejects an unlicensed candidate, and preserves its exact approval through the knowledge export, and reads the saved article back through HTTP. It uses fake model responses, source and Commons metadata fixtures, and disposable local storage; no paid calls or real credentials. Keep additional tests limited to concrete failures that these checks cannot catch; inspect cosmetic changes visually.

The community browser check completed local email sign-in, article submission (100 → 99 remaining), a private held state, fresh source retrieval, moderator approval, and the free reader with contributor credit and missing-philosophy links. The local Worker runtime caught and verified fixes for redirect handling and D1 search escaping that native Node/SQLite tests did not expose. A local QA article remains in the preview library. No production email, moderation API, or CDN publication was performed.

## Upstream code

`vendor/siwc/src/` is derived from OpenAI's [Sign in with ChatGPT devkit](https://github.com/openai/sign-in-with-chatgpt-devkit). Its noncommercial license is retained in `vendor/siwc/LICENSE`; consult that license before redistribution or commercial use. Local extensions are recorded in `vendor/siwc/AUTOWIKI-PATCHES.txt`. The rest of this project is independently authored app code.

## Optional local Codex engine

Choose **Local Codex · comparison preview** in the Research engine selector.
The standard research engine stays the default. Install Codex CLI 0.160.0 (the
version tested here); protocol upgrades need revalidation. No Docker is used.
AutoWiki launches a private `codex app-server --listen stdio://` child, authenticates
with the existing ChatGPT connection, and stores resumable thread history outside
the repository in `~/.config/wiki-chat/app-server/`. This history contains research
text; tokens are supplied only to the child environment, never to the renderer or
thread files. Each new child obtains refreshed credentials through the sign-in
client. Interrupted tasks appear under **Interrupted research**.

AutoWiki supplies the philosophy-filtered evidence collection. The engine returns
structured title, heading, and paragraph blocks; the existing Wikipedia layout
renders them. Its second turn proposes edits to stable document blocks. The host
checks citation coverage, content shape, edit IDs, and completion before saving a
finished article. Live accepted edits are checkpointed; resuming reviews only the
remaining blocks. A lost process resumes its saved thread but restarts an unfinished
draft turn. No automatic retry loop runs.

Host limits per task: eight cumulative inference minutes, four turns including
resumes, zero agent tool calls, 80 draft blocks, and 150,000 output characters per
turn. Shell, browser, apps, and subagents are disabled; app-server runs read-only
with network disabled for tools. AutoWiki rejects capability requests and stops the
child. The host retrieves sources; the agent cannot publish, run GitHub commands,
change the layout, or access contributor credentials. These are limits on accepted
work and process runtime, not a guaranteed exact token or dollar ceiling.

Run an explicit comparison of the writing/editing core using the same source snapshot, philosophy, and model (follow-up discovery is excluded from this fixed-evidence benchmark):

```sh
volter world run -- node --import tsx scripts/compare-engines.ts Observatory general
```

This makes at most two normal inference turns per engine and records latency,
provider-reported usage, output, and citation coverage under `.data/comparisons/`.
Review every claim against the saved excerpts to score citation accuracy; coverage
alone is not accuracy. The comparison never changes the default or publishes.
The GitHub 100-submission quota and local moderation/release gates remain separate.

First comparison (2026-10-04 UTC, Observatory / General reference / GPT-6-Astra):

| Engine | Two-pass elapsed time | Reported input / output tokens | Total tokens | Supported sentences in excerpt audit |
| --- | ---: | ---: | ---: | ---: |
| Current direct | 99.9 s | 4,687 / 2,381 | 7,068 | 27 / 27 |
| Local app-server | 98.9 s | 19,603 / 2,326 | 21,929 | 26 / 26 |

App-server reported 7,680 cached input tokens. This is one bounded sample, with a
Codex claim-by-claim review rather than an independent human accuracy assessment.
Both original runs completed the model turns but failed the shared validator on
“Griffith J. Griffith”; saved outputs pass after the initials segmentation fix,
without another inference run. App-server used approximately 3.1 times as many
reported tokens with similar elapsed time, so the current engine remains default.
The private detailed audit is in `.data/comparisons/0a1fd8d4-78bf-42bf-b853-1a665297b248/report.json`.

## Follow-up evidence and image discovery

The standard engine inspects its reviewed draft and can request up to two focused
source searches and one Wikimedia Commons image search before another review. Queries are
validated as bounded data; AutoWiki performs guarded retrieval under the
original research philosophy. At most eight source excerpts reach the editor, and
existing citation IDs never change. A conservative topic-word overlap check rejects clearly unrelated follow-up hits; it is not a semantic relevance guarantee. Empty, unavailable, or unsuitable search
results do not relax the philosophy. The editor must remove unsupported claims.
Each discovery cycle adds one bounded planning request within the user-selected request and runtime allowance. The optional Codex engine retains its eight-minute task timeout. Standard research repeats within the explicit allowance and stops on insufficient progress.

Up to three Commons matches are licence-filtered, and one that passes a bounded model relevance check becomes a lead illustration inside the article. It loads as the
article fills out, with the original file link, author credit and licence. Captions
are file labels rather than unaudited factual prose; relevance still needs human review. Missing or unrelated matches leave the article without an
image. Only raster images with CC BY, CC BY-SA, CC0 or public-domain metadata pass
the filter. Commons assets are illustrations, not Wikipedia evidence.

Selected images travel with article exports and entity-bound knowledge bundles.
Local moderation displays the image and requires review of relevance, abuse, credit
and the original licence. Exact-content approval covers the image selection too;
changing an image invalidates approval. The Pages reader permits thumbnails only
from the two trusted Wikimedia thumbnail hosts. No images or articles are published
automatically, Image selection adds one model turn within the user’s allowance; an unavailable check leaves the article without an image.

Next research-quality priorities: sentence-to-evidence inspection, explicit
contradictions and coverage gaps, and source
freshness checks. These are roadmap items, not implemented features.

The live local page shows the topic immediately, source records as providers return them, and draft paragraphs in document order. Stable block IDs preserve the document through review and completion; independent edit highlights fade with reduced-motion support. Local browser replay verifies these transitions without model calls or publishing fixtures.

## AI subject wiki demo

The local main page is **AI Wiki**: a 96-topic map in 12 areas (researchers, papers,
research directions, labs, startups, products, models, benchmarks, techniques,
hardware, law/policy, and data/infrastructure). Topic labels are an editorial
research backlog, not factual articles or an assertion of comprehensive coverage.
Selecting a missing topic prepares the form; only **Research article** starts
metered work. Local articles remain distinct from approved Pages content. Portable, unapproved demo
articles live in `demo/articles/`; their source excerpts and account data are omitted.

The AI wiki requires `schematic@2`: every factual article line is generated from
a typed, independently audited factoid with an exact captured quote. Prose JSON,
even with citation markers or purported factoid IDs, cannot qualify for this
philosophy. Contributions must use a validated bundle in `knowledge/changes/`.
Earlier `primary-reporting@2` drafts remain readable but require fresh extraction
and review to meet the current AI wiki standard; they are not silently migrated.

This philosophy admits original evidence and original reporting. The source selector must classify each admitted page and explain its
basis using the fetched excerpt. Aggregation, commentary and Wikipedia are not
qualifying evidence. Company assertions remain attributed; preprints, benchmark
conditions and legal status need explicit qualification. Classification is an AI
assessment; the human publication review must verify it against the source.

`subjects/ai.json` defines the map and required philosophy. `github/site.json`
selects the landing subject with `defaultSubject`. A dedicated subject repository
also sets `subjectId`: the local research endpoint and GitHub admission/publication
parser then reject articles with a different subject or philosophy. Scope relevance
is assessed during local human moderation; an ID alone does not prove relevance.

Create a standalone local subject repository (supply your intended repository):

```sh
volter world run -- npm run subject:fork -- ai ../my-ai-wiki OWNER/REPOSITORY
```

Or pass a JSON manifest in the same format instead of `ai`. The exporter copies
tracked source, creates a new Git repository without a remote, and configures its
subject. It copies no local drafts, credentials, article approvals or publication
ledger. Stage new source files before exporting from an uncommitted checkout.
Install dependencies and start the new repository in its own World. Configure its
own GitHub App, protected branches, ledger and Pages reviewers before enabling
contributions, following `SUBJECT-WIKI.md` and `CONTRIBUTING.md`. No GitHub repository
is created and nothing is pushed or deployed by this command.

Each subject repo retains **100 submissions per GitHub user per UTC day**, with
explicit local approval of exact article bytes. This is a per-repository quota;
forks do not share a global account allowance. Model requests and runtime remain
bounded separately, and reading or browsing the topic map invokes no model.

Mapped topics may include up to four `startingSources` URLs, such as a paper's
original abstract or a project's own documentation. These are fetched through the
same public-address guard and classified alongside search results; a maintained
link is not automatic evidence approval. The writer and completion checker must
keep the requested subject distinct from variants and recent controversies.

## Shared claim ontology

**Shared knowledge** in the local reader adds a source-first research path: an
original source becomes located claim revisions, receives an independent evidence
audit, and feeds cited entity articles, a timeline, explicit concept relationships
and evidenced coordinates. The shared records retain immutable history and bind
human approvals to exact revisions. Under the schematic philosophy the standard
research engine uses this path automatically, shows candidates and audit edits,
then checks completion against the same selected request/runtime allowance.
Other philosophies retain prose research. No new prose can enter a schematic article.

See [knowledge/README.md](knowledge/README.md) for the ontology, history-project
inspiration, source-task resumption, local review and GitHub bundle workflow. One
source bundle uses one existing submission slot; it cannot publish without explicit
local moderation and the separately approved Pages release.

The LoRA, H100 and SWE-bench reading-room demos use the schematic path too. Their
original sentences, correction reasons and source quote bindings are retained in
`demo/migrations/`, `demo/archives/`, `demo/knowledge/` and `demo/captures/`. Local
startup verifies capture checksums and all bindings before importing them as
unapproved previews; these fixtures cannot enter the published catalog without
the same explicit local moderation and publication receipts as any contribution.
