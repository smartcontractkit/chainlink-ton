import { Address, beginCell, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import {
  TokenPool_Budget,
  TokenPool_Data,
  TokenPool_FlowBudget,
} from '../../wrappers/gen/ccip/pools/TokenPool'

/// Shared fixture funding for the default sandbox configuration.
/// These fixed values are not guarantees for other prices, configured floors or complete flows.
/// See docs/contracts/overview/ccip/MIN-VALUE-CHECKS.md.
export const MIN_VALUE = {
  /** CCIP custody-bearing flows: LockOrBurn, ReleaseOrMint, custody notifications, lockbox deposits. */
  ccip: toNano('0.5'),
} as const

/** Raises both flows' safety budget on a sandbox pool (admission follows, as it covers safety). */
export async function setTokenPoolSafetyFloor(blockchain: Blockchain, address: Address, value: bigint) {
  await setTokenPoolBudget(blockchain, address, { safety: value, admission: 0n })
}

/** Writes the same per-flow budget for LockOrBurn and ReleaseOrMint; zero keeps the pool default. */
export async function setTokenPoolBudget(
  blockchain: Blockchain,
  address: Address,
  flow: { safety: bigint; admission: bigint },
) {
  await updateTokenPoolData(blockchain, address, (data) => {
    data.budget = TokenPool_Budget.create({
      lockOrBurn: TokenPool_FlowBudget.create(flow),
      releaseOrMint: TokenPool_FlowBudget.create(flow),
    })
  })
}

async function updateTokenPoolData(
  blockchain: Blockchain,
  address: Address,
  update: (data: TokenPool_Data) => void,
) {
  const contract = await blockchain.getContract(address)
  const account = contract.account
  const state = account.account?.storage.state
  if (state?.type !== 'active' || !state.state.data) throw new Error('Pool must be active')

  // Both concrete pools store poolData as their first reference; preserve the rest of storage.
  const storage = state.state.data.beginParse()
  const data = TokenPool_Data.fromSlice(storage.loadRef().beginParse())
  update(data)
  state.state.data = beginCell().storeRef(TokenPool_Data.toCell(data)).storeSlice(storage).endCell()
  contract.account = account
}
