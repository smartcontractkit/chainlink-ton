import { beginCell } from '@ton/core'

const EVM_ADDRESS = beginCell()
  .storeBuffer(
    Buffer.from('0000000000000000000000001234567890123456789012345678901234567890', 'hex'),
  )
  .asSlice()
export default EVM_ADDRESS
