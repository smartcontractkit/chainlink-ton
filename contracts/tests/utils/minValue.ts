import { Address, beginCell, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { TokenPool_Data } from '../../wrappers/gen/ccip/pools/TokenPool'

/// Shared fixture funding for the default sandbox configuration.
/// These fixed values are not guarantees for other prices, configured floors or complete flows.
/// See docs/contracts/overview/ccip/MIN-VALUE-CHECKS.md.
export const MIN_VALUE = {
  /** CCIP custody-bearing flows: LockOrBurn, ReleaseOrMint, custody notifications, lockbox deposits. */
  ccip: toNano('0.5'),
  /** CCIP admin/config handlers (no custody). */
  ccipAdmin: toNano('0.1'),
  /** MCMS flows. */
  mcms: toNano('0.1'),
  /** MCMS admin/config handlers. */
  mcmsAdmin: toNano('0.1'),
} as const

/** Configure a sandbox fixture before sending messages; there is no on-chain floor setter. */
export async function setTokenPoolSafetyFloor(
  blockchain: Blockchain,
  address: Address,
  group: 'default' | 'admin',
  value: bigint,
) {
  await updateTokenPoolData(blockchain, address, (data) => {
    data.rollback[group].value = value
  })
}

export async function setTokenPoolAdmissionPolicy(
  blockchain: Blockchain,
  address: Address,
  policy: { safety: bigint; admission: bigint | null },
) {
  await updateTokenPoolData(blockchain, address, (data) => {
    data.rollback.default.value = policy.safety
    data.admission.value = policy.admission
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
