# The merge gate

## What it is, and why

The merge gate is a small script that runs before every shell command an AI session makes, and refuses the merge command unless the rules hold. In Claude Code this is a **PreToolUse hook**: Claude Code runs it before each Bash command and passes the command in as JSON. If the script answers "deny", the command does not run, and the session sees the reason.

It exists because rules that agents must remember get forgotten, especially after a long chat is compressed. With the gate, the rule lives in a machine, not in the agent's memory.

Its threat model is narrow on purpose: it stops **accidental or careless** merges by AI sessions that follow the process. It is not a defence against a person who wants to bypass it (for example by merging on the GitHub website). It reads only the command line: it cannot see what a script file does when a command runs it. So agents merge only with a plain `gh pr merge <number>` command, and a command that mentions a merge or a push to main in a form the gate cannot read is refused.

## The rules, in short pseudocode

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

## Install it (Claude Code)

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

## Test it

Write a test file that imports `decideMerge` and `parseMergeCommand` and calls them with sample pull request data. Cover at least: the normal case (allowed); a draft; a base that is not main; a check that was only skipped; a check still running; a wrong or missing `--match-head-commit`; a rules file; a sensitive file with one approval and with two; a "changes" verdict; a verdict from the wrong model, the wrong account, or for an older commit; and commands that only mention a merge inside quotes. Run it in CI, so a change that weakens the gate fails.

Note: if a gate is already active in the folder where you write the tests, a shell command that contains merge text in its arguments is refused too. Write test files with an editor, not with a shell command.

## Dry-run the gate before a merge ("gatecheck")

This sends the would-be merge command to the gate without running it. Empty output means the gate would allow it.

```bash
N=123; SHA=$(gh pr view "$N" --json headRefOid -q .headRefOid); printf '{"tool_name":"Bash","tool_input":{"command":"gh pr merge %s --squash --delete-branch --match-head-commit %s"}}' "$N" "$SHA" | node scripts/merge-gate/merge-gate.mjs
```

## If your hosting plan supports branch protection

Use it as well: required status checks, and a required status that a small CI job sets when it finds an approving verdict marker for the head commit. The hook still helps, because it refuses the wrong merge command before it runs and explains why.
