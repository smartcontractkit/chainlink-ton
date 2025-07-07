import {
  Address,
  beginCell,
  Builder,
  Cell,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'
import { newOCR3BaseCell, OCR3Base, OCR3Config, ocr3ConfigFromCell, ReportContext, SignatureEd25519 } from '../../libraries/ocr/MultiOCR3Base'
import { asSnakeData } from '../../../tests/utils'


export function ocr3BaseExampleStorage(): Cell {
  const builder = beginCell()
    .storeRef(newOCR3BaseCell(1)) //using dummy chainId 1
  return builder.endCell()
}

export class OCR3BaseExample extends OCR3Base {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
  }

  static create(code: Cell, workchain = 0) {
    const data = ocr3BaseExampleStorage()
    const init = { code, data }
    return new OCR3BaseExample(
      contractAddress(workchain, init),
      init
    )
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendTransmit(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint,
      queryId?: number,
      ocrPluginType: number,
      reportContext: ReportContext,
      report: Cell,
      signatures: SignatureEd25519[]
    }) {
      await provider.internal(via, {
        value: opts.value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell()
          .storeUint(0x00000001, 32)//opcode
          .storeUint(opts.ocrPluginType, 16)
          .storeUint(opts.reportContext.configDigest, 256)
          .storeUint(opts.reportContext.sequenceBytes, 64)
          .storeRef(opts.report)
          .storeRef(asSnakeData<SignatureEd25519>(
            opts.signatures,
            (item) => new Builder().storeUint(item.r, 256).storeUint(item.s, 256)
          ))
          .endCell()
      })
    }

    async getOCR3Config(provider: ContractProvider, ocrPluginType: number): Promise<OCR3Config> {
      const result = await provider.get(
        'ocr3Config', 
        [{
          type: 'int',
          value: BigInt(ocrPluginType),
        }]
      )
      const ocr3ConfigCell = result.stack.readCell()
      return ocr3ConfigFromCell(ocr3ConfigCell)
    }
}
