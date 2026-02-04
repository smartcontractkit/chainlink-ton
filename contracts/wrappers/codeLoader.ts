import { compile } from '@ton/blueprint'
import { Cell } from '@ton/core'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'

const BUILD_ROOT = process.env.CONTRACTS_BUILD_PATH
  ? resolve(process.env.CONTRACTS_BUILD_PATH)
  : resolve(__dirname, '..', 'build')

const codeCache = new Map<string, Promise<Cell>>()

async function readContractCode(contractName: string): Promise<Cell> {
  const filePath = join(BUILD_ROOT, `${contractName}.compiled.json`)
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

  let hex: string | undefined
  try {
    const parsed = JSON.parse(fileContents)
    hex = parsed?.hex
  } catch (error) {
    throw new Error(`Failed to parse compiled contract ${contractName} at ${filePath}: ${error}`)
  }

  if (typeof hex !== 'string' || hex.length === 0) {
    throw new Error(`Compiled contract ${contractName} at ${filePath} is missing a hex field`)
  }

  const boc = Buffer.from(hex, 'hex')
  const cells = Cell.fromBoc(boc)
  if (cells.length === 0) {
    throw new Error(`Compiled contract ${contractName} at ${filePath} is empty`)
  }
  return cells[0]
}

export async function loadContractCode(contractName: string): Promise<Cell> {
  if (!codeCache.has(contractName)) {
    codeCache.set(contractName, readContractCode(contractName))
  }
  if (contractName === 'Deployable') {
    const code = await codeCache.get(contractName)!
    const codeHash = code.hash()
    expect(codeHash).toEqual(
      Buffer.from('0a848f11f0dd717b47a5f78e854fd764b0538f48bff808d07e6191f4abe1f2d3', 'hex'),
    )
  }
  return codeCache.get(contractName)!
}

export function getCompiledContractPath(contractName: string): string {
  return join(BUILD_ROOT, `${contractName}.compiled.json`)
}
