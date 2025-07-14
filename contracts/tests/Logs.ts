import { Address, Cell, Message } from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'

// https://github.com/ton-blockchain/liquid-staking-contract/blob/1f4e9badbed52a4cf80cc58e4bb36ed375c6c8e7/utils.ts#L269-L294
export const getExternals = (transactions: BlockchainTransaction[]) => {
  const externals: Message[] = []
  return transactions.reduce((all, curExt) => [...all, ...curExt.externals], externals)
}

export const testLog = (
  message: Message,
  from: Address,
  topic: number | bigint,
  matcher?: (body: Cell) => boolean,
) => {
  if (message.info.type !== 'external-out') {
    console.log('Wrong from')
    return false
  }
  if (!message.info.src.equals(from)) return false
  if (!message.info.dest) return false
  if (message.info.dest!.value !== BigInt(topic)) return false
  if (matcher !== undefined) {
    if (!message.body) console.log('No body')
    return matcher(message.body)
  }
  return true
}
