import { Address, beginCell, Cell } from '@ton/core'

import * as NameSpace from './NameSpace'

/// Derives the Router-owned OnRampAccount address for (user, token), matching
/// `Router.onRampAccountAddress` and the pool's `deriveDepositAccount` deposit auth.
export function deriveOnRampAccountAddress(opts: {
  /// The pool's configured Router (the account's owner).
  router: Address
  user: Address
  token: Address
  deployableCode: Cell
}): Address {
  return NameSpace.deriveAddress(
    opts.router,
    NameSpace.CCIPNamespace.OnRampAccount,
    beginCell().storeAddress(opts.user).storeAddress(opts.token),
    opts.deployableCode,
  )
}
