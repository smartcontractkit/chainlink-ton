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
 * Script to update the feeAggregator in OnRamp's dynamic config
 *
 * Usage: yarn blueprint run updateOnRampFeeAggregator --<network> <onRampAddress> <newFeeAggregatorAddress>
 *
 * Arguments:
 *   onRampAddress: OnRamp contract address
 *   newFeeAggregatorAddress: New fee aggregator address to set
 *
 * Environment Variables:
 *   WALLET_PK: (Optional) Hex-encoded key pair (64 bytes / 128 hex chars). Format: 32 bytes private key + 32 bytes public key.
 *
 * Examples:
 *   # Update fee aggregator using private key
 *   WALLET_PK=abc123... yarn blueprint run updateOnRampFeeAggregator --testnet EQAbc... 0QDef...
 *
 *   # Update using mnemonic
 *   yarn blueprint run updateOnRampFeeAggregator --testnet --mnemonic EQAbc... 0QDef...
 *
 * Note: You must be the owner of the OnRamp contract to update the dynamic config.
 */
export async function run(provider: NetworkProvider, args: string[]) {
  if (args.length < 2) {
    throw new Error(
      'Usage: yarn blueprint run updateOnRampFeeAggregator --<network> <onRampAddress> <newFeeAggregatorAddress>',
    )
  }

  // Parse arguments
  const onRampAddress = Address.parse(args[0])
  const newFeeAggregatorAddress = Address.parse(args[1])

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

  console.log('\n📋 OnRamp Fee Aggregator Update Configuration:')
  console.log(`   OnRamp Contract: ${onRampAddress.toString()}`)
  console.log(`   New Fee Aggregator: ${newFeeAggregatorAddress.toString()}`)
  console.log(`   Sender: ${senderAddress.toString()}`)
  console.log('')

  // Open OnRamp contract
  const onRamp = provider.open(OnRamp.createFromAddress(onRampAddress))

  // Fetch current dynamic config
  console.log('📖 Fetching current OnRamp configuration...')
  let currentConfig
  try {
    currentConfig = await onRamp.getDynamicConfig()
    console.log('\n   Current Configuration:')
    console.log(`   Fee Quoter: ${currentConfig.feeQuoter.toString()}`)
    console.log(`   Fee Aggregator: ${currentConfig.feeAggregator.toString()}`)
    console.log(`   Allowlist Admin: ${currentConfig.allowlistAdmin.toString()}`)
    console.log(
      `   Reserve: ${currentConfig.reserve} nanoTON (${Number(currentConfig.reserve) / 1e9} TON)`,
    )
    console.log('')
  } catch (error) {
    console.error(`   ❌ ERROR: Could not fetch current config - ${error}`)
    throw error
  }

  // Check if owner
  try {
    const owner = await onRamp.getOwner()
    console.log(`   Contract Owner: ${owner.toString()}`)
    if (!owner.equals(senderAddress)) {
      console.log(`   ⚠️  WARNING: You are not the owner. This transaction will likely fail.`)
    }
    console.log('')
  } catch (error) {
    console.log(`   Note: Could not verify ownership`)
  }

  // Show the change
  console.log('🔄 Proposed Change:')
  console.log(
    `   Fee Aggregator: ${currentConfig.feeAggregator.toString()} → ${newFeeAggregatorAddress.toString()}`,
  )
  console.log('')

  // Prompt for confirmation
  const confirmed = await promptConfirmation(
    `   Do you want to update the fee aggregator to ${newFeeAggregatorAddress.toString()}?`,
  )

  if (!confirmed) {
    console.log('   ⏭️  Update cancelled by user')
    return
  }

  // Create new config with updated feeAggregator
  const newConfig = {
    feeQuoter: currentConfig.feeQuoter,
    feeAggregator: newFeeAggregatorAddress,
    allowlistAdmin: currentConfig.allowlistAdmin,
    reserve: currentConfig.reserve,
  }

  console.log('\n📤 Sending update transaction...')
  try {
    await onRamp.sendSetDynamicConfig(sender, {
      value: toNano('0.1'),
      body: {
        config: newConfig,
      },
    })
    console.log('   ✅ Transaction sent successfully!')
    console.log('   Note: Wait for the transaction to be confirmed on the blockchain')
  } catch (error) {
    console.error(`   ❌ Failed to send transaction: ${error}`)
    throw error
  }
}
