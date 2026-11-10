import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'

type TokenPoolInitClient = {
  address: Address
  sendTokenPoolInit: (
    via: any,
    msgValue: bigint,
    body: { extra: any | null },
    extraOptions?: any,
  ) => Promise<any>
  getIsInitialized: () => Promise<boolean>
}

/**
 * Sends the one-time pool init message. For LockReleaseLockboxTokenPool this triggers the
 * lockbox handshake, so the lockbox must already be initialized and grant the pool OPERATOR_ROLE.
 */
export async function sendTokenPoolInit(opts: {
  pool: TokenPoolInitClient
  sender: SandboxContract<TreasuryContract>
  value?: bigint
}): Promise<any> {
  return opts.pool.sendTokenPoolInit(opts.sender.getSender(), opts.value ?? toNano('0.1'), {
    extra: null,
  })
}

/** Sends init and asserts the pool became initialized. */
export async function initTokenPool(opts: {
  pool: TokenPoolInitClient
  sender: SandboxContract<TreasuryContract>
  value?: bigint
}): Promise<any> {
  const result = await sendTokenPoolInit(opts)
  expect(await opts.pool.getIsInitialized()).toBe(true)
  return result
}
