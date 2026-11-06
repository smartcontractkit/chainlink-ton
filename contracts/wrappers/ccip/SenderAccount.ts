import { Address, beginCell, Cell } from '@ton/core'

import * as NameSpace from './NameSpace'

/// Derives the Router-owned SenderAccount address for (user, token), matching
/// `Router.senderAccountAddress` and the pool's `deriveDepositAccount` deposit auth.
export function deriveSenderAccountAddress(opts: {
  /// The pool's configured Router (the account's owner).
  router: Address
  user: Address
  token: Address
  deployableCode: Cell
}): Address {
  return NameSpace.deriveAddress(
    opts.router,
    NameSpace.CCIPNamespace.SenderAccount,
    beginCell().storeAddress(opts.user).storeAddress(opts.token),
    opts.deployableCode,
  )
}
