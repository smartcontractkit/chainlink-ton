import { compile } from '@ton/blueprint'
import { Cell } from '@ton/core'
import { promises as fs } from 'fs'
import { Readable } from 'stream'
import * as tar from 'tar-stream'
import { createGunzip } from 'zlib'
import { join, resolve, basename as pathBasename } from 'path'

const BUILD_ROOT = process.env.CONTRACTS_BUILD_PATH
  ? resolve(process.env.CONTRACTS_BUILD_PATH)
  : resolve(__dirname, '..', 'build')

const ARTIFACT_FILE_EXTENSION = '.compiled.json'

const codeCache = new Map<string, Promise<Cell>>()

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

async function readContractCode(contractName: string): Promise<Cell> {
  const filePath = join(BUILD_ROOT, `${contractName}${ARTIFACT_FILE_EXTENSION}`)
  let fileContents: string
  try {
    fileContents = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    // if file not found
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

  return parseCompiledContractJson(fileContents, filePath)
}

export async function loadContractCode(contractName: string): Promise<Cell> {
  if (!codeCache.has(contractName)) {
    codeCache.set(contractName, readContractCode(contractName))
  }
  if (contractName === 'Deployable') {
    const code = await codeCache.get(contractName)!
    const codeHash = code.hash()
    expect(codeHash).toEqual(
      Buffer.from('61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc', 'hex'),
    )
  }
  return codeCache.get(contractName)!
}

export function getCompiledContractPath(contractName: string): string {
  return join(BUILD_ROOT, `${contractName}${ARTIFACT_FILE_EXTENSION}`)
}

const GITHUB_ORG = 'smartcontractkit'
const GITHUB_REPO = 'chainlink-ton'

// Memoization: release name -> promise of extracted artifacts (contract name -> hex content)
const releaseCache = new Map<string, Promise<Map<string, string>>>()

function getReleaseAssetUrl(releaseName: string): string {
  const encodedTag = encodeURIComponent(releaseName)
  const assetName = releaseName.replace(/\//g, '-')
  return `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/releases/download/${encodedTag}/${assetName}.tar.gz`
}

async function downloadAndExtractRelease(releaseName: string): Promise<Map<string, string>> {
  const url = getReleaseAssetUrl(releaseName)

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(
      `Failed to download release "${releaseName}" from ${url}: ${response.status} ${response.statusText}`,
    )
  }

  const compressed = Buffer.from(await response.arrayBuffer())
  const contracts = new Map<string, string>()

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract()

    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        if (header.type === 'file') {
          const name = pathBasename(header.name)
          if (name.endsWith(ARTIFACT_FILE_EXTENSION)) {
            const key = name.slice(0, -ARTIFACT_FILE_EXTENSION.length)
            contracts.set(key, Buffer.concat(chunks).toString('utf8'))
          }
        }
        next()
      })
      stream.resume()
    })

    extract.on('finish', resolve)
    extract.on('error', reject)

    Readable.from(compressed).pipe(createGunzip()).pipe(extract)
  })

  return contracts
}

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
    releaseCache.set(releaseName, downloadAndExtractRelease(releaseName))
  }

  const contracts = await releaseCache.get(releaseName)!
  const fileContent = contracts.get(contractName)

  if (!fileContent) {
    const available = Array.from(contracts.keys()).join(', ')
    throw new Error(
      `Contract "${contractName}" not found in release "${releaseName}". Available: ${available}`,
    )
  }

  return parseCompiledContractJson(fileContent, `release "${releaseName}" / ${contractName}`)
}
