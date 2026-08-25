import * as c from '@ton/core'
import * as s from '@ton/sandbox'
import { FlatTransaction } from '@ton/test-utils'

// Sends an internal message from a given address to another address, returning an async iterator of transactions.
export async function sendMessageAsync(
  blockchain: s.Blockchain,
  from: c.Address,
  opt: {
    to: c.Address
    value: bigint
    body: c.Cell
  },
): Promise<
  AsyncIterator<s.BlockchainTransaction, any, any> & AsyncIterable<s.BlockchainTransaction>
> {
  const msg: c.Message = {
    info: {
      type: 'internal',
      ihrDisabled: false,
      bounce: true,
      bounced: false,
      src: from,
      dest: opt.to,
      value: { coins: opt.value },
      ihrFee: 0n,
      forwardFee: 0n,
      createdLt: 0n,
      createdAt: 0,
    },
    body: opt.body,
  }

  const iter = await blockchain.sendMessageIter(msg)
  return iter
}

type AccountSnapshot = {
  stateType: string | undefined
  balance: bigint
}

type TransactionSnapshot = {
  account: c.Address
  before: AccountSnapshot
  after: AccountSnapshot
}

// Iterates over transactions, collects them and captures account state changes for a set of accounts.
export async function captureAccountChanges(
  blockchain: s.Blockchain,
  txs: AsyncIterator<s.BlockchainTransaction, any, any> & AsyncIterable<s.BlockchainTransaction>,
  accounts: c.Address[],
): Promise<{
  transactions: s.BlockchainTransaction[]
  accountSnapshots: Map<bigint, TransactionSnapshot>
}> {
  // `blockchain.getContract()` returns a cached, mutable instance — snapshot primitives before stepping.
  async function snapshot(address: c.Address): Promise<AccountSnapshot> {
    const c = await blockchain.getContract(address)
    return { stateType: c.accountState?.type, balance: c.balance }
  }

  // Address objects don't implement value equality, so key snapshots by their canonical raw string.
  const key = (a: c.Address) => a.toRawString()

  async function recordSnapshots(address: c.Address): Promise<[string, AccountSnapshot]> {
    return [key(address), await snapshot(address)]
  }

  let transactions: s.BlockchainTransaction[] = []
  // Map<tx.lt, TransactionSnapshot>
  let accountSnapshots: Map<bigint, TransactionSnapshot> = new Map()

  let lastSnapshot: Map<string, AccountSnapshot> = new Map(
    await Promise.all(accounts.map(recordSnapshots)),
  )
  for await (const tx of txs) {
    transactions.push(tx)

    const dest = tx.inMessage?.info.dest

    if (!dest || !(dest instanceof c.Address)) {
      continue
    }

    const beforeSnap = lastSnapshot.get(key(dest))
    if (!beforeSnap) continue

    lastSnapshot = new Map(await Promise.all(accounts.map(recordSnapshots)))

    accountSnapshots.set(tx.lt, {
      account: dest,
      before: beforeSnap,
      after: lastSnapshot.get(key(dest))!,
    })
  }

  return {
    transactions,
    accountSnapshots,
  }
}
