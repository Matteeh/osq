---
reason: sync_verify_red
---
313-plan-queue-slug: verify failed on osq/313-plan-queue-slug merged with main:

test at tests/vcs-doctor.test.ts:1:2308
✖ warns that git is not found without failing (18.021477ms)
  Error: spawn EIO
      at ChildProcess.spawn (node:internal/child_process:458:11)
      at spawn (node:child_process:813:9)
      at execFile (node:child_process:349:17)
      at <anonymous> (src/core/vcs/git-vcs.ts:57:5)
      at new Promise (<anonymous>)
      at runGit (src/core/vcs/git-vcs.ts:56:10)
      at selectVcs (src/core/vcs/select.ts:32:25)
      at gitCheck (src/core/vcs/doctor-git.ts:53:21)
      at checkGit (src/core/vcs/doctor-git.ts:147:32)
      at TestContext.<anonymous> (tests/vcs-doctor.test.ts:86:26) {
    errno: -5,
    code: 'EIO',
    syscall: 'spawn'
  }
 ELIFECYCLE  Test failed. See above for more details.
 ELIFECYCLE  Command failed with exit code 1.
