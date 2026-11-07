#!/usr/bin/env python3
"""Zero-False-Completion Protocol enforcement, shared by git hooks, Claude Code hooks,
the Hermes plugin and CI. Stdlib only. Rules live in protocol_rules.json next to this file.

Exit codes: 0 = allowed, 1 = protocol violation (blocked), 2 = internal error (callers fail open
and warn, so a bug here can never lock every git command).
"""
from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RULES_PATH = os.path.join(HERE, "protocol_rules.json")
LOG_PATH = os.path.join(HERE, "logs", "violations.log")
ZERO_SHA = "0" * 40

_rules_cache: dict | None = None


def load_rules() -> dict:
    global _rules_cache
    if _rules_cache is None:
        with open(RULES_PATH, encoding="utf-8") as fh:
            _rules_cache = json.load(fh)
    return _rules_cache


def expand(path: str) -> str:
    return os.path.realpath(os.path.expanduser(path))


def log_event(tool: str, kind: str, detail: str) -> None:
    """Append one JSON line to the audit log. Never raises: auditing must not break the work."""
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        entry = {
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "tool": tool,
            "kind": kind,
            "cwd": os.getcwd(),
            "detail": detail[:500],
        }
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------- text / claims

def strip_code(text: str) -> str:
    """Remove fenced and inline code so quoted commands are not read as claims."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    return re.sub(r"`[^`\n]*`", " ", text)


def find_claims(text: str) -> list[str]:
    rules = load_rules()
    body = re.sub(r"[^.!?\n]*\?", " ", strip_code(text))  # questions are not claims
    hits: list[str] = []
    for pattern in rules["completion_claim_patterns"]:
        for match in re.finditer(pattern, body, flags=re.I):
            hits.append(match.group(0).strip())
    return hits


def find_status_words(text: str) -> list[str]:
    rules = load_rules()
    return [w for w in rules["status_words"] if re.search(r"\b" + re.escape(w) + r"\b", text)]


def lint_reply(text: str) -> str | None:
    """Return a violation message if the reply claims completion without any protocol status."""
    claims = find_claims(text)
    if not claims:
        return None
    if find_status_words(text):
        return None
    words = ", ".join(load_rules()["status_words"])
    return (
        "This reply claims completion (" + "; ".join(sorted(set(claims))[:3]) + ") but states no status. "
        "Protocol rule 8: every claim is exactly one of: " + words + ". "
        "Restate it with a status, and say what was not tested."
    )


# ---------------------------------------------------------------- commit messages

def parse_trailer(message: str, name: str) -> str | None:
    match = re.search(r"^" + name + r":[ \t]*(.*)$", message, flags=re.M | re.I)
    return match.group(1).strip() if match else None


def check_commit_message(message: str) -> list[str]:
    rules = load_rules()
    lines = [ln for ln in message.splitlines() if not ln.startswith("#")]
    body = "\n".join(lines).strip()
    if not body:
        return []
    first = body.splitlines()[0]
    if re.match(r"^(Merge |Revert |fixup! |squash! )", first):
        return []
    problems: list[str] = []
    status = parse_trailer(body, "Status")
    valid = rules["status_words"]
    if status is None:
        problems.append("Missing 'Status:' trailer. Add one of: " + " | ".join(valid))
        return problems
    status_norm = status.upper()
    if status_norm not in valid:
        problems.append("Status '" + status + "' is not a protocol status. Use exactly one of: " + " | ".join(valid))
        return problems
    claims = find_claims(body)
    if claims and status_norm != "VERIFIED":
        problems.append(
            "The message claims completion (" + "; ".join(sorted(set(claims))[:3]) + ") but Status is "
            + status_norm + ". Reword the claim, or set 'Status: VERIFIED' with real Evidence."
        )
    if status_norm == "VERIFIED":
        evidence = parse_trailer(body, "Evidence")
        if evidence is None or evidence == "":
            problems.append("'Status: VERIFIED' needs an 'Evidence:' trailer (what you ran or checked and what you saw).")
        else:
            lowered = evidence.lower().strip(" .")
            if lowered in rules["evidence_placeholders"] or len(evidence) < rules["evidence_min_chars"]:
                problems.append("Evidence is too thin. Name what you ran and what came back, at least "
                                + str(rules["evidence_min_chars"]) + " characters.")
            elif not re.search(r"[0-9/`]", evidence):
                problems.append("Evidence must be concrete: include a command, path, URL or number you actually saw.")
    return problems


# ---------------------------------------------------------------- paths / commands / secrets

def banned_dir_for(path: str) -> str | None:
    target = expand(path)
    for banned in load_rules()["banned_project_dirs"]:
        root = expand(banned)
        if target == root or target.startswith(root + os.sep):
            return banned
    return None


def forbidden_command(command: str) -> str | None:
    for item in load_rules()["forbidden_command_patterns"]:
        if re.search(item["pattern"], command):
            return item["why"]
    return None


def scan_added_lines(diff_text: str) -> list[str]:
    rules = load_rules()
    marker = rules["secret_allow_marker"]
    patterns = [re.compile(p) for p in rules["secret_patterns"]]
    hits: list[str] = []
    current = ""
    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current = line[6:]
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        if marker in line:
            continue
        for pattern in patterns:
            if pattern.search(line):
                hits.append(current + ": matches " + pattern.pattern[:40])
                break
    return hits


def secret_filenames(paths: list[str]) -> list[str]:
    compiled = [re.compile(p, flags=re.I) for p in load_rules()["secret_filenames"]]
    return [p for p in paths if any(c.search(p) for c in compiled)]


# ---------------------------------------------------------------- git helpers

def git(*args: str, check: bool = False) -> str:
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError("git " + " ".join(args) + ": " + result.stderr.strip())
    return result.stdout


def bypass_reason() -> str | None:
    reason = os.environ.get("PROTOCOL_BYPASS", "").strip()
    return reason or None


def block(tool: str, kind: str, lines: list[str]) -> int:
    reason = bypass_reason()
    if reason:
        log_event(tool, "bypass", kind + ": " + reason)
        sys.stderr.write("[protocol] BYPASSED (" + reason + "), logged.\n")
        return 0
    log_event(tool, "violation", kind + ": " + " | ".join(lines))
    sys.stderr.write("\n[protocol] BLOCKED: " + kind + "\n")
    for line in lines:
        sys.stderr.write("  - " + line + "\n")
    sys.stderr.write("  Zero-False-Completion Protocol v1.0. Only Brad can bypass (PROTOCOL_BYPASS=\"reason\").\n\n")
    return 1


# ---------------------------------------------------------------- subcommands

def cmd_commit_msg(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        problems = check_commit_message(fh.read())
    return block("git", "commit message", problems) if problems else 0


def cmd_pre_commit() -> int:
    problems: list[str] = []
    top = git("rev-parse", "--show-toplevel").strip()
    where = banned_dir_for(top) if top else None
    if where:
        problems.append("This repo lives in " + where + ". Projects live under "
                        + load_rules()["canonical_projects_dir"] + "/<project-slug>. Move it, then commit.")
    staged = [p for p in git("diff", "--cached", "--name-only", "--diff-filter=ACM").splitlines() if p]
    for name in secret_filenames(staged):
        problems.append("Credential-style file staged: " + name)
    diff = git("diff", "--cached", "-U0", "--no-color", "--diff-filter=ACM")
    problems.extend("Possible secret in " + hit for hit in scan_added_lines(diff))
    return block("git", "pre-commit", problems) if problems else 0


def _commits_to_audit(local_sha: str, remote_sha: str) -> list[str]:
    if remote_sha == ZERO_SHA:
        out = git("rev-list", local_sha, "--not", "--remotes")
    else:
        out = git("rev-list", remote_sha + ".." + local_sha)
    return [c for c in out.split() if c]


def cmd_pre_push(stdin_text: str) -> int:
    rules = load_rules()
    cutoff = int(rules["enforce_after_epoch"])
    problems: list[str] = []
    for raw in stdin_text.splitlines():
        parts = raw.split()
        if len(parts) != 4:
            continue
        _local_ref, local_sha, remote_ref, remote_sha = parts
        if local_sha == ZERO_SHA:
            continue
        branch = remote_ref.rsplit("/", 1)[-1]
        if branch in rules["protected_branches"] and remote_sha != ZERO_SHA:
            ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", remote_sha, local_sha]).returncode == 0
            if not ancestor:
                problems.append("Non-fast-forward push to protected branch '" + branch
                                + "' would rewrite approved history (rule 3).")
        for sha in _commits_to_audit(local_sha, remote_sha):
            when = int((git("log", "-1", "--format=%at", sha).strip() or "0"))
            if when < cutoff:
                continue
            message = git("log", "-1", "--format=%B", sha)
            for issue in check_commit_message(message):
                problems.append(sha[:8] + ": " + issue)
    return block("git", "pre-push", problems) if problems else 0


def cmd_post_commit() -> int:
    """Detect commits that skipped the hooks (git commit --no-verify) and make that loud."""
    message = git("log", "-1", "--format=%B")
    issues = check_commit_message(message)
    if issues:
        sha = git("rev-parse", "--short", "HEAD").strip()
        log_event("git", "bypass-detected", sha + ": " + " | ".join(issues))
        sys.stderr.write("\n[protocol] WARNING: commit " + sha + " does not meet the protocol (hooks were skipped).\n")
        for issue in issues:
            sys.stderr.write("  - " + issue + "\n")
        sys.stderr.write("  Fix it with: git commit --amend  (add Status/Evidence). Logged to violations.log.\n\n")
    return 0


def cmd_reply(text: str) -> int:
    problem = lint_reply(text)
    if problem:
        log_event("reply", "violation", problem)
        sys.stderr.write("[protocol] " + problem + "\n")
        return 1
    return 0


def _read_json_stdin() -> dict:
    raw = sys.stdin.read()
    return json.loads(raw) if raw.strip() else {}


def _last_assistant_text(transcript_path: str) -> str:
    last = ""
    with open(transcript_path, encoding="utf-8") as fh:
        for line in fh:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            message = entry.get("message") if isinstance(entry, dict) else None
            if not isinstance(message, dict) or message.get("role") != "assistant":
                continue
            content = message.get("content")
            if isinstance(content, str):
                last = content
            elif isinstance(content, list):
                texts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
                if texts:
                    last = "\n".join(texts)
    return last


def cmd_claude_stop() -> int:
    event = _read_json_stdin()
    text = _last_assistant_text(event.get("transcript_path", ""))
    problem = lint_reply(text) if text else None
    if not problem:
        return 0
    log_event("claude-code", "violation", problem)
    if event.get("stop_hook_active"):
        return 0  # already pushed back once this turn; never loop
    print(json.dumps({"decision": "block", "reason": "[protocol] " + problem}))
    return 0


def _deny(reason: str) -> int:
    log_event("claude-code", "violation", reason)
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "[protocol] " + reason,
    }}))
    return 0


def cmd_claude_pretool() -> int:
    event = _read_json_stdin()
    tool_input = event.get("tool_input") or {}
    command = tool_input.get("command")
    if isinstance(command, str):
        why = forbidden_command(command)
        if why:
            return _deny(why)
    for key in ("file_path", "path", "notebook_path"):
        value = tool_input.get(key)
        if isinstance(value, str):
            banned = banned_dir_for(value)
            if banned:
                return _deny("Do not write in " + banned + ". Projects live under "
                             + load_rules()["canonical_projects_dir"] + "/<project-slug>.")
    return 0


def cmd_claude_session_start() -> int:
    rules = load_rules()
    context = (
        "Zero-False-Completion Protocol v1.0 is ENFORCED by hooks on this machine, not just advised. "
        "Every completion claim must carry exactly one status: " + ", ".join(rules["status_words"]) + ". "
        "Replies that say done/fixed/ready without a status are blocked at stop. Git commits need "
        "'Status:' (and 'Evidence:' when VERIFIED) trailers. --no-verify, force-push, and writing in "
        + ", ".join(rules["banned_project_dirs"]) + " are denied. Projects live under "
        + rules["canonical_projects_dir"] + "/<project-slug>."
    )
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}))
    return 0


def cmd_ci() -> int:
    base = os.environ.get("BASE_SHA", "")
    head = os.environ.get("HEAD_SHA", "")
    body = os.environ.get("PR_BODY", "") or ""
    problems: list[str] = []
    if base and head:
        for sha in git("rev-list", base + ".." + head).split():
            msg = git("log", "-1", "--format=%B", sha)
            for issue in check_commit_message(msg):
                problems.append(sha[:8] + ": " + issue)
    status = parse_trailer(body, "Status")
    if status is None or status.upper() not in load_rules()["status_words"]:
        problems.append("PR description needs 'Status: <VERIFIED|IMPLEMENTED BUT UNVERIFIED|ASSUMED|INCOMPLETE>'.")
    elif status.upper() == "VERIFIED":
        evidence = parse_trailer(body, "Evidence") or ""
        if len(evidence) < load_rules()["evidence_min_chars"]:
            problems.append("PR says VERIFIED but 'Evidence:' is missing or too thin.")
    for line in problems:
        sys.stderr.write("[protocol] " + line + "\n")
    return 1 if problems else 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("usage: protocol_check.py <subcommand> [args]\n")
        return 2
    sub = argv[1]
    try:
        if sub == "git-commit-msg":
            return cmd_commit_msg(argv[2])
        if sub == "git-pre-commit":
            return cmd_pre_commit()
        if sub == "git-pre-push":
            return cmd_pre_push(sys.stdin.read())
        if sub == "git-post-commit":
            return cmd_post_commit()
        if sub == "reply":
            return cmd_reply(sys.stdin.read())
        if sub == "command":
            why = forbidden_command(sys.stdin.read())
            if why:
                sys.stderr.write("[protocol] " + why + "\n")
                return 1
            return 0
        if sub == "path":
            banned = banned_dir_for(argv[2])
            if banned:
                sys.stderr.write("[protocol] banned project dir: " + banned + "\n")
                return 1
            return 0
        if sub == "claude-stop":
            return cmd_claude_stop()
        if sub == "claude-pretool":
            return cmd_claude_pretool()
        if sub == "claude-session-start":
            return cmd_claude_session_start()
        if sub == "ci":
            return cmd_ci()
        sys.stderr.write("unknown subcommand: " + sub + "\n")
        return 2
    except (OSError, ValueError, KeyError, RuntimeError, IndexError) as exc:
        sys.stderr.write("[protocol] internal error in " + sub + ": " + repr(exc) + " (failing open)\n")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
