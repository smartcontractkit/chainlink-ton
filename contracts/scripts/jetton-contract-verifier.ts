import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { execSync } from 'child_process'

interface FileInfo {
  path: string
  expectedHash?: string
}

interface VerificationResult {
  file: string
  downloaded: boolean
  verified: boolean
  hash: string
  expectedHash?: string
  error?: string
}

/**
 * Jetton Contract Verifier
 *
 * Downloads and verifies .fc files from the official TON jetton contract repository
 */
export class JettonContractVerifier {
  private readonly commitHash = '3d24b419f2ce49c09abf6b8703998187fe358ec9'
  private readonly baseUrl = 'https://raw.githubusercontent.com/ton-blockchain/jetton-contract/'
  private readonly contractsDir: string

  private readonly jettonFiles: FileInfo[] = [
    {
      path: 'jetton-minter.fc',
      expectedHash: '59c7b2e139a7489fa29919b27ccf41ed329f1481c709a444b40860b7af1ff5e5',
    },
    {
      path: 'jetton-wallet.fc',
      expectedHash: '78dcf3af0b2dcb733f36c12941cce9bef5d233ba1e241d91d7e6ec00ff6586f6',
    },
    {
      path: 'stdlib.fc',
      expectedHash: '003246e6de12e46e43a4896c9197a7efcec722fc8e4a5427e24703d6f30cc2db',
    },
    {
      path: 'op-codes.fc',
      expectedHash: '2324009f27064dd1deead78db5b29a55d5745311c3e82f1b56ebdae26122b7a1',
    },
    {
      path: 'jetton-utils.fc',
      expectedHash: '2ca87a7fde528a62f9befe6bd410d6baef7bd11ae66020769cc9e45389154df6',
    },
    {
      path: 'workchain.fc',
      expectedHash: 'cc1927d6dc2339075d08cada868f238ab2e1b475974e9fad9fae284732e23a7c',
    },
    {
      path: 'gas.fc',
      expectedHash: 'dabfca0cf3a34c023cc9428afa84ee46aecb095608214e5571254f83d1381ffb',
    },
  ]

  constructor(contractsDir?: string) {
    this.contractsDir = contractsDir || this.getDefaultContractsDir()
  }

  /**
   * Finds the git repository root directory
   */
  private findGitRoot(): string {
    try {
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        cwd: __dirname,
      }).trim()
      return gitRoot
    } catch (error) {
      throw new Error('Could not find git repository root. Make sure you are in a git repository.')
    }
  }

  /**
   * Gets the default contracts directory relative to git root
   */
  private getDefaultContractsDir(): string {
    const gitRoot = this.findGitRoot()
    return path.join(gitRoot, 'contracts', 'contracts', 'jetton')
  }

  /**
   * Downloads a file from the GitHub repository
   */
  private async downloadFile(filePath: string): Promise<string> {
    const url = `${this.baseUrl}${this.commitHash}/contracts/${filePath}`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return await response.text()
    } catch (error) {
      throw new Error(`Failed to download ${filePath}: ${error}`)
    }
  }

  /**
   * Calculates SHA-256 hash of the content
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
  }

  /**
   * Ensures the contracts directory exists
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.contractsDir)) {
      fs.mkdirSync(this.contractsDir, { recursive: true })
    }
  }

  /**
   * Downloads and verifies a single file
   */
  private async downloadAndVerifyFile(fileInfo: FileInfo): Promise<VerificationResult> {
    const result: VerificationResult = {
      file: fileInfo.path,
      downloaded: false,
      verified: false,
      hash: '',
      expectedHash: fileInfo.expectedHash,
    }

    try {
      // Download the file
      const content = await this.downloadFile(fileInfo.path)
      result.downloaded = true

      // Calculate hash
      result.hash = this.calculateHash(content)

      // Verify hash if expected hash is provided
      if (fileInfo.expectedHash) {
        result.verified = result.hash === fileInfo.expectedHash
        if (!result.verified) {
          result.error = `Hash mismatch. Expected: ${fileInfo.expectedHash}, Got: ${result.hash}`
          return result
        }
      } else {
        result.verified = true // Consider verified if no expected hash
      }

      // Save the file
      const filePath = path.join(this.contractsDir, fileInfo.path)
      fs.writeFileSync(filePath, content, 'utf8')

      return result
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      return result
    }
  }

  /**
   * Downloads and verifies all jetton contract files
   */
  public async downloadAndVerifyContracts(missingFiles: FileInfo[]): Promise<VerificationResult[]> {
    this.ensureDirectoryExists()

    const results: VerificationResult[] = []

    for (const fileInfo of missingFiles) {
      console.log(`  • Downloading ${fileInfo.path}...`)
      const result = await this.downloadAndVerifyFile(fileInfo)
      results.push(result)

      if (result.downloaded && result.verified) {
        console.log(`    ✅ Downloaded and verified (hash: ${result.hash.substring(0, 8)}...)`)
      } else if (result.downloaded && !result.verified) {
        console.warn(`    ⚠️  Downloaded but verification failed: ${result.error}`)
      } else {
        console.error(`    ❌ Failed to download: ${result.error}`)
      }
    }

    return results
  }

  /**
   * Updates the expected hashes based on current files
   */
  public async updateExpectedHashes(): Promise<Record<string, string>> {
    console.log('🔍 Calculating hashes for verification...')

    const hashes: Record<string, string> = {}

    for (const fileInfo of this.jettonFiles) {
      try {
        const content = await this.downloadFile(fileInfo.path)
        const hash = this.calculateHash(content)
        hashes[fileInfo.path] = hash
        console.log(`  • ${fileInfo.path}: ${hash.substring(0, 8)}...`)
      } catch (error) {
        console.error(`  ❌ Failed to get hash for ${fileInfo.path}: ${error}`)
      }
    }

    return hashes
  }

  /**
   * Verifies all files have been downloaded successfully
   */
  public async requireJettonContracts(): Promise<boolean> {
    const missingFiles = this.getMissingFiles()

    if (missingFiles.length === 0) {
      return true
    }

    console.log(
      `📥 Downloading ${missingFiles.length} missing jetton contract file(s) from official repository (commit: ${this.commitHash.substring(0, 8)})...`,
    )

    const results = await this.downloadAndVerifyContracts(missingFiles)

    const allSuccessful = results.every((result) => result.downloaded && result.verified)

    if (allSuccessful) {
      console.log('✅ All jetton contracts downloaded and verified successfully!')
      console.log(`📁 Files saved to: ${this.contractsDir}`)
    } else {
      console.error('❌ Some files failed to download or verify. Check the logs above.')

      // Print summary of failures
      const failures = results.filter((r) => !r.downloaded || !r.verified)
      console.error('Failed files:')
      failures.forEach((f) => {
        console.error(`  • ${f.file}: ${f.error || 'Unknown error'}`)
      })
    }

    return allSuccessful
  }

  // Returns a list of missing files that are expected but not found, or that have mismatched hashes
  getMissingFiles(): FileInfo[] {
    const missingFiles: FileInfo[] = []

    for (const fileInfo of this.jettonFiles) {
      const filePath = path.join(this.contractsDir, fileInfo.path)

      if (!fs.existsSync(filePath)) {
        missingFiles.push(fileInfo)
      } else {
        const content = fs.readFileSync(filePath, 'utf8')
        const hash = this.calculateHash(content)

        if (fileInfo.expectedHash && hash !== fileInfo.expectedHash) {
          missingFiles.push(fileInfo)
        }
      }
    }

    return missingFiles
  }

  /**
   * Gets the path where contracts are stored
   */
  public getContractsPath(): string {
    return this.contractsDir
  }

  /**
   * Gets the commit hash being used
   */
  public getCommitHash(): string {
    return this.commitHash
  }
}

/**
 * Convenience function to download and verify jetton contracts
 */
export async function downloadAndVerifyJettonContracts(contractsDir?: string): Promise<boolean> {
  const verifier = new JettonContractVerifier(contractsDir)
  return await verifier.requireJettonContracts()
}

/**
 * Convenience function to get current hashes (useful for updating expected hashes)
 */
export async function getJettonContractHashes(): Promise<Record<string, string>> {
  const verifier = new JettonContractVerifier()
  return await verifier.updateExpectedHashes()
}

/**
 * Main function to run the script from command line
 */
async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node jetton-contract-verifier.js [options]

Options:
  --contracts-dir <path>  Custom directory for contracts (default: auto-detected)
  --update-hashes        Update expected hashes from current files
  --help, -h             Show this help message

Examples:
  node jetton-contract-verifier.js
  node jetton-contract-verifier.js --contracts-dir ./custom-contracts
  node jetton-contract-verifier.js --update-hashes
`)
    process.exit(0)
  }

  try {
    if (args.includes('--update-hashes')) {
      console.log('🔍 Updating expected hashes...')
      const hashes = await getJettonContractHashes()
      console.log('\n📝 Current hashes:')
      Object.entries(hashes).forEach(([file, hash]) => {
        console.log(`  ${file}: ${hash}`)
      })
      return
    }

    const contractsDirIndex = args.indexOf('--contracts-dir')
    const contractsDir = contractsDirIndex !== -1 ? args[contractsDirIndex + 1] : undefined

    console.log('🚀 Starting jetton contract verification...')
    const success = await downloadAndVerifyJettonContracts(contractsDir)

    if (success) {
      console.log('\n🎉 All done! Jetton contracts are ready to use.')
      process.exit(0)
    } else {
      console.error('\n💥 Some files failed to download or verify.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Run main function if this file is executed directly
if (require.main === module) {
  main()
}
