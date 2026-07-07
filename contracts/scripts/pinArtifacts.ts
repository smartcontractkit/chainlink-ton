#!/usr/bin/env ts-node
/**
 * Copies pre-compiled artifacts into build/ that blueprint does not produce itself:
 *  - Deployable.compiled.json, which cannot be compiled from Tolk (its code hash is
 *    self-referential).
 *  - The reference Jetton contracts (JettonMinter, JettonWallet), sourced from the
 *    Nix-provided PATH_CONTRACTS_JETTON directory when available.
 *
 * Usage (from the contracts/ directory):
 *   ts-node scripts/pinArtifacts.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const BUILD_DIR = 'build'

interface PinnedArtifact {
  src: string
  dest: string
}

function deployableArtifact(): PinnedArtifact {
  return {
    src: path.join('contracts', 'lib', 'deployable', 'Deployable.compiled.json'),
    dest: path.join(BUILD_DIR, 'Deployable.compiled.json'),
  }
}

// Pins the reference Jetton contracts from PATH_CONTRACTS_JETTON, if the env var is set.
// Absent outside the nix dev/build environments, in which case these are skipped.
function jettonArtifacts(): PinnedArtifact[] {
  const jettonBuildDir = process.env.PATH_CONTRACTS_JETTON
  if (!jettonBuildDir) {
    return []
  }

  return ['JettonMinter', 'JettonWallet'].map((name) => ({
    src: path.join(jettonBuildDir, `${name}.compiled.json`),
    dest: path.join(BUILD_DIR, `${name}.compiled.json`),
  }))
}

function main(): void {
  const artifacts = [deployableArtifact(), ...jettonArtifacts()]

  fs.mkdirSync(BUILD_DIR, { recursive: true })

  for (const { src, dest } of artifacts) {
    fs.copyFileSync(src, dest)
    process.stdout.write(`Pinned ${src} -> ${dest}\n`)
  }

  if (!process.env.PATH_CONTRACTS_JETTON) {
    process.stdout.write('PATH_CONTRACTS_JETTON not set, skipping reference Jetton artifacts\n')
  }
}

main()
