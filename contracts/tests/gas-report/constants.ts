import { beginCell } from '@ton/core'

// Test Addresses
export const EVM_SENDER_ADDRESS_TEST = beginCell()
  .storeBuffer(Buffer.from('1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an', 'hex'))
  .asSlice()
export const EVM_ONRAMP_ADDRESS_TEST = beginCell()
  .storeBuffer(Buffer.from('111111c891c5d4e6ad68064ae45d43146d4f9f3an', 'hex'))
  .asSlice()
