#!/usr/bin/env ts-node
/**
 * Generates build/contracts-pkg.json from contract Tolk source files.
 *
 * CONTRACT_VERSION is extracted from each contract's Tolk source. The package
 * version is taken from package.json and optionally extended with a short commit
 * SHA as build metadata for pre-release / CI builds (semver §10 build metadata).
 *
 * Usage (from the contracts/ directory):
 *   ts-node scripts/generateContractsPkg.ts [--sha <short-sha>] [--out <path>]
 *
 * Options:
 *   --sha <sha>   Short commit SHA appended to the package version as build
 *                 metadata (e.g. 1.6.0+abc123def456). Omit for clean releases.
 *   --out <path>  Output file path (default: build/contracts-pkg.json).
 */

import * as fs from 'fs'
import * as path from 'path'

/** Per-contract entry in contracts-pkg.json. */
interface ContractEntry {
  path: string
  version: string
}

/**
 * Schema of the generated contracts-pkg.json file.
 * Consumed by deployment/utils/compiled_contracts.go (ContractPackageMetadata).
 */
interface ContractPackageMetadata {
  version: string
  contracts: Record<string, ContractEntry>
}

/** Describes where to find a contract's source and compiled artifact. */
interface ContractSource {
  /** Contract type identifier, e.g. link.chain.ton.ccip.Router */
  contractType: string
  /** Filename relative to the build directory, e.g. Router.compiled.json */
  compiledFile: string
  /**
   * Tolk source file relative to the contracts/ root from which CONTRACT_VERSION
   * is extracted.
   */
  tolkSource: string
}

/**
 * Production contracts included in contracts-pkg.json.
 *
 * NOTE: These must stay in sync with the type constants in
 * pkg/bindings/index.go and the entries in deployment/utils/compiled_contracts.go.
 * When adding a new production contract, add an entry here AND to those Go files.
 */
const CONTRACTS: ContractSource[] = [
  {
    contractType: 'link.chain.ton.ccip.Router',
    compiledFile: 'Router.compiled.json',
    tolkSource: 'contracts/ccip/router/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.FeeQuoter',
    compiledFile: 'FeeQuoter.compiled.json',
    tolkSource: 'contracts/ccip/fee_quoter/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.OnRamp',
    compiledFile: 'OnRamp.compiled.json',
    tolkSource: 'contracts/ccip/onramp/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.OffRamp',
    compiledFile: 'OffRamp.compiled.json',
    tolkSource: 'contracts/ccip/offramp/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.CCIPSendExecutor',
    compiledFile: 'CCIPSendExecutor.compiled.json',
    tolkSource: 'contracts/ccip/ccipsend_executor/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.Deployable',
    compiledFile: 'Deployable.compiled.json',
    tolkSource: 'contracts/lib/deployable/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.MerkleRoot',
    compiledFile: 'MerkleRoot.compiled.json',
    tolkSource: 'contracts/ccip/merkle_root/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.ReceiveExecutor',
    compiledFile: 'ReceiveExecutor.compiled.json',
    tolkSource: 'contracts/ccip/receive_executor/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.TokenRegistry',
    compiledFile: 'TokenRegistry.compiled.json',
    tolkSource: 'contracts/ccip/token_registry/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.test.Receiver',
    compiledFile: 'ccip.test.receiver.compiled.json',
    tolkSource: 'contracts/ccip/test/receiver/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.test.MockTokenPool',
    compiledFile: 'ccip.test.mockTokenPool.compiled.json',
    tolkSource: 'contracts/ccip/test/tokenPool/contract.tolk',
  },
  {
    contractType: 'link.chain.ton.ccip.test.MockAdvancedPoolHooks',
    compiledFile: 'ccip.test.mockAdvancedPoolHooks.compiled.json',
    tolkSource: 'contracts/ccip/test/mock_advanced_pool_hooks.tolk',
  },
  {
    contractType: 'link.chain.ton.mcms.Timelock',
    compiledFile: 'mcms.RBACTimelock.compiled.json',
    tolkSource: 'contracts/mcms/rbac_timelock.tolk',
  },
  {
    contractType: 'link.chain.ton.mcms.MCMS',
    compiledFile: 'mcms.MCMS.compiled.json',
    tolkSource: 'contracts/mcms/mcms.tolk',
  },
]

const VERSION_PATTERN = /const CONTRACT_VERSION\s*=\s*"([^"]+)"/

function extractContractVersion(tolkSourcePath: string): string {
  const content = fs.readFileSync(tolkSourcePath, 'utf-8')
  const match = VERSION_PATTERN.exec(content)
  if (!match) {
    throw new Error(`CONTRACT_VERSION not found in ${tolkSourcePath}`)
  }
  return match[1]
}

interface CliArgs {
  sha?: string
  out: string
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let sha: string | undefined
  let out = path.join('build', 'contracts-pkg.json')

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sha' && i + 1 < args.length) {
      sha = args[++i]
    } else if (args[i] === '--out' && i + 1 < args.length) {
      out = args[++i]
    } else {
      process.stderr.write(`Unknown argument: ${args[i]}\n`)
      process.exit(1)
    }
  }

  return { sha, out }
}

function main(): void {
  const { sha, out } = parseArgs()

  const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as { version: string }
  const packageVersion = sha ? `${pkgJson.version}+${sha}` : pkgJson.version

  const contracts: Record<string, ContractEntry> = {}
  for (const { contractType, compiledFile, tolkSource } of CONTRACTS) {
    const version = extractContractVersion(tolkSource)
    contracts[contractType] = { path: compiledFile, version }
  }

  const output: ContractPackageMetadata = { version: packageVersion, contracts }

  const outDir = path.dirname(out)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  fs.writeFileSync(out, JSON.stringify(output, null, 2) + '\n')
  process.stdout.write(
    `contracts-pkg.json written to ${out} (package version: ${packageVersion})\n`,
  )
}

main()
