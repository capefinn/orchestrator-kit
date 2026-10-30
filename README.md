# Orchestrator kit

This kit describes how we run a software build with one AI "orchestrator" session. The orchestrator plans the work and gives it to cheaper AI builders. A stronger model reviews every change. A script refuses any merge that does not have that review. The human owner is asked only a short, named list of questions.

We share it as an example to copy and adapt. It is not a product, and it does not need any of our code. Sections 1 to 4 explain how the building works and why. Section 5 shows how the same setup makes content: articles, videos, decks and other material. Section 6 has the lessons we learnt, and section 7 the technical setup.

## What is in this folder

| File | What it is |
|---|---|
| `README.md` | This guide |
| `orchestrator-guide.md` | The same guide and every file below in one document, for readers who do not use Claude Code |
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
