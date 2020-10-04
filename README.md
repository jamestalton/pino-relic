# pino-relic

New Relic Logs for Pino logging

## Install

```sh
npm install --save-dev pino-relic
```

## Usage

When using Pino the recommended practice is to pipe the output from the main node process into a formatter. This is for performance as node is single threaded and this enables the log formatting to happen in a seperate process.

```
node main.js | pino-relic --license 123 --common instance,method,status
```
