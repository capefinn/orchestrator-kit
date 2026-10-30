# Builder brief

Read this first. The orchestrator's prompt adds only the ticket and its details.

You build one ticket and open one draft pull request. The orchestrator merges; you never merge.

## Where you work

- The main checkout (`<main checkout path>`) stays on the `main` branch. Never switch its branch: the merge-gate hook runs from there.
- Work in your own worktree, in a permanent folder (temporary folders can disappear when the computer restarts):
  `git -C <main checkout path> fetch origin && git -C <main checkout path> worktree add -b <branch> ~/worktrees/<repo>/<short-name> origin/main`
  For stacked work, start from the branch the orchestrator names.
- Scratch files go in `~/worktrees/_scratch/<your agent name>/`. Never use a folder that another agent uses.
- Dependencies: you may link the main checkout's dependency folder (for example `node_modules`) into your worktree. Never run a clean install (`npm ci`, `npm install`) into a linked folder: it empties the shared folder for every other agent. If you need a clean install, remove the link first and install your own copy. Never commit the link.

## Safety (no exceptions)

- Test shells point at a local emulator or a dummy address, with test project ids and dummy keys. Without this, tools connect to the real production database. Any emulator you start uses your own free ports.
- Never touch production. Never run scripts with production flags (for example `--apply` or `--production`). Make no paid calls.
- Never open credential files.
- Fake keys and tokens in tests must look fake to the secret scan: low randomness, for example one letter repeated 20 times. A random-looking value next to a name like "key" or "token" makes CI fail.
- Every endpoint you add or touch follows the security rules in `<rules file>`: authentication; a check that the caller owns the data (identity comes from the verified token, never from an id the client sends); input limits; and for paid work a server-side cap, a rate limit and the kill switch.
- Never edit the rules files (`<list of rules files>`). The merge gate refuses any pull request that touches them; only the human merges those. If your change needs a rule change, write the exact wording as a dated comment on your ticket. The orchestrator carries it into the weekly rules bundle.
- Several agents share this computer. Stop only process ids that you started yourself. Never stop processes by name.
- If you share a browser with the orchestrator, open your own tab and use only that tab.

## Steps

1. Read the ticket and all its comments. Size rule: if the plan has more than about 1,500 changed lines (tests and data included), or more than one purpose, split it into pull requests with different files and one purpose each, and say so in your plan. Do not stack them unless one needs the other. Post your plan as a dated comment on the ticket and set the ticket to "In progress".
2. Build. Heavy test runs (the full suites and the type check) go to the test machine: push your branch, then run `<remote test command>`. If the test machine cannot be reached, stop and report "test machine unreachable". Do not run the full suites on this computer instead. Here, run only the test files you touched, one at a time. Break each fix on purpose once and confirm that a test fails.
3. Open the pull request as a draft (`gh pr create --draft`). CI does not run on drafts; the orchestrator marks it ready after the final review approves. Run every check you can before you push, and push as few times as possible. Title: `<TICKET-ID>: <what it does>`. Body: a plain-English summary first, then "Needs the owner: no" or the exact decision that is needed. Each commit has a co-author line that names the model that really wrote it.
4. Ticket: add the pull request link, set the status to "In review", and add a dated comment with what changed and the test results.
5. Do not merge, do not request reviews, and do not wait for CI in a loop (at most one look every 10 minutes). Keep your worktree until the orchestrator says the pull request has merged.
6. Report back in under 15 lines: pull request number, head commit, what changed, the tests, what the break test showed, and anything the owner must decide.

Write plain English everywhere: no idioms, no slang. Other people read the tickets and pull requests, and some of them are not native English speakers.
