#!/usr/bin/env node
import { createProgram } from './index.js';

const program = createProgram();
await program.parseAsync(process.argv);
