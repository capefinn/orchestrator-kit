---
name: orchestrator-handover
description: End the orchestrator's day. Stops running builders safely, writes a short state file that tomorrow's /orchestrator reads, updates the board, and sends the owner the one daily message. Use when the owner types /orchestrator-handover or says "end of day" or "write the handover".
---

# /orchestrator-handover — close the day

Goal: tomorrow's fresh orchestrator can start in two minutes from one short file, and nothing that is in progress is lost when this chat closes.

## 1. Stop the builders safely

- Get the owner's local time: `TZ=<owner's time zone> date`.
- For every builder or reviewer still running: if it will finish within about 10 minutes, wait for it. Otherwise send it this message: "Commit and push your work in progress to your branch now, add a dated comment on the ticket saying exactly what is done and what is left, then stop." Wait for each reply.
- Run your park check: the work in every builder folder of the last 24 hours is committed and pushed. A folder with work that exists only on this computer is not safe: ask its owner agent to push it, then check again.
- Nothing merges during the handover unless it was already approved and the gate passes.

## 2. Check the live state

- Run your status command for the open pull requests.
- Note what is switched on or off in production only if it changed today (verify it, do not guess).

## 3. Write the handover

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

## 4. Tidy up

- Remove worktrees whose pull request has merged. Never remove one whose pull request is still open.
- Board: every ticket touched today has the right status and a dated comment.
- The owner's to-do list: one card per open question (check the card key first, never a duplicate). Close every card the owner answered today. No umbrella cards.
- Rename this chat to `Orchestrator — closed <date>`, so tomorrow's `/orchestrator` is the only chat called "Orchestrator". Do not archive it yet: tomorrow's chat archives it after reading the `Old chat:` line. After the rename, merge nothing more.

## 5. The daily message

One message to the owner, at most 6 lines, in plain words:

- what was merged and released today (verified);
- what is still in progress;
- anything new that needs the owner (A/B with your recommendation; the card exists);
- tomorrow's first item.

End with: "Handover written. You can close this chat. Start tomorrow with /orchestrator."
