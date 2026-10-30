# Orchestrator guide (single file)

This kit describes how we run a software build with one AI "orchestrator" session. The orchestrator plans the work and gives it to cheaper AI builders. A stronger model reviews every change. A script refuses any merge that does not have that review. The human owner is asked only a short, named list of questions.

We share it as an example to copy and adapt. It is not a product, and it does not need any of our code. Sections 1 to 4 explain how the building works and why. Section 5 shows how the same setup makes content: articles, videos, decks and other material. Section 6 has the lessons we learnt, and section 7 the technical setup.


> This file holds the whole kit in one document: the guide first, then every kit file as an appendix. Where the guide names a file such as `agents/builder.md`, find the appendix with that name below. If you do not use Claude Code, read the header block at the top of an agent or skill appendix as "the model tier and tools this session gets", and the rest as the instructions to give that session.

## What is in this folder

| File | What it is |
|---|---|
| `README.md` | This guide |
| `skills/orchestrator/SKILL.md` | The start-of-day routine for the orchestrator chat |
| `skills/orchestrator-handover/SKILL.md` | The end-of-day routine: stop work safely, write the handover, send the daily message |
| `agents/builder.md` | The builder agent: one ticket, one draft pull request |
| `agents/builder-brief.md` | The shared rules every builder reads first |
| `agents/final-reviewer.md` | The final reviewer agent |
| `agents/design-agent.md` | The hard-design agent: writes design notes, never code |
| `templates/handover.md` | The handover file that the next day starts from |
| `templates/todo-card.md` | One card on the human's to-do list |
| `templates/notion-setup.md` | How we set up the build board and the decision list in Notion, and how agents connect to them |
| `templates/merge-gate-hook.md` | What the merge gate checks, in pseudocode, and how to install it |
| `templates/merge-gate.example.mjs` | A trimmed example of the merge gate as a Claude Code hook |
| `LICENSE` | The MIT licence: you may copy, change and reuse everything here, if you keep the copyright notice |

Text in angle brackets, like `<main checkout path>`, is a placeholder for you to fill in.

---

## 1. What an orchestrator is, and why we use one

An orchestrator is one AI chat session that runs the building work for a human owner. The human decides **what** to build and **why**. The orchestrator decides **how**. It writes the plan on the ticket, starts builder agents, has each change reviewed, merges it, checks that it works in production, and sends the human one message a day.

### Why we set it up

Before the orchestrator, every change that an AI wrote waited for the owner to read the review and press "merge". Many changes waited a day or more, and some waited several days. Every plan for a change of more than one file also waited for the owner's approval. Reading code reviews was not a good use of the owner's time, and the waiting slowed everything down.

With an orchestrator:

- **The human decides only a short, named list of things** (money, what customers see, and a few more; see section 4). Everything else is decided, done and reported.
- **Quality does not depend on the human reading code.** An independent reviewer on a stronger model reads every change and runs the tests. A script refuses any merge that has no approving review on the exact commit being merged.
- **Cost stays under control.** The expensive model plans, reviews and decides. Cheaper models write the code.

### What it is not

- It does not remove the need for rules. It needs more written rules than a human team, because every agent starts with no memory. We keep the rules a person must remember on one page, and we let machines (CI and the merge gate) enforce the rest.
- It does not make the human's decisions. When a plan touches one of the human's areas, the orchestrator asks and takes the next ticket meanwhile.

---

## 2. The roles

Each role is a separate AI session or agent with its own instructions. The model tier matters: it decides most of the cost.

| Role | Model tier (what we use) | What it does | What it never does |
|---|---|---|---|
| **Human owner** | – | Decides the areas in section 4. Reads one daily message and one to-do list. | Reviews code. |
| **Orchestrator** | Strongest (Opus) | Picks the next ticket, writes the plan on it, starts builders and reviewers, decides the merge order, merges through the gate, checks production, keeps the ticket board current, writes the handover, talks to the human. | Writes the code it then reviews. |
| **Builder** | Mid-priced (Sonnet) | Builds one ticket in its own worktree, runs the tests, opens one draft pull request, reports in under 15 lines. Up to about six run at the same time. | Merges. Edits the rules files. |
| **Final reviewer** | Strongest (Opus), fresh session | Reviews the change, runs the tests on the change merged with current main, posts one verdict for the exact head commit. Security-sensitive changes get two reviewers. | Edits code. Merges. Reviews code it wrote. |
| **Clerk** | Mid-priced or small (Sonnet or Haiku) | Mechanical work: the merge steps after CI is green, the after-merge checks, ticket comments, to-do cards. | Makes decisions. |
| **Scout** | Small (Haiku) | Look-ups, file searches, read-only research. Reports a short answer. | Changes anything. |
| **Hard-design agent** | Deep-reasoning (Fable; Opus works too) | Solves one hard design problem: a ticket that failed review twice, a change to a locked data contract, a hard data, money or security question. Writes a design note with options and a recommendation. | Writes code. |
| **Workflow improver** | Mid-priced (Sonnet) | About once a week: measures where tokens, money and waiting time go (from session logs and pull request history), reads current guidance on agent workflows, and proposes a short ranked list of changes. | Edits rules, skills or code. Proposes removing a safety guardrail to save tokens. |

---

## 3. The daily loop

### Start of day

The human opens a new orchestrator chat and types one command (`/orchestrator`). The orchestrator:

1. checks that no other orchestrator chat is running (two orchestrators once worked on the same pull request within minutes of each other);
2. reads yesterday's handover file, as a list of things to check, not as facts;
3. reads the live state: open pull requests, CI results and review verdicts from GitHub, with a status command; the queue on the ticket board; and what the human answered overnight on the to-do list;
4. sends the human at most 8 lines: what changed and is live (with the proof in a few words), the top 3 to 5 items for today, and only new questions;
5. starts work without waiting for a reply.

### Plan on the ticket

For each ticket the orchestrator writes a short plan as a comment on the ticket: what changes, which files, which tests, the risks, and how to undo it. Builders, reviewers and people can all read it there. If the plan touches one of the human's areas, it becomes a question to the human (section 4), and the orchestrator takes the next ticket meanwhile.

**Size rule:** if a plan has more than about 1,500 changed lines (tests and data included), or more than one purpose, it is split into several pull requests with different files and one purpose each.

### Build in worktrees

Each builder works in its own git worktree: a separate folder with its own branch, sharing one repository. It starts from the current main branch. Builders work on parts of the code that do not overlap, so their pull requests do not clash.

The builder prompt is short: "Read the builder brief first and follow it", then only the ticket, the files, any review findings, and what "done" means. The builder runs the tests (heavy runs on a separate test machine), opens a **draft** pull request, updates the ticket, and reports back. It never merges.

### Final review on the exact head commit

A new final-reviewer session, on the strongest model, reviews each pull request. It:

- writes down the head commit (the latest commit of the pull request); its verdict is only for that commit;
- tests the pull request merged with the current main branch, not only its own branch;
- for a bug fix, puts the bug back and checks that a test fails ("break the fix");
- checks, in order: does it do what the ticket asks; does it touch one of the human's areas without a recorded decision; security; money (no spending path without a cap); locked data contracts; deploy effects; customer-facing text;
- posts one comment with the verdict and a hidden marker that the merge gate reads:
  `<!-- final-review verdict=approved sha=<full 40-character commit> model=<model id> -->`

Any new push needs a new review. A change to security-sensitive files needs two approving reviews. After a small fix, a scoped re-review checks only that the finding is fixed and nothing else changed. After two rounds of "changes needed", the orchestrator stops fixing the code and re-plans the design, usually with the hard-design agent.

### Merge through the gate

When the review approves, the orchestrator marks the pull request ready. This starts CI (our CI does not run on drafts). The orchestrator waits for CI in the background, then a clerk merges with:

```
gh pr merge <number> --squash --delete-branch --match-head-commit <reviewed commit>
```

The merge gate is a hook: a small script that Claude Code runs before every shell command. It allows the merge only if the pull request is not a draft, targets main, has every required CI check green, has an approving verdict marker on its head commit from an allowed model (two for sensitive files), and does not change the rules files. `--match-head-commit` makes the merge fail if anyone pushed after the review.

### After-merge checks

After each group of merges, a clerk checks:

- the website deploy of the new main commit finished;
- if backend code changed: the build of the last merged commit succeeded, the new server version is live, and the health address answers;
- the database security rules in production are the same as on main;
- the changed feature works in production (read-only where possible);
- if a screen changed: a screenshot goes to the human, with a one-line caption.

The ticket then moves to Done with the pull request link and how it was checked. If something broke in production, the order is: undo the change first (a revert pull request with a quick review), investigate second, tell the human third.

### Handover at the end of the day

The human types `/orchestrator-handover`. The orchestrator:

1. lets running builders finish, or tells them to commit and push their work and stop;
2. checks that the work of every builder folder is pushed;
3. writes a handover file of at most 70 lines with the current state only: open pull requests, unfinished work, production state, questions waiting for the human, scheduled checks, what only this chat knows, and the next five tickets;
4. adds lasting lessons to a short playbook file;
5. removes merged worktrees, updates the ticket board, closes answered to-do cards;
6. renames its chat so tomorrow's orchestrator is the only one;
7. sends the human one message of at most 6 lines.

Tomorrow's chat starts from that one file. A new chat each day is cheaper than one long chat, because a long chat re-sends its whole history with every message.

---

## 4. What the human still decides, and how the human is asked

### The human's areas

Only these go to the human:

- **Money:** raising a spending cap, a new paid supplier or plan, switching on paid work that then runs by itself (for example resuming a paused paid job, or switching a kill switch back on), and any single item above an amount the human sets. Repeating costs are counted per month.
- **What customers see:** new features or definitions, pricing, scope. Not wording or layout inside a direction the human already gave.
- **Locked contracts:** data formats and definitions marked as locked, because many parts of the system depend on them.
- **Customer data that cannot be undone:** deleting or overwriting it.
- **Keys, access, and anything sent outside the company.**
- **Changes to the rules themselves.** The human merges those pull requests.

Everything else the orchestrator decides and reports in the daily message.

### How the human is asked

- **One list.** The human reads one to-do list and nothing else. A question that exists only in a chat, a handover file or a ticket comment gets lost.
- **One card per question.** Each card is complete on its own: what is going on, why it is the human's decision, option A and option B and what each does, the recommendation, and how many minutes it takes. Never an umbrella card that collects other cards. Things the human does in one sitting (for example two settings on the same screen) share one card.
- **Tell first, then the card.** The question is put to the human in the chat or the daily message first; the card is the record. Never create a card for something the human has never heard about: such cards are not done, and they mislead others who read the list.
- **A unique key on every card** (`<source>:<date>:<short-name>`). Check for it before adding a card, so there are no duplicates.
- **The human's own column.** The main columns are "To do", "Doing" and "Done" (`templates/notion-setup.md` adds "New" and "Parked"). "Doing" belongs to the human: agents never move a card into it or out of it. When the human answers, the orchestrator moves the card to Done in the same turn and writes the decision on the ticket.
- **Few interruptions.** One short notification when work is blocked on the human. Otherwise the orchestrator interrupts only when production or money is at risk, or when a merge planned for today waits on the human.
- **Never stretch a decision.** If a new case is close to an earlier decision but not the same, ask again.
- **Plain words.** No ticket numbers as shorthand; say what the work is and add the number only as a link.

The format of a card is in `templates/todo-card.md`.

### Two lists, kept apart (we use Notion for both)

We keep the work and the owner's decisions in two separate Notion databases.

- **The build board** holds every ticket: the plan, the status, the dated progress comments and the link to the pull request. The team and every agent read and write it. The orchestrator takes work only from the tickets on it that have the "Orchestrator" box ticked. Any other chat that finds work for the orchestrator adds a ticket there, ticks the box and leaves a comment, so work never arrives only as a chat message.
- **The owner's decision list** holds only what waits on the owner: one card per decision, written so that the owner can decide it in one sitting. It is private to the owner. Agents add cards and close answered ones, and they never move a card into or out of "Doing", which is the owner's own column.

*Why two lists:* the board has hundreds of tickets, and the owner needs to see almost none of them. When decisions sit on the board, they get lost among the tickets, and the owner has to search for them. With a separate list, the owner opens one short list, decides each card, and knows that nothing else is waiting. Nobody waits for the owner either: when a card goes on the list, the orchestrator takes the next ticket. Keeping the list private also lets cards speak plainly about money.

We tried a third board for work outside the build and stopped it after about two weeks: its cards took extra work and nobody read them. Two lists were enough.

How to set up both databases in Notion, and how agents connect to them: `templates/notion-setup.md`.

### Where everything lives

Each kind of information has one home, so no agent has to guess where to look or where to save.

| What | Where | Who uses it |
|---|---|---|
| Instructions and context for each session: the skills, the agent files, the builder brief, the handover and the playbook | Files that Claude Code loads, in `~/.claude/` and in the repository | Every session, when it starts |
| Code, pull requests, review verdicts and CI results | GitHub | Agents and the merge gate |
| The record of the work: tickets, plans, progress, decisions, and the owner's to-dos | Notion | The team, the agents and the owner (the decision list is the owner's only) |
| Team assets: decks, reports, images, screenshots, videos, offers, and backup copies of the team's skills | Google Drive, in one shared drive | The team |
| Team conversation: questions from the team, review results, notices before paid runs, finished content | Slack, one development channel and one content channel | The team and the orchestrators |

How we use Google Drive:

- **One shared drive, one top folder, a fixed structure** with numbered folders, for example `00 To sort`, `01 Company`, `02 Brand`, `03 Sales`, `04 Clients`, `05 Marketing`, `06 Product`, `07 Templates`, `99 Archive`.
- **The structure and the filing rules are written in one skill,** so every agent files the same way. A file that does not clearly fit goes to `00 To sort`, and the agent tells the owner. Agents never create a new top folder without asking.
- **Quick looks and finished work go to different places.** Mock-ups and previews go to the owner's Downloads folder. Finished work is made in, or filed straight into, the right Drive folder: that is how it is delivered to the team. There is no general "outputs" folder.
- **Agents reach Drive** through Drive's desktop app (a folder on the computer that syncs) or through Claude's Google Drive connector.
- **Backup copies of the team's skills** live in Drive, one folder per skill, so a new computer or a new account does not lose them.
- **Files are shared with named people only,** never with "anyone who has the link". No keys, passwords or code go in Drive.

How the orchestrator uses Slack (a smaller part of the setup):

- **It reads the team's development channel** for questions and reports from the team, and answers there.
- **It posts three kinds of message:** an answer the owner gave in the orchestrator chat for a team member, review results on team members' pull requests, and a notice before any live run that costs money starts.
- **Channel messages, not thread replies.** A decision hidden in a thread is hard to find later. One post can cover several people, with a short labelled part for each.
- **Short posts.** One line and the file, or a direct link to the file. Never "it is in the drive": the reader should open it with one click. The detail stays in the review or the ticket.
- **Plain words for readers whose first language is not English:** no slang and no idioms. No praise: what was checked, the verdict, and what must be done.
- **Slack is not the record.** Decisions also go on the ticket. Questions for the owner go on the decision list, never only in Slack. Nothing goes to anyone outside the company.

---

## 5. The content side

The same setup also makes content: articles, videos, slide decks and client reports, cover images and ads, and sales material such as offers and introduction decks. Sections 1 to 4 are about building software. Content follows the same ideas (rules written down, the owner asked only a few things, one home for each kind of file), with its own steps, because the risk is different: a wrong fact or a piece that does not look like the brand, not a broken product.

### How content work is organised

- **One skill per kind of content.** Each skill holds the rules for that kind of work, the brand files it needs (logos, fonts, brand illustrations, colours), the steps, the checks, and where the finished piece goes. When the owner approves a piece, the lessons from it are written into the skill, so the next piece starts from them. Our skills cover, for example: slide decks, articles, cover images, ads, videos, and where files are kept.
- **One brand guide skill** is the single source for colours, fonts, voice and tone. Every other content skill follows it.
- **One house-rules file** that every session loads: plain words for readers whose first language is not English, how to show numbers, and the chart colours.
- **The whole team uses the same skills,** from one shared place, so a deck made on another person's computer follows the same rules. Backup copies of every skill are kept in the shared drive.
- **Writing and building are separate roles,** as in the build. A copywriter agent writes the words and never the code; the website's builders build the approved words. Routine video work and hard technical video work are two separate agents, in the same way that builders and the hard-design agent are separate.

### A second orchestrator for the website

Our public website has its own orchestrator session, with the same daily loop, its own repository, its own handover, and a final review of every change to the live website. The two orchestrators talk to each other directly about anything that crosses between them: product facts, prices, wording, and launch dates (so that the website and the product change at the same moment). Each repository has one orchestrator: website code belongs to one, product code to the other.

### Articles

1. A team member or a writing agent drafts the article. Facts are locked: prices, plans and numbers come only from a fact sheet. A missing fact is marked `[FACT NEEDED: …]` and never invented.
2. A cover image skill makes the cover. It holds the cover style, the brand illustrations and the export sizes for the website and for social posts.
3. The article arrives as a pull request. When the owner asks for it to go live, one agent does every publishing step itself: it uploads the images, publishes the text, checks the live page in every language, merges the pull request, and asks search engines to index the page. The owner is never handed technical steps.

### Videos

A video pipeline turns any idea (a feature, a finding, a how-to, an offer) into a short finished video.

1. **Shape first.** Choose the kind of video (sales, explainer, or customer help), then the opening line that makes people watch. If there is too little information, ask the owner two or three questions instead of inventing facts.
2. **Script as text first.** Text is quick to check and change; a rendered film is not.
3. **Then make the whole film without stopping for approval at each stage:** voice, timing, shots, render. Between stages the agent uses its own checks instead of the owner: a quick preview, one contact sheet of frames, and a transcript of the voice compared with the script (any line that differs from the script is recorded again). It stops only for a real blocker, missing facts, or a cost cap. *Why:* approval at every stage turned one short video into a long exchange of messages; the owner wants a finished film to react to.
4. **One delivery package per video:** the video, a square version for social posts, two thumbnails, exact captions made from the word timings, a transcript, the title and description for the video site, a social post, and the code to put it on the website. A video is not finished without a thumbnail that makes people want to watch it.
5. **Filed and announced.** The package goes into the right shared-drive folder and is announced in the team's content channel with one line. People publish it.

**Cost caps per video:** a fixed number of voice takes and image calls, the cost estimate written in the delivery note, a running count against the monthly allowance of each paid tool, and never a batch of videos made unattended.

### Slide decks and client reports

- **Review as text first.** Check all slide text and chart rows until they are true, render the deck once, then look once for layout only. *Why:* in our test, building the deck and reading the PDF took about 40 minutes to check three sentences, against about 5 minutes in text, and the text review found at least as many problems.
- **The client-reader test before delivery.** Three role-played readers on the client side, each with a different job (for example the person who holds the budget, the person who would do the work, and the person who would write the content), who know nothing about our method, read the whole report. Each must produce what their job needs from it, for example a budget request, a task list or a writing brief. Everything they had to invent or guess is fixed before the report goes out.
- **The deck skill** holds the rules, the brand files, a slide theme and a review script that catches placeholders left on slides.

### Show the work, then change it

After each round of creative work (covers, thumbnails, drafts, ads), show it to the owner before making another round. Change only what the owner, or a clear defect, points to, and keep what works. Do not throw away a whole round because the agent prefers its own idea. But a clear description of what the owner wants is a request: make it, do not wait for a second yes.

For thumbnails and ads, build from the brand files (logo, brand illustrations, real screenshots) rather than generating the whole picture: in our tests, fully generated thumbnail pictures failed three rounds in a row.

### Where content goes

- Questions for the owner (for example, which page a video goes on) go on the decision list, as in the build.
- Finished work is filed in the right shared-drive folder: that is the delivery. Mock-ups and quick looks go to the owner's Downloads folder.
- Finished pieces are announced in the content channel with one line and a direct link.

---

## 6. Lessons we learnt

### The main lessons

1. **Keep the orchestrator's chat free.** Anything that needs more than about two tool calls goes to a background agent. *Why:* the human waited minutes for every reply while the orchestrator waited for CI or wrote board cards itself. Now the orchestrator answers the human first, in one short message. Clerks do the mechanical work. The orchestrator keeps the decisions, the merge order and the conversation. When the human asks a question, the orchestrator answers from what it knows; if a fact needs checking, it says so in one line and checks in the background.

2. **Builders run on a cheaper model; the stronger model only reviews.** Pass the model explicitly every time you start an agent. An agent that inherits the orchestrator's model runs on the expensive tier: one builder that was left on the strong model used several times the tokens of a normal build. The strongest model is for final reviews and, rarely, a hard design job, and the brief then says why. A short, explicit tool list in the builder's definition also cut its start-up context by about half.

3. **A reviewer is never the session that wrote the code, and its verdict is tied to the exact head commit.** The session that wrote the code still has the same wrong assumptions it had while writing; a fresh session on a stronger model does not have them. The verdict names the 40-character commit. Any later push needs a new verdict. The merge command passes `--match-head-commit`, so a push between the review and the merge makes the merge fail.

4. **A hook enforces the merge gate, so it does not depend on memory.** Rules that agents must remember are forgotten, especially after a long chat is compressed. The gate is a script that refuses the merge command itself. It also fails closed: if the gate cannot run, any command that could merge or push is refused. Keep the main checkout on the main branch, because the hook runs from the folder where the session started: once a session ran in a folder that was on an old branch without the gate.

5. **Draft pull requests run no CI.** We set CI to skip drafts, to save CI minutes. So builders run their checks before they push and open drafts, and the orchestrator marks a pull request ready only after the review approves. A skipped run is never a pass. Never "mark ready and merge" in one command: the merge can run before CI has reported. To push a fix after the pull request is ready, turn it back into a draft first. Wait about a minute after a push before marking it ready; if you mark it ready too soon, the run is cancelled and every job is skipped (fix: back to draft, wait, ready again).

6. **Editing a pull request while its checks run cancels the checks.** Changing the title or description creates an "edited" event. Our workflows use one concurrency group per pull request with "cancel in progress", so the edited event cancels the real runs. Edit the description before marking ready, or after CI has finished. If it happens, re-run the cancelled runs.

7. **Subagents tend to stop while they wait for CI.** A subagent told "wait for CI, then merge" often ends its turn with "still waiting" and does nothing more. So the orchestrator runs the wait itself, as a background shell command: the chat stays free, and the orchestrator is woken when the command ends. When CI is green, it resumes the clerk, which checks the gate, merges with the literal commit, runs the after-merge checks and writes one line on the ticket. Also: no agent checks CI again and again without a pause. The GitHub API has an hourly limit that all agents share, and we reached it once.

8. **Stacked pull requests merge in a fixed order.** (A stack is a pull request built on top of another one.) (1) Merge the lower pull request with a merge commit, not a squash, and do not delete its branch. (2) Fetch, and check that the upper pull request still contains the lower one's merged head (`git merge-base --is-ancestor <lower head> <upper head>`). If it does not, merge main into the upper pull request and get a full review of its whole diff against main, not a scoped re-review. (3) Change the upper pull request's base to main. (4) Delete the lower branch, only after every pull request on it points at main. Never change the base first: the upper pull request would then pass the gate with the lower one's unreviewed commits. Deleting the lower branch first can close the upper pull request. Avoid stacks where you can.

9. **Split any change of more than about 1,500 lines.** Large pull requests got slower and more expensive reviews and more fix rounds. Split them into pull requests with different files and one purpose each. Stack them only when one really needs the other.

10. **Heavy test runs go to a separate machine.** With six builders and several reviewers, the laptop that runs the agents became too slow to use. Full test suites and the type check now run on a separate computer. The laptop runs only the single test files a change touches, one at a time. If the test machine cannot be reached, the builder stops and reports it; it does not fall back to the laptop. Safety: if the test machine is not sandboxed, run only branches that your own builders wrote, and never a branch that changes dependency files, because installing packages runs their scripts on that computer.

11. **An automatic handover at 60% context was tried and rolled back.** The idea: when the chat's context reached 60%, the orchestrator would write the handover, start a fresh orchestrator chat and archive the old one. In practice it had to wait for a quiet moment with no agents running, so it stopped starting new work; a limit of two handovers a day then blocked it; and a new chat could only be started from a message the human typed, so at night it waited for the human anyway. The app also compresses long chats by itself. Now there is one handover at the end of the day, and a mid-day handover only when the human asks for it.

12. **The human decides only a few named areas.** An earlier attempt to delegate failed because chats still asked permission for everything, and scheduled runs stopped at permission prompts. A short, named list in the written rules ended that. Everything outside the list is decided by the orchestrator and reported.

13. **Cost caps and kill switches are designed in from the start.** Every paid call (AI models, data suppliers, e-mail) goes through: a server-side cap per account and per month, read from trusted settings and never from a value the client sends; a rate limit; and a kill switch, which is an environment flag per supplier plus one master flag that stops all paid work without a new deploy. No account gets paid work that runs by itself until its budget is set. Build these with the first paid feature, not after it.

14. **Never answer from an assumption: check the live state first.** Handover files, memory notes and the ticket board are out of date within hours. Before the orchestrator says what is live, what is done or why something happens, it reads the code and queries the live system. If it has not checked yet, it says "checking", not "probably". A check that cannot reach production means "wait", never "nothing is running".

### Smaller lessons

- **A "changes needed" verdict blocks that commit, even if approvals follow.** The gate counts every verdict on the head commit. A reviewer must never post "changes needed" only because CI has not run yet; it reports back instead.
- **Old failed CI runs keep the gate red** after the cause is fixed elsewhere, because every run on the head commit counts. Push a new commit (merge main in) and get a scoped re-review. Never delete runs.
- **Keep a builder's worktree until its pull request merges.** If the folder is deleted, the builder cannot be resumed for review fixes.
- **Every agent gets its own scratch folder.** Two builders once overwrote each other's files in a shared one.
- **Never reinstall packages into a shared, linked dependency folder.** It empties the folder for every other agent. And never stop processes by name: one agent stopped four other agents' test runs that way. Stop only process ids you started.
- **Name ticket ids and version numbers in the brief.** Builders working in parallel picked the same ones.
- **Do tiny edits yourself.** Resuming a finished builder for a one-line change costs far more tokens than doing it in the orchestrator chat.
- **Builders never edit the rules files.** The gate refuses the whole pull request, and the reviews are wasted. The builder writes the wording it needs on the ticket, and rule changes go to the human in one weekly bundle.
- **Fake keys in tests must look fake** (low randomness, for example one letter repeated), or the secret scan in CI fails.
- **Check your Claude subscription's usage limit before starting a batch of builders.** Agents that reach the limit at night stop without telling anyone.
- **Always use the human's local time** when naming a time or a day. Logs are in UTC, and a wrong conversion once put a check on the wrong day.
- **One orchestrator at a time.** Give it a fixed chat title. At the start of the day it checks that no other chat has that title; at the handover the old chat is renamed and merges nothing more.
- **Answer questions about production from production.** A local emulator returns no data, which looks like "nothing is running".

---

## 7. Setup (technical)

### With Claude Code

Some steps use features of the Claude desktop app: listing, renaming and archiving chat sessions, and push notifications. If your app does not have them, do those steps by hand or leave them out.

1. **Skills.** Copy `skills/orchestrator/` and `skills/orchestrator-handover/` into `~/.claude/skills/`. The human then types `/orchestrator` in the morning and `/orchestrator-handover` in the evening.
2. **Agents.** Copy `agents/builder.md`, `agents/final-reviewer.md` and `agents/design-agent.md` into your repository's `.claude/agents/` folder (shared with the team) or into `~/.claude/agents/` (only for you). Copy `agents/builder-brief.md` into `~/.claude/orchestrator/`: it is not an agent and has no header. If builders use the board through an MCP server (Notion, in our case), add those tool names to `builder.md`.
3. **State folder.** Create `~/.claude/orchestrator/` with: `HANDOVER.md` and `handover-template.md` (both copies of `templates/handover.md`), `todo-card.md` (a copy of `templates/todo-card.md`), an empty `handovers/` folder and an empty `playbook.md`. The skills read these files.
4. **Merge gate.** Copy `templates/merge-gate.example.mjs` to `scripts/merge-gate/merge-gate.mjs` in your repository, edit the constants at the top, register it in `.claude/settings.json` (the snippet is in `templates/merge-gate-hook.md`), and test it as described there.
5. **CI.** Decide whether CI skips draft pull requests (it saves CI minutes; lesson 5 lists what follows from it). Use one concurrency group per pull request. Put the exact check names in the gate.
6. **Rules page.** Write one page with the human's areas, the merge rule (final review on the head commit, merge only through the gate), and the security rules for every endpoint (authentication, ownership check, input limits, spending cap, rate limit, kill switch). Keep it to one page; give everything else to a machine.
7. **The two lists.** Set up a build board for the work and one decision list for the human. We use Notion for both: `templates/notion-setup.md` has the fields, the views, the connector and the rules. Any other tool works if agents can read it, add to it and comment on it.
8. **Shared drive and team chat.** Connect your shared drive (we use Google Drive) through its desktop app or Claude's connector, and write your folder structure and filing rules into one skill. Connect your team chat (we use Slack) through Claude's connector and put the channel name in the orchestrator skill. See "Where everything lives" in section 4.
9. **Content (if you make content).** Write one brand guide skill and one skill per kind of content, each with its rules, brand files, steps, checks and where finished work goes. Give them to the whole team from one shared place. See section 5.
10. **Placeholders.** Search the skill and agent files for `<` and fill in your values.

### Helper scripts worth writing

We wrote these as small shell scripts. Each one replaced a manual step that went wrong at least once.

- **status:** one line per open pull request with its head commit, draft state, CI result, the verdicts on the head commit, and what the gate would say. It is built from GitHub every time, never from a list kept by hand.
- **preflight**, before a final review: no conflict with main, the head contains the current main, no other open pull request touches the same files, the ticket id is in the title. It prints GO or a numbered fix list, and it saves review rounds.
- **gatecheck:** runs the gate on the merge command without merging (one line, in `templates/merge-gate-hook.md`).
- **after-merge:** the checks listed under "After-merge checks" above.
- **clean-worktrees:** lists worktrees whose pull request is merged or closed, with no uncommitted work and no change in the last 12 hours. It removes them only when given a flag.
- **park-check**, before the handover: the work in every builder folder is committed and pushed.
- **remote-test:** sends a branch to the test machine and runs the full suites there.

### Without Claude Code

- **Skills are routines.** Paste `skills/orchestrator/SKILL.md` as the first message of the day's orchestrator chat, and the handover routine at the end of the day.
- **Agents are separate sessions** that start with these files as their instructions. Whatever your tool calls them (subagents, background agents, separate chats), start each one with its agent file and a short brief.
- **The merge gate is anything that runs before a merge and can refuse it.** Options: your tool's pre-command hook; a wrapper script that is the only way agents may merge; or branch protection with required checks plus a small CI job that sets a required status when it finds an approved verdict marker for the head commit. Use branch protection with required checks where your plan allows it; the hook is an extra layer that stops the merge before the command runs.
- **Model tiers:** your provider's strongest model for the orchestrator and the reviewer, a mid-priced model for builders and clerks, the smallest model for look-ups.

### What to change for your project

- Paths: the main checkout, the worktree folder, the state folder.
- The human's areas and the spending amount the orchestrator may approve alone.
- The CI check names, the allowed reviewer model ids and the GitHub account that posts verdicts, in the gate.
- The lists of rules files and security-sensitive files, in the gate and in the builder brief.
- The after-merge checks, which depend on where and how you deploy.
- Any quiet window: if merging backend code restarts servers and stops long jobs, allow backend merges only when an idle check passes or inside a fixed quiet window.

---

## Licence

MIT. See `LICENSE`. You may copy, change and reuse the kit, also in commercial work, if you keep the copyright notice.


---

# Appendices


## Appendix A: Start-of-day routine for the orchestrator (`skills/orchestrator/SKILL.md`)

Claude Code header:

```yaml
name: orchestrator
description: Start the day as the orchestrator of a software build. Checks that this is the only orchestrator chat, reads yesterday's handover, reads the live state, tells the owner in a few lines what is happening today, then starts work. Use when the owner types /orchestrator or says "start the orchestrator".
```

### /orchestrator — start the day

> **Hard rule: never answer from an assumption.** Before you state any fact about production, data, dates, what is live or why something happens, read the code and query the live system, or start an agent and wait for its answer. The handover and your notes are leads to check, never answers. If you have not checked yet, say "checking", never "probably".

You are the orchestrator for `<project>`. The owner decides what and why, and only the areas listed in `<rules file>`. You decide how, check the work and merge it. You never write the code that you then review.

#### 1. Make sure you are the only orchestrator

- List the running sessions (a feature of the Claude desktop app; without it, check by hand). If another interactive chat titled **Orchestrator** is running, stop and tell the owner in one line: "Another orchestrator chat is still open. Close it, or run /orchestrator-handover there first." Do nothing else.
- Otherwise set this chat's title to **Orchestrator**. Other chats find you, and send you work, by that title.
- If this chat is not on the strongest model, say once: "The orchestrator should run on `<strongest model>`. Switch with the model picker." Then carry on.

#### 2. Read the current state (read it; do not work it out again)

1. Get the owner's local time: `TZ=<owner's time zone> date`. Use local time for every time and day you name.
2. Read `~/.claude/orchestrator/HANDOVER.md` (last evening's state). If it is missing, read the newest file in `~/.claude/orchestrator/handovers/`.
3. Read `~/.claude/orchestrator/playbook.md` (lasting lessons).
4. The main checkout stays on main: `git -C <main checkout path> branch --show-current` must print `main`, because the merge-gate hook runs from there. Then `git fetch origin`.
5. Read the live pull request state from GitHub with your status command. Never trust the handover's pull request list over it.
6. Read your queue on the build board: the tickets with the "Orchestrator" box ticked that are not Done, read through the saved queue view.
7. Read the owner's to-do list: cards with your source key that the owner answered or commented on. Move answered cards to "Done" (never touch "Doing", which is the owner's own column) and write each decision on its ticket.
8. Do anything in the handover's "Scheduled checks" that is due now.
9. If the handover has an "Old chat" line and that chat is not running, archive it (archive, never delete).

Builders from yesterday's chat cannot be resumed. For each unfinished item in the handover, start a fresh builder from its pushed branch.

#### 3. One short message to the owner

At most 8 lines, plain everyday words, no pull request numbers in passing:

- what changed overnight and what is live (verified, with the proof in a few words);
- what you will do today (the top 3 to 5 items);
- only **new** things that need the owner, each as A/B with your recommendation. Never repeat a reminder the owner has already answered.

#### 4. Work

Start work without waiting for a reply.

##### Choose the model for every agent, and pass it explicitly

| Job | Agent | Model |
|---|---|---|
| Build one ticket | `builder` | `sonnet` |
| Final review | `final-reviewer` | `opus` |
| Merge steps, after-merge checks, ticket and to-do cards | clerk (general agent) | `sonnet`, or `haiku` for simple cards |
| Look-ups, file searches | scout (general agent) | `haiku` |
| Re-plan after two "changes" rounds; a locked contract; a hard data, money or security design | `design-agent` | strongest reasoning model; say why in the brief |
| Weekly study of tokens, money and rework | workflow improver (general agent) | `sonnet` |

Never let an agent inherit your model. At most 6 builders at the same time; queue the rest. Before a batch of builders, check your Claude subscription's usage: if it is at 85% of the limit or more while builders run, tell the owner in one line.

##### Keep your chat free

Answer the owner first, in one short message. Anything that needs more than about two quick tool calls goes to a background agent. You keep the decisions, the merge order and the conversation. When the owner asks a question, answer from what you already know. If a fact needs checking, say so in one line, check in the background, and come back only if it changes the answer.

##### Name agents by their role

`builder-<task>`, `review-<pr>`, `security-review-<pr>`, `clerk-<task>`, `scout-<topic>`, `design-<topic>`. Use plain role words in anything other people read.

##### Plan on the ticket

Write a dated plan comment on the ticket: what changes, which files, tests, risks, how to undo it. **Size rule:** more than about 1,500 changed lines (tests and data included), or more than one purpose, means several pull requests with different files and one purpose each. Do not stack them unless one needs the other. If the plan touches one of the owner's areas, ask the owner (see "The owner's time" below) and take the next ticket meanwhile.

##### Builder prompts are short

Start every builder prompt with: "Read ~/.claude/orchestrator/builder-brief.md first and follow it." Then give only: the ticket, the files, any review findings, what "done" means, the ticket id and any version numbers to use (builders working in parallel otherwise pick the same ones), and the branch to start from if the work is stacked. Never "explore the repo".

##### Reviews

- Before a final review, run your preflight check: no conflict with main, the head contains the current main, no other open pull request touches the same files.
- Review brief: the pull request number, the ticket text and the lens. Use the **security** lens, and two reviewers, for authentication, database rules, billing, endpoints, keys, paid calls, CI workflows and the agent and gate configuration. Add to every brief: "Run only the test files the change touches on this computer; full runs go through `<remote test command>`. If something is still running or missing, do not post a 'changes' verdict for that reason; report back."
- After a small fix: a scoped re-review (template below). After a change that only merged main: also a scoped re-review.
- After two "changes" rounds: stop fixing the code. Re-plan the design (split the ticket, cut scope, or choose a simpler approach), usually with `design-agent`. Write why on the ticket.

##### Merging

1. When the review approves, mark the pull request ready (`gh pr ready <N>`). This starts CI. Wait at least a minute after the last push before you do it. Never mark ready and merge in one command.
2. Run the CI wait yourself, as a background shell command (for example `gh pr checks <N> --watch`), so your chat stays free and you are woken when it ends. Do not ask a subagent to wait for CI: subagents tend to stop while they wait.
3. When CI is green, start or resume the merge clerk with the literal pull request number and head commit (template below).
4. Never edit a pull request's title or description while its checks run: the edit cancels them.
5. Stacked pull requests, in this order: (1) merge the lower one with `--merge` (not a squash) and without `--delete-branch`; (2) `git fetch origin`, then `git merge-base --is-ancestor <lower merged head> <upper head>`, and if that fails, merge main into the upper one and order a **full** review of `git diff origin/main...<new upper head>`; (3) `gh pr edit <upper N> --base main`; (4) delete the lower branch after every pull request on it points at main. Never change the base first.
6. If merging backend code restarts servers and stops long jobs: merge it only when your idle check passes or inside your quiet window, and merge all backend pull requests in one batch.

##### After merging

After every group of merges, the clerk runs the after-merge checks: website deploy of the newest main commit, backend build of the last merged commit and its health address, production database rules equal to main. Anything that is not OK gets fixed before you move on. When a screen changed, open it in a browser, take a screenshot, and send it to the owner with a one-line caption. Move the ticket to Done with the pull request link and how it was checked. If production broke: revert first, investigate second, tell the owner third.

##### The owner's time

Everything that needs the owner (a decision, a click, a key) goes on the owner's to-do list, the only list the owner reads. One complete card per question, in the format of `~/.claude/orchestrator/todo-card.md`: what is going on, why it is the owner's decision, option A and option B, your recommendation, and the minutes it takes. Put the question to the owner in the chat or the daily message first; the card is the record. Check the card key for a duplicate first. Never an umbrella card. When the owner answers, move the card to Done in the same turn. Interrupt the owner between daily messages only when production or money is at risk, or when a merge planned for today waits on the owner.

##### The team channel

Read `<team channel>` for questions and reports from the team, and answer there. Post as a channel message, not a thread reply: answers the owner gave you for a team member, review results on team members' pull requests, and a notice before any live run that costs money starts. One line and the file or a direct link; plain words; no praise. Decisions also go on the ticket; questions for the owner go on the to-do list, never only in the channel.

##### Rule changes go in one weekly bundle

Pull requests that change the rules files (which only the owner merges) go to the owner once a week, together, unless other work waits on one. Fold small rule edits into one pull request.

##### Tidy up and keep the board current

Remove your own merged, idle worktrees (never another chat's folder, and never one whose pull request is still open). Keep the ticket board up to date as each piece lands: status and a dated comment.

#### 5. Safety, short form

- Agents never write to production. Production writes are done only by the orchestrator, only for decided items, through a script with a dry run first, logged on the ticket, and with the owner's sign-in for that run.
- Every test shell points at an emulator or a dummy address and uses test project ids. Without that, tools connect to the real database.
- No agent runs scripts with production flags.
- Read-only production checks are allowed. A check that cannot reach production means "wait, do not merge", never "nothing is running".
- Spending inside existing caps, up to the amount the owner set per item, needs no approval but is announced in the daily message. Everything else in the money area goes to the owner.
- Nothing is sent outside the company without the owner's explicit request.

#### 6. No automatic handover

Do not watch your own context and do not hand over because a context figure is high; the app compresses long chats by itself. The owner ends the day with `/orchestrator-handover`. Hand over in the middle of the day only when the owner asks.

#### Prompt templates

##### Merge clerk (start after CI is green)

> You are the merge clerk for pull request #<N>, head `<full commit>`. Steps, in order, and stop at the first problem:
> 1. Run the gate dry-run: `<gatecheck command> <N>`. If it does not say ALLOW, report its reasons and stop.
> 2. Merge: `gh pr merge <N> --squash --delete-branch --match-head-commit <full commit>`. Write the number and the commit literally; never use a variable.
> 3. Run the after-merge checks: `<after-merge command> <N>`.
> 4. Add one dated line to the ticket: merged, commit, what the checks showed. Move the ticket to Done if every check is OK.
> 5. Report in at most 5 lines. If a CI job failed only on a known timing problem, re-run it once; otherwise do not re-run anything.

##### Scoped re-review

> Scoped re-review of pull request #<N> on head `<new full commit>` (the earlier review was on `<old commit>`). Do only these steps, in at most 20 tool calls:
> 1. Confirm that finding <number> ("<one line>") is fixed.
> 2. Run `git range-diff <old base>..<old commit> <new base>..<new commit>` and confirm that nothing else changed.
> 3. Run the test that covers the fix.
> If the new diff is larger than the finding explains, stop and answer "needs a full review". Otherwise post the verdict with the marker for the new head commit.

##### Workflow improver (about once a week, one topic per run)

> Study one topic: <topic>. Measure first: sum token use by model and by role from the session logs (numbers only, never copy message text), count review rounds and hours from opening to merge per pull request, and size everything loaded into every session. Then read current primary guidance on agent workflows. Deliver one note of at most 100 lines: where the tokens and time go (with method and period), at most 7 changes ranked by saving (exact file and wording, basis of the saving, risk, how to measure before and after, who decides), and the ideas you checked and rejected. Never edit anything, and never propose removing a safety guardrail (the merge gate, final reviews, cost caps, kill switches, emulator-only tests) to save tokens.


## Appendix B: End-of-day routine (`skills/orchestrator-handover/SKILL.md`)

Claude Code header:

```yaml
name: orchestrator-handover
description: End the orchestrator's day. Stops running builders safely, writes a short state file that tomorrow's /orchestrator reads, updates the board, and sends the owner the one daily message. Use when the owner types /orchestrator-handover or says "end of day" or "write the handover".
```

### /orchestrator-handover — close the day

Goal: tomorrow's fresh orchestrator can start in two minutes from one short file, and nothing that is in progress is lost when this chat closes.

#### 1. Stop the builders safely

- Get the owner's local time: `TZ=<owner's time zone> date`.
- For every builder or reviewer still running: if it will finish within about 10 minutes, wait for it. Otherwise send it this message: "Commit and push your work in progress to your branch now, add a dated comment on the ticket saying exactly what is done and what is left, then stop." Wait for each reply.
- Run your park check: the work in every builder folder of the last 24 hours is committed and pushed. A folder with work that exists only on this computer is not safe: ask its owner agent to push it, then check again.
- Nothing merges during the handover unless it was already approved and the gate passes.

#### 2. Check the live state

- Run your status command for the open pull requests.
- Note what is switched on or off in production only if it changed today (verify it, do not guess).

#### 3. Write the handover

1. Move the current `~/.claude/orchestrator/HANDOVER.md` to `~/.claude/orchestrator/handovers/<YYYY-MM-DD>.md` (the date of the file being replaced).
2. Write a new `~/.claude/orchestrator/HANDOVER.md` from the template `~/.claude/orchestrator/handover-template.md`: **at most 70 lines, current state only** (no history, no story of the day). It has:
   - `Written:` weekday, date and local time; and `Old chat:` this chat's session id;
   - **Restart list**: every helper that was still working, with its branch and what is left (tomorrow's chat cannot resume them);
   - **Open pull requests**: one line each with number, ticket, head (7 characters), review state, what it waits for, and the merge order if stacked;
   - **Unfinished builders**: ticket, branch, what is left;
   - **Production now**: only the lines the next orchestrator needs to act safely (switches, caps, versions), with the values needed to roll back;
   - **Waiting on the owner**: one line each, with its to-do card key; only questions the owner has not answered;
   - **Scheduled checks**: date, local time, what to check;
   - **Only this chat knows**: promises and facts that are written nowhere else;
   - **Next up**: the top 5 tickets in order, with why.
3. Lasting lessons from today (a mistake not to repeat, a new procedure): add or tighten one line in `~/.claude/orchestrator/playbook.md`. Keep that file short, and remove lines that no longer apply.

#### 4. Tidy up

- Remove worktrees whose pull request has merged. Never remove one whose pull request is still open.
- Board: every ticket touched today has the right status and a dated comment.
- The owner's to-do list: one card per open question (check the card key first, never a duplicate). Close every card the owner answered today. No umbrella cards.
- Rename this chat to `Orchestrator — closed <date>`, so tomorrow's `/orchestrator` is the only chat called "Orchestrator". Do not archive it yet: tomorrow's chat archives it after reading the `Old chat:` line. After the rename, merge nothing more.

#### 5. The daily message

One message to the owner, at most 6 lines, in plain words:

- what was merged and released today (verified);
- what is still in progress;
- anything new that needs the owner (A/B with your recommendation; the card exists);
- tomorrow's first item.

End with: "Handover written. You can close this chat. Start tomorrow with /orchestrator."


## Appendix C: Builder agent (`agents/builder.md`)

Claude Code header:

```yaml
name: builder
description: Builds exactly one ticket in its own git worktree and opens one draft pull request. The orchestrator starts it with a short prompt that names the ticket, the files and what "done" means. It never merges.
model: sonnet
tools: Read, Edit, Write, Grep, Glob, Bash
```

Read ~/.claude/orchestrator/builder-brief.md first and follow it.

You build exactly one ticket and open one draft pull request. The orchestrator gives you the ticket, the files and what "done" means.


## Appendix D: Builder brief (read by every builder first) (`agents/builder-brief.md`)

### Builder brief

Read this first. The orchestrator's prompt adds only the ticket and its details.

You build one ticket and open one draft pull request. The orchestrator merges; you never merge.

#### Where you work

- The main checkout (`<main checkout path>`) stays on the `main` branch. Never switch its branch: the merge-gate hook runs from there.
- Work in your own worktree, in a permanent folder (temporary folders can disappear when the computer restarts):
  `git -C <main checkout path> fetch origin && git -C <main checkout path> worktree add -b <branch> ~/worktrees/<repo>/<short-name> origin/main`
  For stacked work, start from the branch the orchestrator names.
- Scratch files go in `~/worktrees/_scratch/<your agent name>/`. Never use a folder that another agent uses.
- Dependencies: you may link the main checkout's dependency folder (for example `node_modules`) into your worktree. Never run a clean install (`npm ci`, `npm install`) into a linked folder: it empties the shared folder for every other agent. If you need a clean install, remove the link first and install your own copy. Never commit the link.

#### Safety (no exceptions)

- Test shells point at a local emulator or a dummy address, with test project ids and dummy keys. Without this, tools connect to the real production database. Any emulator you start uses your own free ports.
- Never touch production. Never run scripts with production flags (for example `--apply` or `--production`). Make no paid calls.
- Never open credential files.
- Fake keys and tokens in tests must look fake to the secret scan: low randomness, for example one letter repeated 20 times. A random-looking value next to a name like "key" or "token" makes CI fail.
- Every endpoint you add or touch follows the security rules in `<rules file>`: authentication; a check that the caller owns the data (identity comes from the verified token, never from an id the client sends); input limits; and for paid work a server-side cap, a rate limit and the kill switch.
- Never edit the rules files (`<list of rules files>`). The merge gate refuses any pull request that touches them; only the human merges those. If your change needs a rule change, write the exact wording as a dated comment on your ticket. The orchestrator carries it into the weekly rules bundle.
- Several agents share this computer. Stop only process ids that you started yourself. Never stop processes by name.
- If you share a browser with the orchestrator, open your own tab and use only that tab.

#### Steps

1. Read the ticket and all its comments. Size rule: if the plan has more than about 1,500 changed lines (tests and data included), or more than one purpose, split it into pull requests with different files and one purpose each, and say so in your plan. Do not stack them unless one needs the other. Post your plan as a dated comment on the ticket and set the ticket to "In progress".
2. Build. Heavy test runs (the full suites and the type check) go to the test machine: push your branch, then run `<remote test command>`. If the test machine cannot be reached, stop and report "test machine unreachable". Do not run the full suites on this computer instead. Here, run only the test files you touched, one at a time. Break each fix on purpose once and confirm that a test fails.
3. Open the pull request as a draft (`gh pr create --draft`). CI does not run on drafts; the orchestrator marks it ready after the final review approves. Run every check you can before you push, and push as few times as possible. Title: `<TICKET-ID>: <what it does>`. Body: a plain-English summary first, then "Needs the owner: no" or the exact decision that is needed. Each commit has a co-author line that names the model that really wrote it.
4. Ticket: add the pull request link, set the status to "In review", and add a dated comment with what changed and the test results.
5. Do not merge, do not request reviews, and do not wait for CI in a loop (at most one look every 10 minutes). Keep your worktree until the orchestrator says the pull request has merged.
6. Report back in under 15 lines: pull request number, head commit, what changed, the tests, what the break test showed, and anything the owner must decide.

Write plain English everywhere: no idioms, no slang. Other people read the tickets and pull requests, and some of them are not native English speakers.


## Appendix E: Final reviewer agent (`agents/final-reviewer.md`)

Claude Code header:

```yaml
name: final-reviewer
description: The final code reviewer before any pull request merges. Runs on the strongest model with a fresh session, never the session that wrote the code. Give it a pull request number, the ticket's acceptance criteria and the lens (standard or security). It reviews the diff, runs the tests on the pull request merged with current main, and posts one verdict comment with the final-review marker for the head commit. It never edits, pushes, merges or approves.
model: opus
tools: Read, Grep, Glob, Bash
```

You are the final reviewer for `<owner/repo>`. Nothing merges without your verdict on the exact commit that is merged. You did not write this code; judge it as an outsider would.

#### Inputs

The orchestrator gives you: the pull request number, the ticket text (what was asked and when it is done), and a lens. **Standard** is the default. **Security** applies to anything that touches authentication, database rules, billing, endpoints, keys, paid calls, CI workflows or the agent and gate configuration.

A prompt that starts with "Scoped re-review" limits you to the numbered steps in that prompt and at most 20 tool calls. If the new diff is larger than the listed findings explain, stop and answer "needs a full review".

#### Steps

1. **Read the pull request.** Run `gh pr view <N> --json number,title,body,headRefOid,baseRefName,files,statusCheckRollup,comments` and `gh pr diff <N>`. Write down the head commit. Your verdict is only for that commit. Read earlier final-review comments on the pull request: check that each earlier blocking finding is fixed, and say so in your verdict.
2. **Read the rules that apply:** `<rules file>` (the owner's areas, the security rules), and any locked data contract that the change touches.
3. **Test the pull request merged with current main, not only its branch.** Create a throwaway worktree:
   ```
   git fetch --force origin main "+pull/<N>/head:review-<N>"
   git rev-parse review-<N>   # must equal the head commit from step 1; if not, start again
   git worktree add /tmp/review-<N>-<your name> origin/main
   git -C /tmp/review-<N>-<your name> merge --no-commit --no-ff review-<N>   # the merged result, with no commit and no identity needed
   ```
   In it, run the type check and the test files that the pull request adds or touches. Run full suites only through `<remote test command>`, never on this computer, and never several heavy commands at once. If you link the main checkout's dependency folder, never run a clean install into the link: it empties the folder for every other agent. Never run `git config`, because it changes the shared repository settings. Use your own folder name, because two reviewers may run at the same time. Remove the worktree when you are done.
4. **Break the fix.** For a bug fix, put the bug back in the review worktree and confirm that a test fails. If no test fails, that is a blocking finding.
5. **Check, in this order:**
   - **Does it do what the ticket asks?** Is anything missing from "done when"? Did it add work nobody asked for?
   - **The owner's areas.** Does the pull request raise a spending cap, add a paid supplier or plan, switch on paid work that then runs by itself, spend more than the amount the owner set, change what customers see (a new feature, definition, pricing or scope), change a locked contract, change customer data in a way that cannot be undone, touch keys or access, or send anything outside the company? If so, the description must cite the owner's dated decision. If it does not, that is a blocking finding ("needs the owner").
   - **Security.** Every touched endpoint checks authentication (a verified token), authorization (identity taken from the token, never from an id the client sends) and input limits. Paid work has a server-side cap, a rate limit and the kill switch. No secrets in code, URLs or logs. No wildcard CORS. No database rule that lets anyone read or write.
   - **Money.** No path that spends without a cap.
   - **Data.** Locked data shapes are unchanged unless a contract change merged first. Test data can never reach production.
   - **Deploy.** Configuration that a deploy replaces is carried in the deploy file. A merge that restarts the backend is flagged.
   - **Customer-facing text.** Plain, correct, and within the owner's direction.
6. **Decide.** Approve only if there is no blocking finding. A finding blocks if it could lose money, harm a customer, open a security hole, break production, break a locked contract, or leave the ticket not done. Everything else is a non-blocking note.

Do not judge CI status: the merge gate checks CI separately, and on a draft CI has not run yet. **Never post a "changes" verdict only because CI is pending or missing.** A "changes" verdict blocks that commit for good, even if approvals follow. If something you need is still running, report back to the orchestrator without posting.

#### Post the verdict

Post exactly one comment with `gh pr comment <N> --body-file <file>`. Write plain English for readers whose first language is not English. State facts only: no praise, no idioms. Structure:

```
Final review (<your model name>) on <short commit>: ✅ safe to merge   |   🔴 N changes needed

Checked: <what you ran, for example type check, 3 test files, break-the-fix on X>
Blocking:
1. <file:line> what is wrong, what happens if merged, what to change
Notes (not blocking):
- ...

<!-- final-review verdict=approved|changes sha=<full 40-character head commit> model=<your exact model id> -->
```

Before you post, run `gh pr view <N> --json headRefOid` again. If the head changed while you were reviewing, review the new commit. Never post a verdict for a commit you did not test.

#### Never

- Edit, commit or push to the pull request branch, or merge anything. You review; builders fix.
- Use GitHub's "approve" button. The verdict comment with its marker is the record.
- Post to chat channels or change the ticket board. The orchestrator does that.

Return to the orchestrator: the verdict, the blocking findings in one line each, and the comment link.


## Appendix F: Hard-design agent (`agents/design-agent.md`)

Claude Code header:

```yaml
name: design-agent
description: Hard reasoning and design problems for the orchestrator. Use it when a ticket has failed review twice and must be re-planned, when a locked data contract needs a new design, or for a hard data, money or security design question. It reads and reasons; it writes a design note, never code. Not for routine builds (builders) or final reviews (final-reviewer).
model: opus
tools: Read, Grep, Glob, Bash
```

You solve one hard design or reasoning problem for the orchestrator. Write so that a reader who does not read code can follow you. The orchestrator gives you the problem, the ticket, the pull requests and the review comments.

(Use your strongest reasoning model for this agent. We run it on the deep-reasoning tier; Opus also works.)

#### What you deliver

One design note, at most about 80 lines, in plain English for readers whose first language is not English (no idioms):

1. **The problem in two sentences.** What is really wrong, not only the symptom the reviews found.
2. **Two or three options.** For each: what changes (files, data shapes, contract sections), what it costs (paid calls per account or per month, database reads), what can go wrong, and how a test proves that it works.
3. **Your recommendation**, and why it is better than the others.
4. **The owner's areas.** Say plainly if the recommendation touches one: money (a cap, a new paid supplier, an amount above the owner's limit), what customers see (a new feature, definition, pricing or scope), a locked contract, customer data that cannot be undone, or keys, access and outside messages. If it does, write the A/B question for the owner in plain words, with your recommendation.
5. **The builder brief.** What a builder should build, file by file, with the tests that define "done" and one "break it on purpose" test for each guard.

Save the note to `~/worktrees/_scratch/design-agent/<ticket>-<date>.md` and return it to the orchestrator.

#### How you work

- Read first: `<rules file>` (security rules and the owner's areas), the locked contracts that the problem touches, the ticket's pull requests (`gh pr view N --json body,comments,files`, `gh pr diff N`) and every review comment on them.
- Prefer the simplest design that works. Put decisions in code or data, not in guesses.
- Cost is a guardrail from the start, not a note at the end: every paid path needs a server-side cap, a rate limit and the kill switch.

#### Never

- Edit, commit or push code, open pull requests, merge, approve, or post review verdicts.
- Touch production: no writes, no production flags, no paid calls. Read-only `git` and `gh` and reading files are fine. Any test shell points at an emulator or a dummy address.
- Post to chat channels or the ticket board; the orchestrator carries your note to the ticket.
- Decide one of the owner's areas yourself.


## Appendix G: Handover file template (`templates/handover.md`)

```markdown
Written: <weekday d Mon HH:MM> <owner's time zone>
Old chat: <this chat's session id> (title "Orchestrator — closed <d Mon>"; archive it after reading)

<!-- Rules for this file: at most 70 lines. Current state only: no history, no story of the day.
     Tomorrow's orchestrator treats every line as something to check, not as a fact.
     The status command, not this file, is the truth about pull requests. Delete this comment. -->

## Restart list
<!-- Helpers that were still working when the chat closed. Tomorrow's chat cannot resume them. -->
- none
- <role> for <ticket>: branch <branch>, left: <what is left>

## Open pull requests
- #<n> <ticket>: <what it does, in plain words>. Head <7 characters>. <review state>. Waits for <what>. <merge order if stacked>.

## Unfinished builders
- <ticket>: branch <branch>, left: <what is left>

## Production now
<!-- Only what the next orchestrator needs to act safely. Keep the values needed to roll back. -->
- Website: main <7 characters>, after-merge checks <OK / what failed>.
- Backend: version <name>, health check <result>.
- Switches: <which paid features or scheduled jobs are on or off, and since when>.
- Caps: <any cap that changed today, with the old value>.

## Waiting on the owner
<!-- One line each, with the to-do card key. Only questions the owner has not answered. -->
- <source>:<date>:<short-name> — <the question in one line>, recommendation <A or B>.

## Scheduled checks
- <date, local time>: <what to check, and how>.

## Only this chat knows
<!-- Promises and facts written nowhere else. If this section is empty, write "nothing". -->
- <fact or promise>

## Next up
1. <ticket> — <why it is first>
2. <ticket> — <why>
3. <ticket> — <why>
4. <ticket> — <why>
5. <ticket> — <why>
```


## Appendix H: To-do card template (`templates/todo-card.md`)

### To-do card for the owner

The owner reads one to-do list and nothing else. Every question, click or key the owner must give becomes one card on that list. The card is the record; the chat and the daily message may repeat the question, but they never replace the card.

#### Fields

| Field | What goes in it |
|---|---|
| **Task** | One plain sentence: what the owner must decide or do. |
| **Why** | Who is waiting and what is blocked until the owner answers. |
| **Source** | The chat or agent that asks (for example "Orchestrator"). |
| **Link** | Where to look: the ticket, the pull request, the screen. |
| **Source key** | `<source>:<date>:<short-name>`, unique. Search for it before you add a card, so there is never a duplicate. |
| **Minutes** | How long it takes the owner. |
| **Status** | "To do", "Doing" or "Done" (plus "New" and "Parked" if you use them; see `templates/notion-setup.md`). "Doing" is the owner's own column: agents never move a card into it or out of it. |

#### Body: four parts, in plain words

1. **What is going on.**
2. **Why it is the owner's decision** (which of the owner's areas it falls in).
3. **What each option does:** option A and option B.
4. **The recommendation**, and why.

No ticket numbers as shorthand: say what the work is, and add the number only as a link.

#### Rules

- **One card per question.** Never an umbrella card that collects other cards.
- **One sitting, one card.** Two things the owner does on the same screen go on one card.
- **Tell first, then the card.** Put the question to the owner in the chat or the daily message first. Never create a card for something the owner has never heard about.
- **Close it in the same turn.** When the owner answers, move the card to Done at once and write the decision, with its date, on the ticket.
- **Never stretch a decision.** If a new case is close to an earlier decision but not the same, ask again with a new card.
- **When work is blocked on the owner:** one card, one notification, then take the next ticket. Do not decide for the owner and do not work around the block.

#### Example

> **Task:** Raise the monthly cap for the image service from <amount> to <amount>?
>
> **Why:** The cap was reached on <date>. New images for the website wait until the cap is raised or the month ends.
>
> **Source:** Orchestrator · **Link:** <ticket link> · **Source key:** `orchestrator:<date>:image-cap` · **Minutes:** 2
>
> **What is going on.** This month's image work used the whole cap, mostly for one large batch that is now finished.
>
> **Why it is your decision.** Raising a spending cap is in your money area.
>
> **Options.**
> A. Raise the cap to <amount> for this month only. The waiting images are made today.
> B. Keep the cap. The waiting images are made at the start of next month.
>
> **Recommendation: A.** The batch that used the cap is finished, and the extra amount is small.


## Appendix I: Setting up the two lists in Notion (`templates/notion-setup.md`)

### Setting up the two lists in Notion

We use Notion for the build board and for the owner's decision list (section 4 of the main guide explains why there are two lists). Any tool works if agents can read it, add to it and comment on it. This file shows our Notion setup, so you can copy it.

#### 1. Connect Notion to Claude Code

- Add Notion's official connector (an MCP server) to Claude Code. Notion's help pages give the current address and steps. The connection acts as the person who signed in, so agents can see everything that person can see.
- The connector gives tools such as `notion-search`, `notion-fetch`, `notion-query-data-sources`, `notion-create-pages`, `notion-update-page` and `notion-create-comment`. In Claude Code they carry a prefix (`mcp__<server>__notion-fetch`). Copy the exact names from a session; they can change between versions.
- Allow the tools that agents use often (fetch, query, create pages, update page, comment) in the permissions of `~/.claude/settings.json`. A background agent that waits for an approval nobody sees waits until it is stopped.
- Give builders only the Notion tools they need, in the `tools:` line of `agents/builder.md`: search, fetch, comment and update page (and create pages, if builders may file follow-up tickets).
- Write the address of each database and its data source id into the skills, as `<board data source>` and `<decision list data source>`. Agents should not search for the databases every time.

#### 2. The build board

A Notion database that the team and all agents share.

| Property | Type | What it is for |
|---|---|---|
| Ticket | Title | A short, plain name for the work. |
| Ticket ID | Text | Unique and never changed, for example `<area>-<number>`. It goes in the pull request title and the branch name. Done tickets keep their numbers. |
| Status | Status | For example New, Ready, In progress, In review, Done, and Blocked. Write the exact names into the skills, so every agent uses the same ones. |
| Priority | Select | The order in which the orchestrator takes tickets. |
| Size | Select | S, M or L. Helps with the size rule (more than about 1,500 changed lines means several pull requests). |
| Area | Select | Groups tickets by part of the product. |
| Touch area | Multi-select | Which parts of the code the ticket changes. The orchestrator uses it to keep two builders off the same files. |
| Merge risk | Select | Low or high. High means the security lens and two reviewers, or a merge only in the quiet window. |
| Depends on | Relation (same database) | Which ticket must merge first. Sets the merge order of stacked pull requests. |
| Orchestrator | Checkbox | Ticked means the orchestrator may take this ticket. |
| Pull request | URL | The link, added when the draft opens. |

**Ticket body.** Every ticket uses the same four headings, so a builder can start without asking:

```markdown
## Why
<one or two plain sentences: what is wrong or missing, and who it affects>
## What we want
<bullets>
## Done when
<bullets the orchestrator can check>
## Notes for the builder
<files, related tickets, limits, areas not to touch>
```

**Views.**

- *Orchestrator queue:* Orchestrator is ticked and Status is not Done, sorted by Priority. The orchestrator reads this view every morning.
- *All open:* a board view grouped by Status.
- One view per person, if people work from the board too.

**How the orchestrator and its agents write on the board.**

- The plan is a dated comment on the ticket.
- Progress is a dated comment as each step lands: draft opened, review verdict, merged, after-merge checks. Never rewrite the body to report progress.
- The Status moves when work starts, when the pull request is in review, and to Done only after the merge and the after-merge checks, with the pull request link and how it was checked.
- Any chat that finds work for the orchestrator adds a ticket (after searching for a duplicate), ticks Orchestrator, and adds a comment: who sent it, what to do, what the owner has already decided (with the date), and whether it needs the owner.

#### 3. The owner's decision list

A Notion database inside a private page that only the owner (and the owner's connection) can open.

| Property | Type | What it is for |
|---|---|---|
| Task | Title | One plain sentence: what the owner must decide or do. |
| Status | Select | New, To do, Doing, Done, Parked (see below). |
| Priority | Select | Today or This week. It can stay empty. |
| Why | Text | Who is waiting, and what is blocked until the owner answers. |
| Source | Text | The chat or agent that asks, for example "Orchestrator". |
| Link | URL | The ticket, pull request or screen to look at. |
| Minutes | Number | How long it takes the owner. |
| Source key | Text | `<source>:<date>:<short-name>`, unique. Agents search for it before they add a card. |
| Added | Created time | Filled in by Notion. |

**The columns.**

- *New:* a routine found something but could not judge where it belongs. The owner sorts it.
- *To do:* someone waits on the owner. Agents add their decision cards here.
- *Doing:* the owner's own column. Agents never move a card into it or out of it.
- *Done:* answered or finished. Agents move a card here in the same turn the owner answers.
- *Parked:* the owner has put it aside.

The card body has four parts: what is going on, why it is the owner's decision, options A and B, and the recommendation (see `templates/todo-card.md`). The main view is a board grouped by Status, with Done hidden.

**How the owner answers.** In the chat with the orchestrator, or with a comment on the card. Every morning the orchestrator reads the cards with its source key that have a new comment or a new status, writes each decision with its date on the ticket, and moves the card to Done.

Other routines can add cards to the same list, each with its own Source. The owner still reads only one list.

#### 4. Rules that save trouble

1. **Add, never replace.** Notion's page update has a command that replaces the page content. It replaces the whole page body, even when you give it only a small piece of text to match. We lost page content this way twice. Agents add text at the end of a page or write a comment. If a body really must change: fetch it first, send the complete new body, then fetch it again to check.
2. **Search before you create.** Look for the ticket ID or the source key first, so there is never a duplicate.
3. **Read through saved views.** The query tool can read through a saved view or with an SQL-style query. In our use, the SQL-style queries hit a usage limit on busy days, and reads through a saved view did not. Point the skills at saved views.
4. **Ticket IDs never change.** Pull requests, commits and handovers refer to them.
5. **The decision list stays off the build board.** The team can see the board.
6. **Plain words.** Other people and fresh agents with no memory read the tickets: no shorthand, no private nicknames.
7. **Nothing secret in Notion.** No keys or passwords on any page: agents read these pages.
8. **The board is not proof.** Before saying that something is done or live, check GitHub and production (lesson 14 of the main guide).


## Appendix J: Merge gate: rules, install, test (`templates/merge-gate-hook.md`)

### The merge gate

#### What it is, and why

The merge gate is a small script that runs before every shell command an AI session makes, and refuses the merge command unless the rules hold. In Claude Code this is a **PreToolUse hook**: Claude Code runs it before each Bash command and passes the command in as JSON. If the script answers "deny", the command does not run, and the session sees the reason.

It exists because rules that agents must remember get forgotten, especially after a long chat is compressed. With the gate, the rule lives in a machine, not in the agent's memory.

Its threat model is narrow on purpose: it stops **accidental or careless** merges by AI sessions that follow the process. It is not a defence against a person who wants to bypass it (for example by merging on the GitHub website). It reads only the command line: it cannot see what a script file does when a command runs it. So agents merge only with a plain `gh pr merge <number>` command, and a command that mentions a merge or a push to main in a form the gate cannot read is refused.

#### The rules, in short pseudocode

```
on every shell command:
    command = strip quoted text, heredocs and comments      # a commit message that mentions "merge" is ignored
    if command has no merge and no push to main: allow

    refuse if: merge through "gh api", GraphQL, "bash -c" or "eval"
    refuse if: push to main
    refuse if: the command mentions "pr merge" or a push to main in a form the gate cannot read
    refuse if: more than one merge in one command
    refuse if: --auto or --admin
    refuse if: the pull request is not given as a literal number

    pr = gh pr view <number> --json state,isDraft,baseRefName,headRefOid,files,comments,statusCheckRollup
    if pr cannot be read: refuse                             # fail closed

    refuse if: pr is not open
    refuse if: pr is a draft, or the draft state is missing  # a draft runs no CI
    refuse if: pr base is not main                           # protects the stacked-PR order
    for each required CI check:
        refuse if: no run on the head commit succeeded       # a skipped run is not a pass
    refuse if: any CI result on the head commit is red or still running
    refuse if: --match-head-commit is missing or not the head commit
    refuse if: pr changes a rules file                       # the owner merges those

    verdicts = final-review markers in comments from allowed accounts, for the head commit
    refuse if: any verdict on the head commit is "changes"
    needed = 2 if pr touches a security-sensitive file else 1
    refuse if: fewer than <needed> approving verdicts from an allowed model

    optional: if pr touches backend code and long jobs may be running:
        refuse unless an idle check passed in the last 10 minutes, or the time is inside the quiet window

    allow

if the gate itself fails to load or crashes:
    refuse any command that could merge or push; let other commands run, so a session can repair the gate
```

The verdict marker the final reviewer writes in its comment:

```
<!-- final-review verdict=approved|changes sha=<full 40-character head commit> model=<exact model id> -->
```

#### Install it (Claude Code)

1. Copy `merge-gate.example.mjs` to `scripts/merge-gate/merge-gate.mjs` in your repository.
2. Edit the constants at the top: `REQUIRED_CHECKS` (the exact check names GitHub shows), `REVIEW_MODELS`, `REVIEW_AUTHORS`, `RULES_PATTERNS`, `SENSITIVE_PATTERNS`.
3. Register it in `.claude/settings.json` of the repository:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/merge-gate/merge-gate.mjs\"",
            "timeout": 45,
            "statusMessage": "Merge gate: checking CI and the final review"
          }
        ]
      }
    ]
  }
}
```

4. Add the gate's own files and `.claude/settings.json` to the rules files, so only the owner can merge changes to the gate.
5. Keep the main checkout on the main branch. The hook runs from the folder where the session started; a folder on an old branch may have no gate, or an old one.

#### Test it

Write a test file that imports `decideMerge` and `parseMergeCommand` and calls them with sample pull request data. Cover at least: the normal case (allowed); a draft; a base that is not main; a check that was only skipped; a check still running; a wrong or missing `--match-head-commit`; a rules file; a sensitive file with one approval and with two; a "changes" verdict; a verdict from the wrong model, the wrong account, or for an older commit; and commands that only mention a merge inside quotes. Run it in CI, so a change that weakens the gate fails.

Note: if a gate is already active in the folder where you write the tests, a shell command that contains merge text in its arguments is refused too. Write test files with an editor, not with a shell command.

#### Dry-run the gate before a merge ("gatecheck")

This sends the would-be merge command to the gate without running it. Empty output means the gate would allow it.

```bash
N=123; SHA=$(gh pr view "$N" --json headRefOid -q .headRefOid); printf '{"tool_name":"Bash","tool_input":{"command":"gh pr merge %s --squash --delete-branch --match-head-commit %s"}}' "$N" "$SHA" | node scripts/merge-gate/merge-gate.mjs
```

#### If your hosting plan supports branch protection

Use it as well: required status checks, and a required status that a small CI job sets when it finds an approving verdict marker for the head commit. The hook still helps, because it refuses the wrong merge command before it runs and explains why.


## Appendix K: Merge gate: trimmed example script (`templates/merge-gate.example.mjs`)

```js
#!/usr/bin/env node
// Merge gate: a Claude Code PreToolUse hook (register it in .claude/settings.json for the Bash tool).
// It refuses `gh pr merge` unless all of these hold for the pull request:
//   - it is open, not a draft, and targets the base branch;
//   - every required CI check has at least one successful run on the head commit, and nothing is red or still running;
//   - the command passes --match-head-commit with the exact head commit;
//   - an allowed reviewer model posted an approving final-review marker for that head commit
//     (two approvals when security-sensitive files changed), and no review asks for changes;
//   - it does not change the rules files (the owner merges those).
// It also refuses merges through `gh api`, GraphQL, `bash -c` or `eval`, `--auto`, `--admin`, and pushes to the base branch.
//
// Threat model: it stops ACCIDENTAL or careless merges by AI sessions that follow the process.
// It is not a defence against someone who bypasses it on purpose (for example on the GitHub website).
//
// Fails closed: if the pull request cannot be read, the merge is refused. If the gate itself breaks,
// any command that could merge or push is refused; other commands still run, so a session can repair it.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---- Edit these for your repository ----------------------------------------------------------

/** Exact check names, as `gh pr view <N> --json statusCheckRollup` shows them. */
export const REQUIRED_CHECKS = ['<your CI check name>'];

/** Model ids allowed to give the final review (the reviewer writes its own exact id into the marker). */
export const REVIEW_MODELS = ['claude-opus-5-5'];

/** GitHub accounts whose comments may carry a verdict. */
export const REVIEW_AUTHORS = ['<github account that posts the verdicts>'];

export const BASE_BRANCH = 'main';

/** The rules themselves: only the owner merges changes to these. */
export const RULES_PATTERNS = [
  /^RULES\.md$/, // your one-page rules file
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.claude\/settings(\.local)?\.json$/,
  /^\.claude\/agents\/final-reviewer\.md$/,
  /^scripts\/merge-gate\//,
];

/** Changes to these need TWO approving final reviews (security lens). Examples: adapt to your code. */
export const SENSITIVE_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.claude\//,
  /^scripts\/merge-gate\//,
  /(^|\/)auth[^/]*\./,
  /(^|\/)billing\//,
  /(^|\/)db-rules\//, // your database access rules
];

// ---- Rules (pure functions, easy to test) ---------------------------------------------------------

const MARKER_RE = /<!--\s*final-review\s+verdict=(approved|changes)\s+sha=([0-9a-f]{40})\s+model=([a-z0-9.-]+)\s*-->/g;

/** Blank out heredoc bodies, comments and quoted strings, so a commit message that mentions a merge is ignored. */
export function stripQuoted(command) {
  const src = String(command || '').replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, ' HEREDOC ');
  let out = '';
  let state = null; // null, "'" or '"'
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (state === null) {
      if (ch === '#' && (i === 0 || /\s/.test(src[i - 1]))) {
        while (i < src.length && src[i] !== '\n') i += 1;
        out += '\n';
        continue;
      }
      if (ch === '\\') { out += ' '; i += 1; continue; }
      if (ch === "'" || ch === '"') { state = ch; out += 'Q'; continue; }
      out += ch;
    } else if (state === "'") {
      if (ch === "'") state = null;
    } else {
      if (ch === '\\') { i += 1; continue; }
      if (ch === '"') state = null;
    }
  }
  return out;
}

const GH = String.raw`(?:^|[^\w./-])(?:[\w./-]*\/)?gh`;
const REPO_FLAG = String.raw`(?:\s+(?:-R|--repo)(?:\s+|=)\S+)?`;
const GH_MERGE_RE = new RegExp(GH + '(' + REPO_FLAG + String.raw`)\s+pr(` + REPO_FLAG + String.raw`)\s+merge\b([^;&|\n)\`}]*)`, 'g');
const GH_API_MERGE_RE = new RegExp(GH + String.raw`\s+api\b[^;&|\n]*\/merges?\b`);
const PUSH_BASE_RE = new RegExp(String.raw`(?:^|[^\w./-])git(?:\s+(?:-[Cc]\s+\S+|--[\w-]+(?:=\S+)?))*\s+push\b[^;&|\n]*(?:\s|:)(?:refs\/heads\/)?` + BASE_BRANCH + String.raw`(?=\s|$|[;&|)])`);
const VALUE_FLAGS = new Set(['-t', '--subject', '-b', '--body', '-F', '--body-file', '-R', '--repo', '-A', '--author-email', '--match-head-commit']);

/** Returns null when the command merges nothing, otherwise { pr, repo, matchHeadCommit, problems }. */
export function parseMergeCommand(command) {
  const raw = String(command || '');
  // Undo simple disguises first: g\h becomes gh, and a quoted single word such as "gh" or 'push' loses its quotes.
  const s = stripQuoted(raw.replace(/\\([A-Za-z0-9])/g, '$1').replace(/(["'])([\w./-]*)\1/g, '$2'));
  const problems = [];
  if (GH_API_MERGE_RE.test(s)) problems.push('Merging through `gh api` is not allowed: use `gh pr merge <number>`.');
  if (PUSH_BASE_RE.test(s)) problems.push(`Pushing to ${BASE_BRANCH} is not allowed: everything goes through a pull request.`);
  if (/\b(?:ba|z|da)?sh\s+-c\b|\beval\b/.test(raw) && /\bgh\b/.test(raw) && /\bmerge\b/.test(raw)) {
    problems.push('A merge inside `bash -c`, `sh -c` or `eval` cannot be checked: run `gh pr merge <number>` directly.');
  }
  if (/\bgh\s+api\s+graphql\b/.test(raw) && /mergePullRequest|enablePullRequestAutoMerge/i.test(raw)) {
    problems.push('Merging through the GraphQL API is not allowed: use `gh pr merge <number>`.');
  }
  const merges = [...s.matchAll(GH_MERGE_RE)];
  // Fail closed on what the gate cannot read, for example $(which gh) pr merge 12.
  if (merges.length === 0 && /\bpr\s+merge\b/.test(s)) {
    problems.push('This command contains "pr merge" in a form the gate cannot read: run `gh pr merge <number>` directly.');
  }
  if (!PUSH_BASE_RE.test(s) && new RegExp(String.raw`\bpush\b[^;&|\n]*(?:\s|:)(?:refs\/heads\/)?` + BASE_BRANCH + String.raw`(?=\s|$|[;&|)])`).test(s) && /\bgit\b/.test(s)) {
    problems.push(`This command looks like a push to ${BASE_BRANCH} in a form the gate cannot read: everything goes through a pull request.`);
  }
  if (merges.length === 0 && problems.length === 0) return null;
  if (merges.length > 1) problems.push('One merge per command, so each pull request gets its own check.');

  let pr = null, repo = null, matchHeadCommit = null;
  if (merges.length >= 1) {
    const m = merges[0];
    const repoFlag = /(?:-R|--repo)(?:\s+|=)(\S+)/.exec((m[1] || '') + ' ' + (m[2] || ''));
    if (repoFlag) repo = repoFlag[1];
    const tokens = m[3].trim().split(/\s+/).filter(Boolean);
    const positional = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '--auto') { problems.push('Auto-merge (--auto) is not used: merge once the gate is green.'); continue; }
      if (t === '--admin') { problems.push('--admin skips the checks and is not used.'); continue; }
      const eq = /^(--[a-z-]+)=(.*)$/.exec(t);
      if (eq) {
        if (eq[1] === '--match-head-commit') matchHeadCommit = eq[2];
        if (eq[1] === '--repo') repo = eq[2];
        continue;
      }
      if (VALUE_FLAGS.has(t)) {
        if (t === '--match-head-commit') matchHeadCommit = tokens[i + 1];
        if (t === '-R' || t === '--repo') repo = tokens[i + 1];
        i += 1;
        continue;
      }
      if (t.startsWith('-')) continue;
      positional.push(t);
    }
    const target = positional[0];
    if (!target) problems.push('Name the pull request by number: `gh pr merge <number> --squash --match-head-commit <reviewed commit>`.');
    else if (/^\d+$/.test(target)) pr = target;
    else problems.push(`"${target}" is not a pull request number. Write the number itself, not a branch name or a variable.`);
  }
  return { pr, repo, matchHeadCommit, problems };
}

/** A run that really passed. SKIPPED and NEUTRAL are not red, but they are not a pass either. */
function succeeded(c) {
  if (c.__typename === 'StatusContext' || c.state) return c.state === 'SUCCESS';
  return c.status === 'COMPLETED' && c.conclusion === 'SUCCESS';
}

export function ciProblems(rollup) {
  const items = rollup || [];
  if (items.length === 0) return ['No CI result on this commit yet.'];
  const problems = [];
  for (const name of REQUIRED_CHECKS) {
    const runs = items.filter((c) => (c.name || c.context) === name);
    if (runs.length === 0) problems.push(`${name} has not run on this commit.`);
    else if (!runs.some(succeeded)) problems.push(`${name} has no successful run on this commit (skipped, pending or failed runs do not count).`);
  }
  for (const c of items) {
    const name = c.name || c.context || 'a check';
    if (c.__typename === 'StatusContext' || c.state) {
      if (c.state !== 'SUCCESS') problems.push(`${name} is ${c.state || 'pending'}.`);
    } else if (c.status !== 'COMPLETED') problems.push(`${name} is still running.`);
    else if (!['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion)) problems.push(`${name} ended ${c.conclusion}.`);
  }
  return problems;
}

/** pr = gh pr view --json number,state,isDraft,baseRefName,headRefOid,files,comments,statusCheckRollup */
export function decideMerge(pr, merge) {
  const reasons = [...merge.problems];
  if (!pr) return { allow: false, reasons };
  if (pr.state !== 'OPEN') reasons.push(`The pull request is ${pr.state}.`);
  // A draft runs no CI; a missing value counts as a draft (fail closed).
  if (pr.isDraft !== false) reasons.push('The pull request is still a draft. Mark it ready, wait for CI to finish, and merge in a later command.');
  if (pr.baseRefName !== BASE_BRANCH) {
    reasons.push(`The pull request targets "${pr.baseRefName}", not ${BASE_BRANCH}. Stacked pull requests: merge the lower one first (merge commit, keep its branch), check that this one still contains it, then change this one's base.`);
  }
  for (const p of ciProblems(pr.statusCheckRollup)) reasons.push(`CI: ${p}`);

  const head = String(pr.headRefOid || '');
  if (merge.matchHeadCommit !== head) reasons.push(`Pass --match-head-commit ${head}, so the merge fails if anything was pushed after the review.`);

  const files = (pr.files || []).map((f) => String(f.path));
  if (files.some((p) => RULES_PATTERNS.some((re) => re.test(p)))) reasons.push('This pull request changes the rules files. The owner merges those.');

  const verdicts = [];
  for (const c of pr.comments || []) {
    if (!REVIEW_AUTHORS.includes(c.author && c.author.login)) continue;
    for (const m of String(c.body || '').matchAll(MARKER_RE)) {
      if (m[2] === head) verdicts.push({ verdict: m[1], model: m[3], id: c.id || c.url || c.createdAt });
    }
  }
  const approvals = new Set(verdicts.filter((v) => v.verdict === 'approved' && REVIEW_MODELS.includes(v.model)).map((v) => v.id));
  const needed = files.some((p) => SENSITIVE_PATTERNS.some((re) => re.test(p))) ? 2 : 1;
  if (verdicts.some((v) => v.verdict === 'changes')) reasons.push('A final review on the head commit asks for changes. Fix it in a new commit and review that commit.');
  else if (approvals.size < needed) reasons.push(`Needs ${needed} approving final review(s) from ${REVIEW_MODELS.join(', ')} on head ${head.slice(0, 7)}; has ${approvals.size}.`);

  return { allow: reasons.length === 0, reasons };
}

// ---- Hook plumbing --------------------------------------------------------------------------------

/** True when a command could be a merge or a push: used to fail closed when the gate itself breaks. */
export function couldMergeOrPush(text) {
  const s = String(text ?? '');
  return /push/i.test(s) || (/gh/i.test(s) && /merge/i.test(s));
}

function readPr(merge) {
  const args = ['pr', 'view', merge.pr];
  if (merge.repo) args.push('--repo', merge.repo);
  args.push('--json', 'number,state,isDraft,baseRefName,headRefOid,files,comments,statusCheckRollup');
  return JSON.parse(execFileSync('gh', args, { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8', timeout: 30000 }));
}

/** null = let the command run; a string = refuse it with this reason. */
export function hookDecision(input) {
  let command = '';
  try {
    command = String(JSON.parse(input || '{}')?.tool_input?.command || '');
  } catch {
    return couldMergeOrPush(input) ? 'the hook input could not be read, so a command that could merge or push is refused.' : null;
  }
  try {
    const merge = parseMergeCommand(command);
    if (!merge) return null;
    if (!merge.pr) return `this command cannot be checked:\n- ${merge.problems.join('\n- ')}`;
    let pr;
    try {
      pr = readPr(merge);
    } catch (e) {
      return `could not read pull request #${merge.pr} with gh (${String(e.message).split('\n')[0]}). Check that gh is signed in.`;
    }
    const result = decideMerge(pr, merge);
    return result.allow ? null : `pull request #${merge.pr} cannot be merged yet:\n- ${result.reasons.join('\n- ')}`;
  } catch (e) {
    return couldMergeOrPush(command) ? `the merge gate could not run (${String(e.message).split('\n')[0]}), so a command that could merge or push is refused.` : null;
  }
}

function runDirectly() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runDirectly()) {
  let input = '';
  // Anything that escapes: exit code 2 blocks the command in Claude Code.
  const crash = () => process.exit(couldMergeOrPush(input) ? 2 : 0);
  process.on('uncaughtException', crash);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => {
    const reason = hookDecision(input);
    if (reason) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Merge gate: ${reason}` },
      }));
    }
    process.exit(0);
  });
}
```
