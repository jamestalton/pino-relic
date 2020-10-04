#!/usr/bin/env node

/* istanbul ignore file */

import { handleLine, shutdown } from './handle-line'

process.stdin.on('data', (buffer: Buffer) => {
    const lines = buffer.toString().trimEnd().split('\n')
    for (const line of lines) {
        process.stdout.write(handleLine(line) + '\n')
    }
})

process.once('SIGINT', () => {
    shutdown()
})
