import { Address } from '@ton/core'

export const DUMMY_ADDRESS: Address = Address.parse(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

// address reserved for `feeToken` to represent the native TON currency (grams)
export const NATIVE_GRAM: Address = Address.parse(
  '0:0000000000000000000000000000000000000000000000000000000000000001',
)
export const LINK_TOKEN: Address = Address.parse(
  '0:0000000000000000000000000000000000000000000000000000000000000002',
)
