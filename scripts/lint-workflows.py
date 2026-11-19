#!/usr/bin/env python3
"""lint-workflows.py DIR - kiểm tra workflow/composite action theo chuẩn Papaya. Exit 1 nếu có lỗi."""
import re, sys, pathlib
import yaml
SHA = re.compile(r"^[0-9a-f]{40}$")
UNTRUSTED = re.compile(r"\$\{\{\s*(github\.event\.(issue|pull_request|comment|review|head_commit|commits|pages|discussion)[^}]*|github\.head_ref|github\.event\.workflow_run\.head_branch|inputs\.[^}]*|github\.event\.inputs\.[^}]*)\s*\}\}")
STATIC_KEY = re.compile(r"secrets\.AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|aws-(access-key-id|secret-access-key)", re.I)
def steps_of(doc):
    if "jobs" in doc:
        for jn, j in (doc["jobs"] or {}).items():
            for i, s in enumerate(j.get("steps") or []):
                yield f"jobs.{jn}.steps[{i}]", s
            if "uses" in j:
                yield f"jobs.{jn}", j
    elif isinstance(doc.get("runs"), dict):
        for i, s in enumerate(doc["runs"].get("steps") or []):
            yield f"runs.steps[{i}]", s
def lint(path, text):
    errs = []
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as e:
        return [f"{path}: YAML không hợp lệ: {e}"]
    if not isinstance(doc, dict):
        return [f"{path}: không phải mapping"]
    is_wf = "jobs" in doc
    if is_wf:
        on = doc.get("on", doc.get(True))
        names = on if isinstance(on, (list, str)) else list((on or {}).keys())
        if "pull_request_target" in ([names] if isinstance(names, str) else names):
            errs.append(f"{path}: dùng pull_request_target")
        if "permissions" not in doc:
            errs.append(f"{path}: thiếu permissions ở cấp workflow")
        top = doc.get("permissions")
        if isinstance(top, dict) and top.get("id-token") == "write":
            errs.append(f"{path}: id-token: write ở cấp workflow (chỉ cho phép ở cấp job)")
        for jn, j in doc["jobs"].items():
            p = j.get("permissions")
            if p in ("write-all", "read-all"):
                errs.append(f"{path}: job {jn} dùng write-all/read-all")
    for where, s in steps_of(doc):
        u = s.get("uses")
        if u and not u.startswith("./"):
            ref = u.split("@", 1)[1] if "@" in u else ""
            if not SHA.match(ref):
                errs.append(f"{path}: {where} uses '{u}' chưa pin commit SHA 40 ký tự")
        run = s.get("run")
        if run and UNTRUSTED.search(run):
            errs.append(f"{path}: {where} run: chứa ${{{{ }}}} với dữ liệu không tin cậy; đưa vào env: rồi dùng \"$VAR\"")
    if STATIC_KEY.search(text):
        errs.append(f"{path}: có tham chiếu access key AWS tĩnh")
    return errs
def main(root):
    files = [p for p in pathlib.Path(root).rglob("*") if p.suffix in (".yml", ".yaml") and ("workflows" in p.parts or p.parent.parent.name == "actions" or p.name in ("action.yml", "action.yaml"))]
    errs = []
    for f in sorted(files):
        errs += lint(str(f), f.read_text())
    for e in errs:
        print(e, file=sys.stderr)
    print(f"lint-workflows: {len(files)} file, {len(errs)} lỗi")
    return 1 if errs else 0
if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ".github"))
