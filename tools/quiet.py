#!/usr/bin/env python3
"""Run a noisy command (tests, builds, installs) and show only what matters. Full output is kept in .usage-logs/.
Usage: python3 studio/usage/quiet.py "npm test"     Exit code is the command's own."""
import subprocess, sys, os, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
BAD = re.compile(r"error|fail|✖|not ok|traceback|exception|panic|denied|cannot|undefined", re.I)

def main():
    cmd = " ".join(sys.argv[1:])
    if not cmd:
        print(__doc__); return 2
    p = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    lines = p.stdout.splitlines()
    os.makedirs(".usage-logs", exist_ok=True)
    log = os.path.join(".usage-logs", time.strftime("%H%M%S") + ".log")
    open(log, "w").write(p.stdout)
    if len(lines) <= 30:
        shown = lines
    elif p.returncode == 0:
        shown = lines[-12:]
    else:
        hits = [l for l in lines[:-25] if BAD.search(l)][:40]
        shown = hits + ["..."] + lines[-25:]
    print("\n".join(shown))
    print(f"[quiet] exit {p.returncode}, showing {len(shown)} of {len(lines)} lines, full log: {log}")
    try:
        from common import event, load_config
        event("quiet", total=len(lines), shown=len(shown), chars_hidden=max(len(p.stdout) - sum(len(l) + 1 for l in shown), 0), v=load_config()["version"])
    except Exception:
        pass
    return p.returncode

if __name__ == "__main__":
    sys.exit(main())
