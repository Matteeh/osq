import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import {
  type HarnessAdapter,
  type InteractiveSessionOptions,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from './types.js';

export interface MockBehavior {
  exitCode?: number;
  writeResult?: boolean;
  resultContent?: string;
  delayMs?: number;
  error?: string;
  timedOut?: boolean;
}

export class MockAdapter implements HarnessAdapter {
  readonly name = 'mock';
  private behavior: MockBehavior = {};

  setBehavior(behavior: MockBehavior): void {
    this.behavior = behavior;
  }

  static recordedInteractiveSpawns: InteractiveSessionOptions[] = [];
  recordedInteractiveSpawns: InteractiveSessionOptions[] = [];

  resetBehavior(): void {
    this.behavior = {};
    this.recordedInteractiveSpawns = [];
    MockAdapter.recordedInteractiveSpawns = [];
  }

  async spawnInteractive(options: InteractiveSessionOptions): Promise<number> {
    this.recordedInteractiveSpawns.push(options);
    MockAdapter.recordedInteractiveSpawns.push(options);
    return this.behavior.exitCode ?? 0;
  }

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {
    // No-op for mock harness
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { specFolderPath, taskNumber } = options;

    if (this.behavior.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.behavior.delayMs));
    }

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'tokens',
      timestamp: new Date().toISOString(),
      data: { promptTokens: 500, candidateTokens: 200 },
    });

    const shouldWriteResult = this.behavior.writeResult ?? true;
    if (shouldWriteResult) {
      const resultsDir = path.join(specFolderPath, '.run', 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      const resultPath = path.join(resultsDir, `${taskNumber}.md`);
      const defaultContent = [
        `# Result for Task ${taskNumber}`,
        '',
        '## Changed',
        '- Simulated work completed by MockAdapter.',
      ].join('\n');

      await fs.writeFile(resultPath, this.behavior.resultContent || `${defaultContent}\n`, 'utf8');

      await appendHarnessEvent(specFolderPath, taskNumber, {
        type: 'result_written',
        timestamp: new Date().toISOString(),
        data: { path: resultPath },
      });
    }

    const exitCode = this.behavior.exitCode ?? (this.behavior.timedOut ? 124 : 0);

    return {
      exitCode,
      error: this.behavior.error,
      timedOut: this.behavior.timedOut,
    };
  }
}
