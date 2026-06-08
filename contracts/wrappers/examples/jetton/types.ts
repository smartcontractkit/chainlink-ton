import { Address, Builder, Cell, Slice, beginCell } from '@ton/core'
import { CellCodec } from '../../utils'

export type JettonClientConfig = {
  masterAddress: Address
  jettonWalletCode: Cell
}

export const builder = {
  data: (() => {
    const traitData: CellCodec<JettonClientConfig> = {
      encode: (config: JettonClientConfig): Builder => {
        return beginCell().storeAddress(config.masterAddress).storeRef(config.jettonWalletCode)
      },
      load: (src: Slice): JettonClientConfig => {
        return {
          masterAddress: src.loadAddress(),
          jettonWalletCode: src.loadRef(),
        }
      },
    }

    return {
      traitData,
    }
  })(),
}

export const ErrorCodes = {
  INCORRECT_SENDER: 100,
  FORWARD_PAYLOAD_REQUIRED: 101,
}
