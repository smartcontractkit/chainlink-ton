#!/usr/bin/env ts-node
/**
 * Converts acton's native build output (build/<ContractKey>.json, holding
 * code_boc64 + hash) into the legacy blueprint artifact shape
 * (build/<legacyName>.compiled.json, holding a `hex` field) that
 * wrappers/codeLoader.ts and pkg/ton/wrappers/contract.go both expect.
 *
 * legacyName is the basename of the wrappers/<legacyName>.compile.ts file
 * that used to build the same contract source under blueprint -- hand-written
 * wrappers (e.g. wrappers/mcms/MCMS.ts) look up compiled code by that name,
 * not by the (often different) Acton.toml contract key.
 *
 * Usage (from the contracts/ directory):
 *   ts-node scripts/actonBuildAdapter.ts
 */

import * as fs from 'fs'
import * as path from 'path'

import { parseToml } from './acton/toml'

const MANIFEST_PATH = path.join('Acton.toml')
const WRAPPERS_DIR = 'wrappers'

interface ActonBuildArtifact {
  code_boc64: string
  hash: string
}

function readManifest(): { outDir: string; contractSrcByKey: Map<string, string> } {
  const manifest = parseToml(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  const outDir: string = manifest.build?.['out-dir'] ?? 'build'

  const contractsTable: Record<string, { src: string }> = manifest.contracts ?? {}
  const contractSrcByKey = new Map<string, string>()
  for (const [key, contract] of Object.entries(contractsTable)) {
    contractSrcByKey.set(key, contract.src)
  }

  return { outDir, contractSrcByKey }
}

/** Maps each Tolk contract source path to the legacy wrappers/<name>.compile.ts basename that built it. */
function buildLegacyNameBySrc(): Map<string, string> {
  const legacyNameBySrc = new Map<string, string>()

  for (const file of fs.readdirSync(WRAPPERS_DIR)) {
    if (!file.endsWith('.compile.ts')) continue
    const contents = fs.readFileSync(path.join(WRAPPERS_DIR, file), 'utf-8')
    if (!/lang:\s*'tolk'/.test(contents)) continue

    const match = /entrypoint:\s*'([^']+)'/.exec(contents)
    if (!match) continue

    const legacyName = file.slice(0, -'.compile.ts'.length)
    legacyNameBySrc.set(match[1], legacyName)
  }

  return legacyNameBySrc
}

function main(): void {
  const { outDir, contractSrcByKey } = readManifest()
  const legacyNameBySrc = buildLegacyNameBySrc()

  for (const [key, src] of contractSrcByKey) {
    const artifactPath = path.join(outDir, `${key}.json`)
    if (!fs.existsSync(artifactPath)) {
      // Not every Acton.toml entry produces its own top-level build artifact
      // (e.g. library-only sources included via `depends`).
      continue
    }

    const artifact: ActonBuildArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'))
    const hex = Buffer.from(artifact.code_boc64, 'base64').toString('hex')

    const legacyName = legacyNameBySrc.get(src) ?? key
    const legacyPath = path.join(outDir, `${legacyName}.compiled.json`)
    fs.writeFileSync(legacyPath, JSON.stringify({ hex, hash: artifact.hash }, null, 2) + '\n')
    process.stdout.write(`Adapted ${artifactPath} -> ${legacyPath}\n`)
  }
}

main()
