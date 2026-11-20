#!/usr/bin/env ts-node
/**
 * Converts acton's native build output (build/<ContractKey>.json, holding
 * code_boc64 + hash) into the legacy blueprint artifact shape
 * (build/<artifactName>.compiled.json, holding a `hex` field) that
 * wrappers/codeLoader.ts and pkg/ton/boc/compiled.go both expect.
 *
 * Each contract is written under its Acton.toml contract key. Contracts listed in
 * scripts/acton/legacyArtifactNames.json are also written under their legacy name,
 * which released artifacts, hand-written wrappers (e.g. wrappers/mcms/MCMS.ts) and
 * the Go deployment code look up compiled code by. The key name is skipped when
 * scripts/pinArtifacts.ts writes a reference Jetton artifact under it.
 *
 * Usage (from the contracts/ directory):
 *   ts-node scripts/actonBuildAdapter.ts
 */

import * as fs from 'fs'
import * as path from 'path'

import { parseToml } from './acton/toml'
import { PINNED_JETTON_ARTIFACT_NAMES } from './acton/pinnedArtifacts'

const MANIFEST_PATH = path.join('Acton.toml')
const LEGACY_ARTIFACT_NAMES_PATH = path.join('scripts', 'acton', 'legacyArtifactNames.json')

interface ActonBuildArtifact {
  code_boc64: string
  hash: string
}

function readManifest(): { outDir: string; contractKeys: string[] } {
  const manifest = parseToml(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  const outDir: string = manifest.build?.['out-dir'] ?? 'build'
  const contractKeys = Object.keys(manifest.contracts ?? {})
  return { outDir, contractKeys }
}

/** Maps Acton.toml contract keys to the legacy artifact names they are also published under. */
function readLegacyArtifactNames(contractKeys: string[]): Map<string, string> {
  const names: Record<string, string> = JSON.parse(
    fs.readFileSync(LEGACY_ARTIFACT_NAMES_PATH, 'utf-8'),
  )
  const unknown = Object.keys(names).filter((key) => !contractKeys.includes(key))
  if (unknown.length > 0) {
    throw new Error(
      `${LEGACY_ARTIFACT_NAMES_PATH} maps keys missing from ${MANIFEST_PATH}: ${unknown.join(', ')}`,
    )
  }
  return new Map(Object.entries(names))
}

/** The build/<name>.compiled.json names a contract is written under. */
function artifactNames(key: string, legacyName: string | undefined): string[] {
  const keyIsPinned = PINNED_JETTON_ARTIFACT_NAMES.includes(key)
  if (keyIsPinned && legacyName === undefined) {
    throw new Error(
      `build/${key}.compiled.json is reserved for a pinned reference artifact; map ${key} to another name in ${LEGACY_ARTIFACT_NAMES_PATH}`,
    )
  }
  return [...(keyIsPinned ? [] : [key]), ...(legacyName === undefined ? [] : [legacyName])]
}

function main(): void {
  const { outDir, contractKeys } = readManifest()
  const legacyArtifactNames = readLegacyArtifactNames(contractKeys)

  for (const key of contractKeys) {
    const artifactPath = path.join(outDir, `${key}.json`)
    if (!fs.existsSync(artifactPath)) {
      // Not every Acton.toml entry produces its own top-level build artifact
      // (e.g. library-only sources included via `depends`).
      continue
    }

    const artifact: ActonBuildArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'))
    const hex = Buffer.from(artifact.code_boc64, 'base64').toString('hex')
    const compiled = JSON.stringify({ hex, hash: artifact.hash }, null, 2) + '\n'

    for (const name of artifactNames(key, legacyArtifactNames.get(key))) {
      const compiledPath = path.join(outDir, `${name}.compiled.json`)
      fs.writeFileSync(compiledPath, compiled)
      process.stdout.write(`Adapted ${artifactPath} -> ${compiledPath}\n`)
    }
  }
}

main()
