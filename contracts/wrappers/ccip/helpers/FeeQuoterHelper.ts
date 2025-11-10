import {
  Address,
  Builder as TonBuilder,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  DictionaryValue,
  Sender,
  SendMode,
  Builder,
  Slice,
} from '@ton/core'

import * as FeeQuoter from '../FeeQuoter'
import * as rt from '../Router'
import { compile } from '@ton/blueprint'
import { asSnakeData } from '../../../src/utils'

export class FeeQuoterHelper extends FeeQuoter.FeeQuoter {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super(address, init)
  }

  static createFromConfig(config: FeeQuoter.FeeQuoterStorage, code: Cell, workchain = 0) {
    const data = FeeQuoter.builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new FeeQuoterHelper(contractAddress(workchain, init), init)
  }

  static async code() {
    return await compile('tests.FeeQuoterHelper')
  }

  async getDataAvailabilityCost(
    provider: ContractProvider,
    destChainSelector: bigint,
    dataAvailabilityGasPrice: bigint,
    calldataLen: bigint,
    tokenCount: bigint,
    tokenTransferBytesOverhead: bigint,
  ): Promise<bigint> {
    const { stack } = await provider.get('dataAvailabilityCost', [
      { type: 'int', value: destChainSelector },
      { type: 'int', value: dataAvailabilityGasPrice },
      { type: 'int', value: calldataLen },
      { type: 'int', value: tokenCount },
      { type: 'int', value: tokenTransferBytesOverhead },
    ])
    return stack.readBigNumber()
  }
}
