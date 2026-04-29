import { compile } from '@ton/blueprint'
import { Cell } from '@ton/core'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'

const BUILD_ROOT = process.env.CONTRACTS_BUILD_PATH
  ? resolve(process.env.CONTRACTS_BUILD_PATH)
  : resolve(__dirname, '..', 'build')

const codeCache = new Map<string, Cell>()
const DEPLOYABLE_HASH = Buffer.from(
  '61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc',
  'hex',
)

type ContractCodeLoader = (contractName: string) => Promise<Cell>

function createContractCodeLoader({
  buildDirectory,
  compileIfMissing = false,
  cache = new Map<string, Cell>(),
}: {
  buildDirectory: string
  compileIfMissing?: boolean
  cache?: Map<string, Cell>
}): ContractCodeLoader {
  return async (contractName: string) => {
    const code = await getCode(cache, buildDirectory, contractName, compileIfMissing)

    if (contractName === 'Deployable') {
      expect(code.hash()).toEqual(DEPLOYABLE_HASH)
    }

    return code
  }
}

// Creates a contract code loader that reads from the directory specified in the given environment variable.
function createContractCodeLoaderFromEnvDirectory(envVarName: string): ContractCodeLoader {
  const buildDirectory = process.env[envVarName]
  if (!buildDirectory) {
    // Return a loader that always throws an error
    return (contractName: string) => {
      throw new Error(
        `Cannot build contract loader for ${contractName}: Environment variable ${envVarName} not set`,
      )
    }
  }
  return createContractCodeLoader({ buildDirectory })
}

// Returns the compiled code for the given contract name, loading from storage if available.
// It returns null if the compiled code is not available on disk.
async function readBuiltContractCodeFromStorage(
  buildDirectory: string,
  contractName: string,
): Promise<Cell | null> {
  const filePath = join(buildDirectory, `${contractName}.compiled.json`)
  let fileContents: string
  try {
    fileContents = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    // if file not found
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
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

export const contractCode = {
  jetton: createContractCodeLoaderFromEnvDirectory('PATH_CONTRACTS_JETTON'),
  ccip: {
    local: createContractCodeLoader({ buildDirectory: BUILD_ROOT }),
    release_1_6_0: createContractCodeLoaderFromEnvDirectory('PATH_CONTRACTS_1_6'),
  },
}

// Kept for backwards compatibility
// Used to load built contracts
export async function loadContractCode(contractName: string): Promise<Cell> {
  const loader = createContractCodeLoader({
    buildDirectory: BUILD_ROOT,
    compileIfMissing: true,
    cache: codeCache,
  })
  return loader(contractName)
}

async function getCode(
  cache: Map<string, Cell>,
  buildDirectory: string,
  contractName: string,
  compileIfMissing: boolean,
): Promise<Cell> {
  const cachedCode = cache.get(contractName)
  if (cachedCode) {
    return cachedCode
  }

  const preCompiledCode = await readBuiltContractCodeFromStorage(buildDirectory, contractName)
  if (preCompiledCode) {
    cache.set(contractName, preCompiledCode)
    return preCompiledCode
  }

  if (compileIfMissing) {
    console.warn(`Compiled code for contract ${contractName} not found, attempting to compile...`)
    const compiledCode = await compile(contractName)
    cache.set(contractName, compiledCode)
    return compiledCode
  }

  throw new Error(`Compiled code for contract ${contractName} not found at ${buildDirectory}`)
}
