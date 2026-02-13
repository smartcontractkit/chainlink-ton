import { Address, toNano } from '@ton/core'
import { NetworkProvider } from '@ton/blueprint'
import { WalletContractV5R1 } from '@ton/ton'
import { OnRamp } from '../wrappers/ccip/OnRamp'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

// Load .env file if it exists
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^['"]|['"]$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    })
  }
}

loadEnv()

// Helper function to prompt user for confirmation
function promptConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y')
    })
  })
}

/**
 * Script to call sendWithdrawFeeTokens on OnRamp contracts
 *
 * Usage: yarn blueprint run sendWithdrawOnRamp --<network> --mnemonic <onRampAddress1> [onRampAddress2...]
 *
 * Or with private key: WALLET_PK=<hex_private_key> yarn blueprint run sendWithdrawOnRamp --<network> <onRampAddress1> [onRampAddress2...]
 *
 * Arguments:
 *   onRampAddresses: One or more OnRamp contract addresses to withdraw from (space-separated)
 *
 * Environment Variables:
 *   WALLET_PK: (Optional) Hex-encoded key pair (64 bytes / 128 hex chars). Format: 32 bytes private key + 32 bytes public key. If set, uses this instead of mnemonic.
 *
 * Examples:
 *   # Withdraw fee tokens from OnRamp contracts (using mnemonic)
 *   yarn blueprint run sendWithdrawOnRamp --testnet --mnemonic EQAbc... EQDef...
 *
 *   # Withdraw using private key
 *   WALLET_PK=abc123... yarn blueprint run sendWithdrawOnRamp --testnet EQAbc... EQDef...
 *
 * Note: This withdraws all accumulated fees to the feeAggregator address configured in the OnRamp.
 *       The contract will maintain its reserve amount as configured.
 *       You will be prompted to confirm the destination address before each withdrawal.
 */
export async function run(provider: NetworkProvider, args: string[]) {
  if (args.length < 1) {
    throw new Error(
      'Usage: yarn blueprint run sendWithdrawOnRamp --<network> --mnemonic <onRampAddress1> [onRampAddress2...]',
    )
  }

  // Check if WALLET_PK environment variable is set
  let sender
  let senderAddress: Address

  if (process.env.WALLET_PK) {
    // Use private key from environment variable (64 bytes: 32 bytes private key + 32 bytes public key)
    const fullKeyHex = process.env.WALLET_PK
    const fullKey = Buffer.from(fullKeyHex, 'hex')

    if (fullKey.length !== 64) {
      throw new Error(
        `Invalid key length: expected 64 bytes (128 hex chars), got ${fullKey.length}. Format: 32 bytes private key + 32 bytes public key`,
      )
    }

    // Extract private key (first 32 bytes) and public key (last 32 bytes)
    const privateKey = fullKey.subarray(0, 32)
    const publicKey = fullKey.subarray(32, 64)

    // Create secret key for signing (64 bytes: private + public)
    const secretKey = Buffer.concat([privateKey, publicKey])

    // Create wallet from public key
    const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: publicKey })
    const contract = provider.open(wallet)

    sender = contract.sender(secretKey)
    senderAddress = wallet.address

    console.log('Using wallet from WALLET_PK environment variable')
    console.log('Wallet address:', senderAddress.toString())
  } else {
    // Use provider's sender (mnemonic-based)
    sender = provider.sender()
    senderAddress = sender.address

    if (!senderAddress) {
      throw new Error('Sender address not available')
    }
  }

  // Parse OnRamp addresses
  const onRampAddresses: Address[] = []
  for (let i = 0; i < args.length; i++) {
    try {
      const addr = Address.parse(args[i])
      onRampAddresses.push(addr)
    } catch {
      throw new Error(`Invalid OnRamp address: ${args[i]}`)
    }
  }

  // Check if we have at least one OnRamp address
  if (onRampAddresses.length === 0) {
    throw new Error('At least one OnRamp address must be provided')
  }

  console.log('\n📋 OnRamp Fee Withdrawal Configuration:')
  console.log(`   Sender: ${senderAddress.toString()}`)
  console.log(`   OnRamp contracts to withdraw from: ${onRampAddresses.length}`)
  console.log('')

  // Execute withdrawals
  for (let idx = 0; idx < onRampAddresses.length; idx++) {
    const onRampAddress = onRampAddresses[idx]
    console.log(`[${idx + 1}/${onRampAddresses.length}] Processing ${onRampAddress.toString()}...`)

    try {
      await withdrawFromOnRamp(provider, sender, onRampAddress)
      console.log(`   ✅ Withdrawal transaction sent successfully`)
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`)
    }

    // Add separator between contracts
    if (idx < onRampAddresses.length - 1) {
      console.log('')
    }
  }

  console.log('\n✅ All withdrawals processed!')
}

async function withdrawFromOnRamp(provider: NetworkProvider, sender: any, onRampAddress: Address) {
  // Open OnRamp contract
  const onRamp = provider.open(OnRamp.createFromAddress(onRampAddress))

  // Get dynamic config and show where funds will go BEFORE sending transaction
  let config
  let reserve
  let balance

  try {
    config = await onRamp.getDynamicConfig()
    reserve = await onRamp.getReserve()

    // Try to get current balance
    try {
      const account = await provider.provider(onRampAddress).getState()
      balance = account.balance
    } catch {
      balance = null
    }

    console.log('')
    console.log('   ⚠️  WITHDRAWAL DETAILS:')
    console.log(`   Fee Aggregator (destination): ${config.feeAggregator.toString()}`)
    console.log(`   Reserve (will remain): ${reserve} nanoTON (${Number(reserve) / 1e9} TON)`)
    if (balance !== null) {
      const withdrawAmount = balance > reserve ? balance - reserve : 0n
      console.log(`   Current Balance: ${balance} nanoTON (${Number(balance) / 1e9} TON)`)
      console.log(
        `   Amount to withdraw: ~${withdrawAmount} nanoTON (~${Number(withdrawAmount) / 1e9} TON)`,
      )
    }
    console.log('')
  } catch (error) {
    console.error(`   ❌ ERROR: Could not fetch contract config - ${error}`)
    console.log('   Cannot proceed without knowing the fee aggregator address.')
    throw error
  }

  // Prompt for confirmation
  const confirmed = await promptConfirmation(
    `   Do you want to proceed with withdrawal to ${config.feeAggregator.toString()}?`,
  )

  if (!confirmed) {
    console.log('   ⏭️  Withdrawal cancelled by user')
    return
  }

  // Send withdrawFeeTokens with empty feeTokens array (withdraws native TON)
  // The contract sends excess balance (minus reserve) to the feeAggregator
  await onRamp.sendWithdrawFeeTokens(
    sender,
    toNano('0.5'), // Higher gas for this operation
    {
      feeTokens: [], // Empty array = withdraw native TON only
    },
  )
}
