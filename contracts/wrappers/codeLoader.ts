import { compile } from '@ton/blueprint'
import { Cell } from '@ton/core'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'

const BUILD_ROOT = process.env.CONTRACTS_BUILD_PATH
  ? resolve(process.env.CONTRACTS_BUILD_PATH)
  : resolve(__dirname, '..', 'build')

const ARTIFACT_FILE_EXTENSION = '.compiled.json'

function parseCompiledContractJson(json: string, source: string): Cell {
  let hex: string | undefined
  try {
    const parsed = JSON.parse(json)
    hex = parsed?.hex
  } catch (error) {
    throw new Error(`Failed to parse compiled contract from ${source}: ${error}`)
  }

  if (typeof hex !== 'string' || hex.length === 0) {
    throw new Error(`Compiled contract from ${source} is missing a hex field`)
  }

  const boc = Buffer.from(hex, 'hex')
  const cells = Cell.fromBoc(boc)
  if (cells.length === 0) {
    throw new Error(`Compiled contract from ${source} is empty`)
  }
  return cells[0]
}

class ContractCodeStore {
  protected readonly basePath: string
  private readonly cache = new Map<string, Promise<Cell>>()

  constructor(basePath: string) {
    this.basePath = basePath
  }

  get(contractName: string): Promise<Cell> {
    const cached = this.cache.get(contractName)
    if (cached) {
      return cached
    }
    const loaded = this.load(contractName)
    this.cache.set(contractName, loaded)

    return loaded
  }

  private async load(contractName: string): Promise<Cell> {
    const filePath = join(this.basePath, `${contractName}${ARTIFACT_FILE_EXTENSION}`)
    try {
      const fileContents = await fs.readFile(filePath, 'utf8')
      return parseCompiledContractJson(fileContents, filePath)
    } catch (error) {
      return this.handleLoadError(filePath, contractName, error)
    }
  }

  protected async handleLoadError(
    filePath: string,
    contractName: string,
    error: unknown,
  ): Promise<Cell> {
    throw new Error(`Failed to load compiled contract ${filePath} from ${this.basePath}: ${error}`)
  }
}

class LocalContractCodeStore extends ContractCodeStore {
  protected override async handleLoadError(
    filePath: string,
    contractName: string,
    error: unknown,
  ): Promise<Cell> {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`Compiled contract not found at '${filePath}', building from source...`)
      return compile(contractName)
    }
    if (contractName === 'Deployable') {
      throw new Error(
        `Failed to read Deployable contract at '${filePath}'. Deployable cannot be compiled like the other contracts, run yarn build to load it properly.`,
      )
    }
    throw new Error(`Failed to read compiled contract ${contractName} at ${filePath}: ${error}`)
  }
}

const localStore = new LocalContractCodeStore(BUILD_ROOT)

export async function loadContractCode(contractName: string): Promise<Cell> {
  const code = await localStore.get(contractName)
  if (contractName === 'Deployable') {
    const codeHash = code.hash()
    expect(codeHash).toEqual(
      Buffer.from('61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc', 'hex'),
    )
  }
  return code
}

export function getCompiledContractPath(contractName: string): string {
  return join(BUILD_ROOT, `${contractName}${ARTIFACT_FILE_EXTENSION}`)
}

const GITHUB_ORG = 'smartcontractkit'
const GITHUB_REPO = 'chainlink-ton'

function buildReleasePath(tag: string): string {
  // Validate tag format to prevent injection attacks
  const tagPattern = /^contracts\/\d+\.\d+\.\d+$/
  if (!tagPattern.test(tag)) {
    throw new Error(`Invalid tag format: ${tag}. Expected format: contracts/X.Y.Z`)
  }

  const { execFileSync } = require('child_process')
  const cmd = 'nix'
  const args = [
    'build',
    `github:${GITHUB_ORG}/${GITHUB_REPO}/${tag}#contracts`,
    '--print-out-paths',
  ]

  const output = execFileSync(cmd, args, { encoding: 'utf8' }).trim()
  const path = output.split('\n')[0]
  if (!path) {
    throw new Error(`Failed to build contracts for tag ${tag}. Command output: ${output}`)
  }
  return join(path, 'lib/node_modules/@chainlink/contracts-ton/build')
}

const releaseCache = new Map<string, ContractCodeStore>()

/**
 * Load compiled contract bytecode from a GitHub release.
 *
 * @param releaseName - The release tag, e.g. "contracts/1.6.0"
 * @param contractName - The contract name without suffix, e.g. "FeeQuoter"
 * @returns The contract code Cell
 *
 * Release data is memoized so that the same release is only downloaded once.
 */
export async function loadContractCodeFromRelease(
  releaseName: string,
  contractName: string,
): Promise<Cell> {
  if (!releaseCache.has(releaseName)) {
    releaseCache.set(releaseName, new ContractCodeStore(buildReleasePath(releaseName)))
  }
  return releaseCache.get(releaseName)!.get(contractName)
}
