#!/usr/bin/env ts-node
/**
 * Refreshes the versioned Tact artifacts used only by async trace-tracking
 * integration tests. This is deliberately separate from the normal build:
 * these contracts are legacy test dependencies, not deployable contracts.
 */

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const FIXTURE_ROOT = path.join('testdata', 'legacy-tact')

const fixtures = [
  ['examples.async-communication.request-reply.ItemPrice', 'tact_ItemPrice.pkg'],
  ['examples.async-communication.request-reply.PriceRegistry', 'tact_PriceRegistry.pkg'],
  ['examples.async-communication.request-reply.Storage', 'tact_Storage.pkg'],
  [
    'examples.async-communication.request-reply-with-two-dependencies.Inventory',
    'tact_Inventory.pkg',
  ],
  [
    'examples.async-communication.request-reply-with-two-dependencies.ItemCount',
    'tact_ItemCount.pkg',
  ],
  [
    'examples.async-communication.request-reply-with-two-dependencies.ItemPrice',
    'tact_ItemPrice.pkg',
  ],
  ['examples.async-communication.request-reply-with-two-dependencies.Storage', 'tact_Storage.pkg'],
  ['examples.async-communication.two-msg-chain.Memory', 'tact_Memory.pkg'],
  ['examples.async-communication.two-msg-chain.Storage', 'tact_Storage.pkg'],
  ['examples.async-communication.two-phase-commit.Counter', 'tact_Counter.pkg'],
  ['examples.async-communication.two-phase-commit.DB', 'tact_DB.pkg'],
] as const

for (const [contract, packageName] of fixtures) {
  execFileSync('yarn', ['bp', 'build', contract], { stdio: 'inherit' })

  const source = path.join('build', contract, packageName)
  const fixture = path.join(FIXTURE_ROOT, contract, packageName)
  const { code } = JSON.parse(fs.readFileSync(source, 'utf8')) as { code: string }
  if (typeof code !== 'string' || code.length === 0) {
    throw new Error(`Tact package ${source} has no code field`)
  }

  fs.mkdirSync(path.dirname(fixture), { recursive: true })
  fs.writeFileSync(fixture, JSON.stringify({ code }) + '\n')
  process.stdout.write(`Updated ${fixture}\n`)
}
