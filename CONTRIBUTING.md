# Contributing research

A search can become a contribution: research locally and review the result. The AI wiki requires **Schematic primary evidence**. Export **Contribute → Download factoid bundle for GitHub** and put that JSON file under `knowledge/changes/` in a pull request. Every claim needs a permitted schematic shape and exact evidence; cited prose or invented claim IDs cannot bypass the bundle validator. Change factoids to correct an article; article prose is generated from those records. Earlier prose drafts do not qualify without fresh extraction and audit.

Other research philosophies may export **Download article for GitHub** to `articles/`. Keep code and research changes in separate PRs. See [the claim workflow](knowledge/README.md). Both paths retain the same quota, exact-byte local approval and manual publication gates.

Comment `/submit` on the PR. The admission workflow uses the PR author's immutable GitHub account ID. Each distinct head revision consumes one of 100 slots per UTC day; rerunning an unchanged revision is idempotent. A maintainer can also trigger admission manually. The ledger lives on `wiki-ledger`, with append-only, non-force updates that retry concurrent conflicts. No cache or transient artifact is the authoritative counter. It limits admitted research, not the number of PRs or lightweight workflow invocations someone can cause.

## Local moderation and explicit approval

No GitHub Action makes AI calls. A maintainer fetches the article **as data**, never checks out or executes the contributor's code:

```
volter world run -- npm run review:prepare -- OWNER/REPO PR_NUMBER
```

The command validates the article and its citations, retrieves evidence from approved source providers, and writes a private local report. Open the printed loopback URL while the local app is running. For a shared-claim bundle, preparation also checks source capture hashes and exact passage anchors. Check every sentence and structured entity/relationship/date/location for support, check the research philosophy, promotional manipulation, abuse, misleading framing, and copyrighted copying. Citation presence alone does not prove accuracy. No paid moderation service runs during preparation.

The report contains the exact approval command. Run it only after finishing the review. It rechecks the current PR and emits `/approve COMMIT_SHA CONTENT_SHA256` using your GitHub account. Actions requires repository write/maintain/admin permission and validates both hashes before storing the approval. This is a maintainer attestation, not proof that a human read the report. Maintainers are trusted; credentials and branch rules must protect that authority.

Merge remains an explicit maintainer action. Pages publication is another manual workflow dispatch. The build rejects any article or claim bundle without an approved receipt matching its exact path and bytes, including changed files after review. Nothing is deployed merely because a search, PR, comment, approval, or merge occurred.

## Repository configuration before enabling contributions

1. Set `github/site.json` to the chosen `OWNER/REPO`; retain `publication: manual`.
2. Push the reviewed project to a repository, then explicitly initialize its ledger using `npm run github:setup-ledger -- OWNER/REPO`. This refuses to overwrite an existing ledger.
3. Protect the default branch: require a PR, require the `WikiChat / local approval` status for article submissions, block force pushes and deletion, and limit bypass authority. Code/infrastructure changes are reviewed and tested locally by a maintainer, who records a distinct infrastructure-review status using the scoped App. The article admission workflow intentionally refuses them. The required PR and App-issued local approval are the gates; a second GitHub reviewer is optional, not required.
4. Protect `wiki-ledger` from deletion, force pushes, and human edits; permit only the installed `volter-autowiki-admission` GitHub App's controlled writes. Inspect account/ruleset support before enabling the gate. A ledger reset would reset quotas and is never an automated repair.
5. Configure Pages to use GitHub Actions and restrict the `github-pages` environment to the default branch. Add a required deployment reviewer when supported. Only maintainers should have workflow dispatch and merge authority.
6. Public comment-triggered admission is disabled by default. Configure billing controls first, then set repository variable `WIKICHAT_PUBLIC_ADMISSION=true`. Maintainers can test admission through manual dispatch before enabling public triggers. A quota check cannot prevent the initial Actions invocation; repeated comments can still consume Actions minutes.
7. Keep AI/email/cloud credentials out of Actions. Use standard hosted runners, short timeouts, and a GitHub Actions budget with stop-usage enabled where available. These workflows do not call paid AI, but Actions/API quotas and provider limits still apply.

The ledger is initially a bounded JSON file; tooling refuses oversized responses. At large scale it needs sharding, not silent truncation or removal of quota history. Public repo submissions and quota/approval history are public; do not include private data. Public GitHub account IDs identify accounts, not unique people, so multiple accounts remain possible.

## Licensing

The code and article content need explicit licenses before this is advertised as open source/open content. No blanket license has been applied without the owner's choice. The vendored Sign in with ChatGPT devkit has its own noncommercial license in `vendor/siwc/LICENSE`; it cannot be relicensed by this project. Sources retain their original licenses. Do not copy entire source texts into published article files.

The private admission App (ID 5181636) is installed only on `volter-ai/autowiki`. `AUTOWIKI_APP_PRIVATE_KEY` is an encrypted repository secret. Workflow tokens are scoped to this one repository, expire automatically, and are revoked when the job ends. The App cannot change repository settings or workflows.
