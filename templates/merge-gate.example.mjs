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
