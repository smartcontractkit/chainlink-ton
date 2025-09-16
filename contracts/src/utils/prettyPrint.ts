import {
  Address,
  Cell,
  CommonMessageInfoExternalIn,
  CommonMessageInfoExternalOut,
  CommonMessageInfoInternal,
  Message,
} from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'
import { prettifyTransaction, PrettyTransaction } from '@ton/test-utils'

/**
 * Exit code type - represents TVM exit codes
 */
export type ExitCode = number

/**
 * Exit code descriptions for better readability.
 */
const EXIT_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Success',
  1: 'Alternative success',
  2: 'Stack underflow',
  3: 'Stack overflow',
  4: 'Integer overflow',
  5: 'Integer out of expected range',
  6: 'Invalid opcode',
  7: 'Type check error',
  8: 'Cell overflow',
  9: 'Cell underflow',
  10: 'Dictionary error',
  11: 'Unknown error',
  12: 'Fatal error',
  13: 'Out of gas',
  14: 'Virtualization error',
  // Add more as needed
}

export async function dump(txs: BlockchainTransaction[]): Promise<string[]> {
  return dumpRecursive(txs[0], txs)
}

/**
 * Describes an exit code with human-readable information.
 */
function describeExitCode(exitCode?: ExitCode): string {
  if (exitCode === undefined || exitCode === null) {
    return 'pending'
  }

  if (exitCode === 0) {
    return 'exit code 0'
  }

  const description = EXIT_CODE_DESCRIPTIONS[exitCode] || 'Unknown error'
  return `exit code: ${exitCode} (${description})`
}

/**
 * Describes the body/payload of a message cell.
 */
function describeBody(body: Cell): string {
  try {
    const slice = body.beginParse()

    if (slice.remainingBits === 0) {
      return 'empty'
    }

    // Try to parse as opcode (first 32 bits)
    if (slice.remainingBits >= 32) {
      try {
        const opcode = slice.loadUint(32)
        return `opcode: 0x${opcode.toString(16).padStart(8, '0')}`
      } catch {
        // Fall through to string parsing
      }
    }

    // Try to parse as string snake
    try {
      const strSnake = body.beginParse().loadStringTail()
      if (strSnake) {
        return `stringSnake: ${strSnake}`
      }
    } catch {
      // Fall through to hex dump
    }

    // Fall back to hex representation
    return `body: ${body.toBoc().toString('hex').substring(0, 32)}...`
  } catch (error) {
    return `body: parse error - ${error}`
  }
}

/**
 * Describes an internal message with amount, bounce status, and exit code.
 */
async function describeInternalMessage(
  info: CommonMessageInfoInternal,
  body: Cell,
  prettyTx: PrettyTransaction,
  exitCode?: ExitCode,
): Promise<string> {
  let description = describeBody(body)

  // Add amount information
  if (info.type === 'internal') {
    description += `, amount: ${info.value.coins.toString()}`

    if (info.bounced) {
      description += ', bounced'
    }
  }

  description += ', ' + describeExitCode(exitCode)

  const srcAddr = contractNameFromPrettyAddress(prettyTx.from) || 'external'
  const dstAddr = contractNameFromPrettyAddress(prettyTx.to) || 'unknown'

  return `${srcAddr} -- (${description}) --> ${dstAddr}`
}

function contractNameFromPrettyAddress(address: string | undefined): string | undefined {
  if (!address) return undefined
  const parts = address.split('(')
  if (parts.length > 1) {
    return parts[1].trim().replace(')', '')
  }
  return undefined
}

/**
 * Describes an external incoming message.
 */
async function describeExternalInMessage(
  info: CommonMessageInfoExternalIn,
  body: Cell,
  prettyTx: PrettyTransaction,
  exitCode?: ExitCode,
): Promise<string> {
  const description = describeBody(body) + ', ' + describeExitCode(exitCode)
  const srcAddr = contractNameFromPrettyAddress(prettyTx.from) || 'external'
  const dstAddr = contractNameFromPrettyAddress(prettyTx.to) || 'unknown'

  return `${srcAddr} -- (${description}) --> ${dstAddr}`
}

/**
 * Describes an external outgoing message (event).
 */
function describeExternalOutMessage(
  src: string,
  info: CommonMessageInfoExternalOut,
  body: Cell,
): string {
  const description = describeBody(body)
  return `${src} emit: (${description})`
}

/**
 * Recursively dumps a received message and its outgoing messages.
 * This is a helper function for the main dump method.
 */
async function dumpRecursive(
  tx: BlockchainTransaction,
  txs: BlockchainTransaction[],
): Promise<string[]> {
  const output: string[] = []
  let prettyTx = prettifyTransaction(tx)

  // Describe the main message
  const message = tx.inMessage
  if (message != null) {
    let exitCode: number | undefined
    if (tx.description.type === 'generic' && tx.description.computePhase.type === 'vm') {
      exitCode = tx.description.computePhase.exitCode
    }

    switch (message.info.type) {
      case 'internal':
        output.push(await describeInternalMessage(message.info, message.body, prettyTx, exitCode))
        break
      case 'external-in':
        output.push(await describeExternalInMessage(message.info, message.body, prettyTx, exitCode))
        break
      case 'external-out':
        throw `external-out message don't have a tx`
      default:
        throw `unknown message type`
    }
  }

  // Add outgoing received messages (with full traces)
  for (const [_, outMsg] of tx.outMessages) {
    if (outMsg === null || outMsg === undefined) continue
    const foundTx = txs.find(
      (t) => t.inMessage != null && t.inMessage != undefined && compareMsgs(t.inMessage, outMsg),
    )
    if (foundTx) {
      const lines = await dumpRecursive(foundTx, txs)
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          output.push('└ ' + lines[i])
        } else {
          output.push('│ ' + lines[i])
        }
      }
    } else if (outMsg.info.type === 'external-out') {
      output.push(
        '└ ' +
          describeExternalOutMessage(
            contractNameFromPrettyAddress(prettyTx.to)!,
            outMsg.info,
            outMsg.body,
          ),
      )
    }
  }

  return output
}

function compareMsgs(inMessage: Message, outMsg: Message): boolean {
  if (inMessage.info.type == 'internal' && outMsg.info.type == 'internal') {
    return (
      inMessage.info.src.equals(outMsg.info.src) &&
      inMessage.info.dest.equals(outMsg.info.dest) &&
      inMessage.info.createdLt === outMsg.info.createdLt
    )
  } else if (inMessage.info.type == 'external-in' && outMsg.info.type == 'external-in') {
    return inMessage.info.dest.equals(outMsg.info.dest)
  }
  return false
}

/**
 * Utility to format addresses in a consistent way.
 */
export function formatAddress(address: Address | string | undefined | null): string {
  if (!address) return 'NONE'
  if (typeof address === 'string') return address
  return address.toString()
}

/**
 * Utility to format amounts in a human-readable way.
 */
export function formatAmount(amount: bigint, decimals: number = 9): string {
  const divisor = BigInt(10 ** decimals)
  const wholePart = amount / divisor
  const fractionalPart = amount % divisor

  if (fractionalPart === 0n) {
    return wholePart.toString()
  }

  return `${wholePart}.${fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '')}`
}

// Extract address from transactions and map to contract names if possible
export function prettifyAddressesMap(transactions: BlockchainTransaction[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const tx of transactions) {
    if (!tx.inMessage) continue
    const prettyTx = prettifyTransaction(tx)
    if (tx.inMessage.info.src != null && tx.inMessage.info.src instanceof Address) {
      map.set(tx.inMessage.info.src.toRawString(), contractNameFromPrettyAddress(prettyTx.from)!)
    }
    if (tx.inMessage.info.dest != null && tx.inMessage.info.dest instanceof Address) {
      map.set(tx.inMessage.info.dest.toRawString(), contractNameFromPrettyAddress(prettyTx.to)!)
    }
  }
  return map
}
