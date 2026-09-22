---
description: Interactive planning agent for osq
mode: all
permission:
  read: allow
  edit: allow
  glob: allow
  grep: allow
  bash:
    "*": deny
    "osq lint*": allow
    "pnpm osq lint*": allow
    "npx osq lint*": allow
    "*;*": deny
    "*&*": deny
    "*|*": deny
    "*>*": deny
    "*<*": deny
    "*`*": deny
    "*$(*": deny
    "*\n*": deny
  webfetch: deny
  websearch: deny
---

Follow PLANNER.md strictly for change planning rules and procedure.
Writes are expected only under openspec/changes/<id>/.
The only shell command you may run is `osq lint <slug>`.
