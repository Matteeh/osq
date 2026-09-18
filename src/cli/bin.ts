#!/usr/bin/env node
import { createProgram, resolvePackageVersion } from './index.js';

const program = createProgram(resolvePackageVersion());
await program.parseAsync(process.argv);
