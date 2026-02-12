import { Address, toNano, internal, external, storeMessageRelaxed, SendMode } from '@ton/core'
import { NetworkProvider } from '@ton/blueprint'
import { mnemonicToPrivateKey } from '@ton/crypto'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import * as withdrawable from '../wrappers/libraries/funding/Withdrawable'
import * as fs from 'fs'
import * as path from 'path'

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

/**
 * Script to call sendWithdraw on multiple contracts
 *
 * Usage: yarn blueprint run sendWithdraw --<network> --mnemonic <contractAddress1> [contractAddress2...] [dest:<address>] [amount:<nanoton>] [reserve:<nanoton>]
 *
 * Or with private key: WALLET_PK=<hex_private_key> yarn blueprint run sendWithdraw --<network> <contractAddress1> [contractAddress2...] [dest:<address>] [amount:<nanoton>] [reserve:<nanoton>]
 *
 * Arguments:
 *   contractAddresses: One or more contract addresses to withdraw from (space-separated, all addresses before any keyword arguments)
 *   dest:<address>: (Optional) Destination address for withdrawal. Use "dest:sender" for sender address. Defaults to sender.
 *   amount:<nanoton>: (Optional) Amount to withdraw in nanoTON. Defaults to 0 (drain all available)
 *   reserve:<nanoton>: (Optional) Reserve amount to keep in contract in nanoTON. Defaults to 0.1 TON (100000000)
 *
 * Environment Variables:
 *   WALLET_PK: (Optional) Hex-encoded key pair (64 bytes / 128 hex chars). Format: 32 bytes private key + 32 bytes public key. If set, uses this instead of mnemonic.
 *
 * Examples:
 *   # Drain all from contracts to sender, keeping 0.1 TON reserve (using mnemonic)
 *   yarn blueprint run sendWithdraw --testnet --mnemonic EQAbc... EQDef...
 *
 *   # Drain all from contracts using private key
 *   WALLET_PK=abc123... yarn blueprint run sendWithdraw --testnet EQAbc... EQDef...
 *
 *   # Withdraw to specific destination
 *   yarn blueprint run sendWithdraw --testnet --mnemonic EQAbc... EQDef... dest:0QCwV-uSU3E5qruHKgrkOEBlZ_9sJQHeFoSHvGvtvorrmzfW
 *
 *   # Withdraw 5 TON from each contract to sender
 *   yarn blueprint run sendWithdraw --testnet --mnemonic EQAbc... EQDef... amount:5000000000
 *
 *   # Withdraw all available to specific address, keep 0.5 TON reserve
 *   yarn blueprint run sendWithdraw --testnet --mnemonic EQAbc... EQDef... dest:0QAbc... reserve:500000000
 */
export async function run(provider: NetworkProvider, args: string[]) {
  if (args.length < 1) {
    throw new Error(
      'Usage: yarn blueprint run sendWithdraw --<network> --mnemonic <contractAddress1> [contractAddress2...] [destination] [amount] [reserve]',
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

  // Parse arguments
  let contractAddresses: Address[] = []
  let destination: Address = senderAddress // Default to sender
  let amount: bigint = 0n // Default to 0 (drain all)
  let reserve: bigint = toNano('0.1') // Default reserve: 0.1 TON
  let drainAllAvailable: boolean = true // Default to draining all available

  // Parse all arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // Check if it's a keyword argument (contains ':')
    if (arg.includes(':')) {
      const [key, value] = arg.split(':', 2)

      if (key === 'dest' || key === 'destination') {
        if (value.toLowerCase() === 'sender') {
          destination = senderAddress
        } else {
          try {
            destination = Address.parse(value)
          } catch {
            throw new Error(`Invalid destination address: ${value}`)
          }
        }
      } else if (key === 'amount') {
        try {
          amount = BigInt(value)
          if (amount > 0n) {
            drainAllAvailable = false
          }
        } catch {
          throw new Error(`Invalid amount: ${value}`)
        }
      } else if (key === 'reserve') {
        try {
          reserve = BigInt(value)
        } catch {
          throw new Error(`Invalid reserve: ${value}`)
        }
      } else {
        throw new Error(`Unknown keyword argument: ${key}`)
      }
    } else {
      // Try to parse as contract address
      try {
        const addr = Address.parse(arg)
        contractAddresses.push(addr)
      } catch {
        throw new Error(
          `Invalid argument: ${arg}. Expected contract address or keyword argument (key:value)`,
        )
      }
    }
  }

  // Check if we have at least one contract address
  if (contractAddresses.length === 0) {
    throw new Error('At least one contract address must be provided')
  }

  console.log('\n📋 Withdrawal Configuration:')
  console.log(`   Sender: ${senderAddress.toString()}`)
  console.log(`   Destination: ${destination.toString()}`)
  console.log(`   Amount: ${drainAllAvailable ? 'All available' : `${amount} nanoTON`}`)
  console.log(`   Reserve: ${reserve} nanoTON`)
  console.log(`   Contracts to withdraw from: ${contractAddresses.length}`)
  console.log('')

  // Execute withdrawals
  for (let idx = 0; idx < contractAddresses.length; idx++) {
    const contractAddress = contractAddresses[idx]
    console.log(
      `[${idx + 1}/${contractAddresses.length}] Processing ${contractAddress.toString()}...`,
    )

    try {
      await withdrawFromContract(
        provider,
        sender,
        contractAddress,
        destination,
        amount,
        reserve,
        drainAllAvailable,
      )
      console.log(`   ✅ Withdrawal sent successfully`)
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`)
    }
  }

  console.log('\n✅ All withdrawal transactions sent!')
}

async function withdrawFromContract(
  provider: NetworkProvider,
  sender: any,
  contractAddress: Address,
  destination: Address,
  amount: bigint,
  reserve: bigint,
  drainAllAvailable: boolean,
) {
  // Open contract provider directly
  const contractProvider = provider.provider(contractAddress)

  const withdrawParams: withdrawable.Withdraw = {
    queryId: BigInt(Date.now()), // Use timestamp as query ID
    destination,
    amount,
    reserve,
    drainAllAvailable,
  }

  // Send withdraw transaction with 0.1 TON for gas using withdrawable module directly
  await withdrawable.sendWithdraw(contractProvider, sender, toNano('0.1'), withdrawParams)
}
