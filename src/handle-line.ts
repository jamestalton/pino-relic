#!/usr/bin/env node

import { program } from 'commander'
import { readFileSync } from 'fs'
import { STATUS_CODES } from 'http'
import { request } from 'https'
import { gzip } from 'zlib'

function commaSeparatedList(value: string, dummyPrevious: string[]) {
    return value.split(',')
}

const packageJson = JSON.parse(readFileSync('package.json').toString()) as { version: string }
program
    .version(packageJson.version)
    .option('-l, --license <key>', 'new relic license key')
    .option('-i, --interval <milliseonds>', 'upload interval')
    .option('-c, --common <common fields>', 'common fields', commaSeparatedList)
    .parse(process.argv)

const commonFields = program.common as string[]

let uploadInterval = Number(program.interval)
if (isNaN(uploadInterval)) uploadInterval = undefined

type ILogGroup = {
    common?: {
        attributes: Record<string, unknown>
    }
    logs?: {
        timestamp?: number
        message: string
        attributes?: unknown
    }[]
}

let logs: ILogGroup[] = []

export function addLogObject(jsonObject: Record<string, unknown>, logs: ILogGroup[]): void {
    let group: ILogGroup = logs.find((group) => {
        if (!commonFields) {
            return true
        }

        for (const field of commonFields) {
            if (group.common.attributes[field] !== jsonObject[field]) {
                return false
            }
        }
        return true
    })

    if (!group) {
        group = {}
        if (commonFields) {
            group.common = {
                attributes: {},
            }
            for (const field of commonFields) {
                group.common.attributes[field] = jsonObject[field]
            }
        }
        logs.push(group)
    }

    if (group.logs === undefined) {
        group.logs = []
    }
    const { msg, time, ...extras } = jsonObject
    let attributes: Record<string, unknown>
    if (commonFields) {
        attributes = {}
        for (const key in extras) {
            if (commonFields.includes(key)) continue
            attributes[key] = extras[key]
        }
    } else {
        attributes = extras
    }

    group.logs.push({ timestamp: time as number, message: msg as string, attributes })
}

export function handleLine(line: string): string {
    if (program.license) {
        line = line.trim()
        if (line.startsWith('{') || line.startsWith('[')) {
            if (line.endsWith(',')) line = line.substr(0, line.length - 1)
            try {
                const json = JSON.parse(line) as Record<string, unknown> | Record<string, unknown>[]
                if (Array.isArray(json)) {
                    for (const item of json) {
                        addLogObject(item, logs)
                    }
                } else {
                    addLogObject(json, logs)
                }
            } catch (err) {
                // Do Nothing
            }
        }
        if (!uploadInterval || logs.length > 1000) {
            upload()
        }
    }
    return line + '\n'
}

const optionsJson = {
    host: 'log-api.newrelic.com',
    path: '/log/v1',
    method: 'POST',
    headers: {
        'Content-Type': 'application/gzip',
        'X-License-Key': program.license as string,
        'Content-Encoding': 'gzip',
    },
}

function upload() {
    if (logs.length === 0) return
    const jsonString = JSON.stringify(logs)
    logs = []
    gzip(jsonString, (err, buffer) => {
        const req = request(optionsJson, (res) => {
            if (res.statusCode >= 400) {
                process.stderr.write(`New Relic Upload Error: ${res.statusCode} ${STATUS_CODES[res.statusCode]}\n`)
            }
        })
        req.write(buffer)
        req.end()
    })
}

let interval: NodeJS.Timeout
if (uploadInterval) {
    interval = setInterval(upload, uploadInterval)
}

export function shutdown(): void {
    if (interval) {
        clearInterval(interval)
        interval = undefined
        upload()
    }
}
