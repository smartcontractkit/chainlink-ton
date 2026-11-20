import { Slice, Transaction } from '@ton/core'
import {
  FlatTransactionComparable,
  filterTransactions,
  findTransaction,
  findTransactionRequired,
} from '@ton/test-utils'

/** A generated message type (e.g. `of.MerkleRoot_MarkState`): its opcode and its decoder. */
export type MessageType<M> = {
  PREFIX: number
  fromSlice(s: Slice): M
}

const decode = <M>(type: MessageType<M>, tx: Transaction): M =>
  type.fromSlice(tx.inMessage!.body.beginParse())

/**
 * Like `filterTransactions`, matching only transactions that received a message of `type`, and
 * returning those messages decoded.
 */
export function filterMessagesByType<M>(
  txs: Transaction[],
  type: MessageType<M>,
  match: FlatTransactionComparable = {},
): M[] {
  return filterTransactions(txs, { ...match, op: type.PREFIX }).map((tx) => decode(type, tx))
}

/**
 * Like `findTransaction`, matching only a transaction that received a message of `type`, and
 * returning that message decoded.
 */
export function findMessageByType<M>(
  txs: Transaction | Transaction[],
  type: MessageType<M>,
  match: FlatTransactionComparable = {},
): M | undefined {
  const tx = findTransaction(txs, { ...match, op: type.PREFIX })
  return tx && decode(type, tx)
}

/**
 * Like `findTransactionRequired`, matching only a transaction that received a message of `type`,
 * and returning that message decoded.
 */
export function findMessageRequiredByType<M>(
  txs: Transaction | Transaction[],
  type: MessageType<M>,
  match: FlatTransactionComparable = {},
): M {
  return decode(type, findTransactionRequired(txs, { ...match, op: type.PREFIX }))
}
