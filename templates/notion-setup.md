# Setting up the two lists in Notion

We use Notion for the build board and for the owner's decision list (section 4 of the main guide explains why there are two lists). Any tool works if agents can read it, add to it and comment on it. This file shows our Notion setup, so you can copy it.

## 1. Connect Notion to Claude Code

- Add Notion's official connector (an MCP server) to Claude Code. Notion's help pages give the current address and steps. The connection acts as the person who signed in, so agents can see everything that person can see.
- The connector gives tools such as `notion-search`, `notion-fetch`, `notion-query-data-sources`, `notion-create-pages`, `notion-update-page` and `notion-create-comment`. In Claude Code they carry a prefix (`mcp__<server>__notion-fetch`). Copy the exact names from a session; they can change between versions.
- Allow the tools that agents use often (fetch, query, create pages, update page, comment) in the permissions of `~/.claude/settings.json`. A background agent that waits for an approval nobody sees waits until it is stopped.
- Give builders only the Notion tools they need, in the `tools:` line of `agents/builder.md`: search, fetch, comment and update page (and create pages, if builders may file follow-up tickets).
- Write the address of each database and its data source id into the skills, as `<board data source>` and `<decision list data source>`. Agents should not search for the databases every time.

## 2. The build board

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

## 3. The owner's decision list

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

## 4. Rules that save trouble

1. **Add, never replace.** Notion's page update has a command that replaces the page content. It replaces the whole page body, even when you give it only a small piece of text to match. We lost page content this way twice. Agents add text at the end of a page or write a comment. If a body really must change: fetch it first, send the complete new body, then fetch it again to check.
2. **Search before you create.** Look for the ticket ID or the source key first, so there is never a duplicate.
3. **Read through saved views.** The query tool can read through a saved view or with an SQL-style query. In our use, the SQL-style queries hit a usage limit on busy days, and reads through a saved view did not. Point the skills at saved views.
4. **Ticket IDs never change.** Pull requests, commits and handovers refer to them.
5. **The decision list stays off the build board.** The team can see the board.
6. **Plain words.** Other people and fresh agents with no memory read the tickets: no shorthand, no private nicknames.
7. **Nothing secret in Notion.** No keys or passwords on any page: agents read these pages.
8. **The board is not proof.** Before saying that something is done or live, check GitHub and production (lesson 14 of the main guide).
