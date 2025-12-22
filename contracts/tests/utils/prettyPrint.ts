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

/**
 * Extracts the address of every participant in an array of transactions and maps to contract names if possible.
 *
 * Useful for debugging purposes.
 *
 * Example using test from `contracts/tests/ccip/CCIPRouter.spec.ts`:
 *
 * ```
 * const result = await router.sendCcipSend(sender.getSender(), {
 *   value: toNano('1'),
 *   body: {
 *     queryID: 1,
 *     destChainSelector: CHAINSEL_EVM_TEST_90000001,
 *     receiver: Buffer.alloc(64),
 *     data: Cell.EMPTY,
 *     tokenAmounts: [],
 *     feeToken: ZERO_ADDRESS,
 *     extraArgs: Cell.EMPTY,
 *   },
 * })
 * console.log(prettifyAddressesMap(result.transactions))
 * ```
 *
 * Output:
 *
 * ```
 * Map(4) {
 *   '0:4f0012472f2f564e18692f950888322b5075b3cfa32386af7a84f3f84ee32418' => 'TreasuryContract-sender',
 *   '0:c1c4e33bf3f75b022d8f37ecf9e67f603307dd578028b3cefb05970578512e8f' => 'Router',
 *   '0:d46751fd09468c4e7f4420dda2fe96f6bc3748327b11aecb6e3d2b851acd3f1c' => 'OnRamp',
 *   '0:dca1dfcb72e34a8cfab939a613cd9e91e4002a048cab727df45b2704bf1cd02d' => 'FeeQuoter'
 * }
 * ```
 **/
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

/**
 * Draws message trace from transactions, replacing addresses with contract names when possible, parsing opcodes from bodies, showing exit codes, bounces and message values.
 *
 * Useful for debugging message flow between contracts.
 *
 * Example using test from `contracts/tests/ccip/CCIPRouter.spec.ts`:
 *
 * ```
 * const result = await router.sendCcipSend(sender.getSender(), {
 *   value: toNano('1'),
 *   body: {
 *     queryID: 1,
 *     destChainSelector: CHAINSEL_EVM_TEST_90000001,
 *     receiver: Buffer.alloc(64),
 *     data: Cell.EMPTY,
 *     tokenAmounts: [],
 *     feeToken: ZERO_ADDRESS,
 *     extraArgs: Cell.EMPTY,
 *   },
 * })
 * console.log((await dump(result.transactions)).join('\n'))
 * ```
 *
 * Output:
 *
 * ```
 * external -- (opcode: 0xd7d5ec75, exit code 0) --> TreasuryContract-sender
 * └ TreasuryContract-sender -- (opcode: 0x00000001, amount: 1000000000, exit code 0) --> Router
 * │ └ Router -- (opcode: 0xdcf993c2, amount: 99141200, exit code 0) --> OnRamp
 * │ │ └ OnRamp -- (opcode: 0x20000005, amount: 48941600, exit code 0) --> FeeQuoter
 * │ │ │ └ FeeQuoter -- (opcode: 0x00000003, amount: 48839200, exit code 0) --> OnRamp
 * │ │ │ │ └ OnRamp emit: (opcode: 0x32a99a2b)
 * ```
 **/
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
        throw new Error("external-out message doesn't have a tx")
      default:
        throw new Error('unknown message type')
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
