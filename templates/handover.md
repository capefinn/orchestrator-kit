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
