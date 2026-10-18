/**
 * The hero card plays one change through osq on a loop: plan, lint, approve, run, land.
 * A fake cursor clicks the steps a human takes. Visitors can click a tab to jump there.
 * With reduced motion it never autoplays; each tab shows its finished state.
 * Every step dispatches `osq-demo-step` on window so the circuit can send a signal into the card.
 */

const STAGES = ['plan', 'lint', 'approve', 'run', 'land'] as const;
type Stage = (typeof STAGES)[number];
type TaskState = 'queued' | 'running' | 'verifying' | 'failed' | 'done';

/** Stretches every pause in the loop; raise it to slow the demo down. */
const PACE = 1.75;
const BRIEF = 'Let customers cancel an order before it ships. Release the reserved stock and refund the payment.';
const PASSED = 'tests passed in osq’s own run';
const RETRIED = 'failed once, retried with the reason';
/** What each agent attempt cost, as the harness reports it. Task 2 takes two attempts. */
const ATTEMPT_COST = [[0.31], [0.29, 0.29], [0.27], [0.48]];
const money = (n: number) => `$${n.toFixed(2)}`;
const taskCost = (i: number) => ATTEMPT_COST[i].reduce((a, b) => a + b, 0);
const doneNote = (i: number) => `${i === 1 ? RETRIED : PASSED} · ${money(taskCost(i))}`;

class Stopped extends Error {}

export function startDemo(card: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => card.querySelector<T>(selector) as T;
  const all = (selector: string, root: ParentNode = card) => Array.from(root.querySelectorAll<HTMLElement>(selector));
  const pane = (stage: Stage) => el(`[data-pane="${stage}"]`);
  const tab = (stage: Stage) => el<HTMLButtonElement>(`[data-tab="${stage}"]`);
  const stateEl = el('[data-state]');
  const cursor = el('[data-cursor]');
  const briefText = el('[data-brief]');
  const approveBtn = el<HTMLButtonElement>('[data-approve]');
  const landBtn = el<HTMLButtonElement>('[data-land]');
  const runCount = el('[data-run-count]');
  const runCost = el('[data-run-cost]');

  let token = 0;
  let onScreen = true;

  const pulse = () => window.dispatchEvent(new Event('osq-demo-step'));

  function setState(text: string, tone = '') {
    stateEl.textContent = text;
    stateEl.className = tone ? `pill ${tone}` : 'pill';
  }

  // A sleep that stops counting while the card is off screen or the tab is hidden, and throws when a newer run starts.
  function sleep(ms: number, run: number) {
    return new Promise<void>((resolve, reject) => {
      let left = ms * PACE;
      let prev = Date.now();
      const tick = () => {
        if (run !== token) return reject(new Stopped());
        const now = Date.now();
        if (onScreen && !document.hidden) left -= now - prev;
        prev = now;
        if (left <= 0) resolve();
        else setTimeout(tick, Math.min(100, left));
      };
      tick();
    });
  }

  function show(stage: Stage) {
    for (const s of STAGES) {
      tab(s).setAttribute('aria-selected', String(s === stage));
      tab(s).tabIndex = s === stage ? 0 : -1;
      pane(s).hidden = s !== stage;
    }
    pulse();
  }

  function setTask(row: HTMLElement, state: TaskState, note: string) {
    const pill = row.querySelector('.pill');
    const k = row.querySelector('.k');
    const tone = { queued: '', running: 'blue', verifying: 'blue', failed: 'red', done: 'green' }[state];
    if (pill) {
      pill.className = tone ? `pill ${tone}` : 'pill';
      pill.textContent = state;
    }
    if (k) k.textContent = note;
  }

  function setCount(said: number, checked: number) {
    runCount.textContent = `Agent said "done" ${said} times. osq checked ${checked} times.`;
  }

  /** Puts a stage in its starting or finished state. */
  function reset(stage: Stage, done: boolean) {
    for (const item of all('.reveal', pane(stage))) item.classList.toggle('on', done);
    if (stage === 'plan') briefText.textContent = done ? BRIEF : '';
    if (stage === 'approve') {
      approveBtn.disabled = done;
      approveBtn.textContent = done ? 'Approved' : 'Approve';
      el('[data-approve-note]').textContent = done ? 'Approved 042 with 1 flag.' : 'Nothing runs until you approve.';
    }
    if (stage === 'run') {
      all('[data-task]', pane('run')).forEach((row, i) => {
        const waiting = i === 3 ? 'waits for task 3' : 'waiting';
        setTask(row, done ? 'done' : 'queued', done ? doneNote(i) : waiting);
      });
      setCount(done ? 5 : 0, done ? 5 : 0);
      runCost.textContent = money(done ? ATTEMPT_COST.flat().reduce((a, b) => a + b, 0) : 0);
    }
    if (stage === 'land') {
      landBtn.disabled = done;
      landBtn.textContent = done ? 'Landed' : 'Land';
      el('[data-land-note]').textContent = done ? 'Merged into main.' : 'Ready to merge into main.';
    }
  }

  async function point(target: HTMLElement, run: number) {
    const c = card.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    cursor.style.opacity = '1';
    cursor.style.transform = `translate(${r.left - c.left + r.width * 0.55}px, ${r.top - c.top + r.height * 0.6}px)`;
    await sleep(800, run);
  }

  async function click(target: HTMLElement, run: number) {
    cursor.classList.remove('click');
    void cursor.offsetWidth;
    cursor.classList.add('click');
    target.classList.add('pressed');
    await sleep(160, run);
    target.classList.remove('pressed');
  }

  const hideCursor = () => {
    cursor.style.opacity = '0';
  };

  async function reveal(stage: Stage, gap: number, run: number, before = 0) {
    for (const item of all('.reveal', pane(stage))) {
      if (before) await sleep(before, run);
      item.classList.add('on');
      pulse();
      if (gap) await sleep(gap, run);
    }
  }

  const play: Record<Stage, (run: number) => Promise<void>> = {
    async plan(run) {
      setState('planning');
      for (let i = 1; i <= BRIEF.length; i += 2) {
        briefText.textContent = BRIEF.slice(0, i);
        await sleep(28, run);
      }
      briefText.textContent = BRIEF;
      await sleep(500, run);
      await reveal('plan', 650, run);
      await sleep(900, run);
    },
    async lint(run) {
      setState('linting');
      await reveal('lint', 0, run, 450);
      await sleep(1400, run);
    },
    async approve(run) {
      setState('needs you', 'accent');
      await sleep(1600, run);
      await point(approveBtn, run);
      await click(approveBtn, run);
      reset('approve', true);
      setState('approved', 'green');
      pulse();
      await sleep(400, run);
      hideCursor();
      await sleep(1200, run);
    },
    async run(run) {
      setState('running', 'blue');
      let said = 0;
      let checked = 0;
      let spent = 0;
      const attempt = async (row: HTMLElement, note: string, cost: number) => {
        setTask(row, 'running', note);
        pulse();
        await sleep(1000, run);
        setCount(++said, checked);
        spent += cost;
        runCost.textContent = money(spent);
        setTask(row, 'verifying', 'agent says done, osq runs the tests');
        await sleep(850, run);
        setCount(said, ++checked);
      };
      const rows = all('[data-task]', pane('run'));
      for (const [i, row] of rows.entries()) {
        await attempt(row, 'a fresh agent is working on it', ATTEMPT_COST[i][0]);
        if (i === 1) {
          setTask(row, 'failed', 'tests failed, retrying with the failure');
          await sleep(1300, run);
          await attempt(row, 'second try, with what went wrong', ATTEMPT_COST[i][1]);
        }
        setTask(row, 'done', doneNote(i));
        pulse();
      }
      await sleep(1300, run);
    },
    async land(run) {
      setState('verifying', 'blue');
      await reveal('land', 0, run, 600);
      setState('ready to land', 'accent');
      await sleep(900, run);
      await point(landBtn, run);
      await click(landBtn, run);
      reset('land', true);
      setState('landed', 'green');
      pulse();
      await sleep(400, run);
      hideCursor();
      await sleep(2400, run);
    },
  };

  async function runFrom(index: number) {
    const run = ++token;
    hideCursor();
    try {
      for (let i = index; ; i = (i + 1) % STAGES.length) {
        // stages before this one show their finished state, later ones start fresh
        STAGES.forEach((s, k) => reset(s, k < i));
        show(STAGES[i]);
        await play[STAGES[i]](run);
      }
    } catch (error) {
      if (!(error instanceof Stopped)) throw error;
    }
  }

  const finished: Record<Stage, [string, string]> = {
    plan: ['planned', ''],
    lint: ['linted', 'green'],
    approve: ['approved', 'green'],
    run: ['all tasks done', 'green'],
    land: ['landed', 'green'],
  };

  function still(index: number) {
    token++;
    hideCursor();
    for (const s of STAGES) reset(s, true);
    show(STAGES[index]);
    setState(...finished[STAGES[index]]);
  }

  const go = (index: number) => (reduce.matches ? still(index) : runFrom(index));

  STAGES.forEach((stage, i) => {
    tab(stage).addEventListener('click', () => go(i));
    tab(stage).addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = (i + step + STAGES.length) % STAGES.length;
      tab(STAGES[next]).focus();
      go(next);
    });
  });
  new IntersectionObserver((entries) => {
    onScreen = entries[0]?.isIntersecting ?? true;
  }).observe(card);
  reduce.addEventListener('change', () => go(reduce.matches ? 3 : 0));
  go(reduce.matches ? 3 : 0);
}
