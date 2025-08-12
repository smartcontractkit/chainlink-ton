import {
  Address,
  beginCell,
  Builder,
  Cell,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  TupleItem,
} from '@ton/core'
import {
  newOCR3BaseExampleContractCell,
  OCR3Base,
  OCR3Config,
  ocr3ConfigFromCell,
  ReportContext,
  SignatureEd25519,
} from '../../libraries/ocr/MultiOCR3Base'
import { asSnakeData } from '../../../utils'

export function ocr3BaseExampleStorage(): Cell {
  //using dummy chainId 1 and a radom id for unique addresses
  return newOCR3BaseExampleContractCell(1, Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
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
    return new OCR3BaseExample(contractAddress(workchain, init), init)
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
      value: bigint
      queryId?: number
      ocrPluginType: number
      reportContext: ReportContext
      report: Cell
      signatures: SignatureEd25519[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x00000002, 32) //opcode
        .storeUint(opts.ocrPluginType, 16)
        .storeUint(opts.reportContext.configDigest, 256)
        .storeUint(opts.reportContext.padding, 192) //should be zero
        .storeUint(opts.reportContext.sequenceBytes, 64)
        .storeRef(opts.report)
        .storeRef(
          asSnakeData<SignatureEd25519>(opts.signatures, (item) =>
            new Builder().storeUint(item.r, 256).storeUint(item.s, 256).storeUint(item.signer, 256),
          ),
        )
        .endCell(),
    })
  }

  async getOCR3Config(provider: ContractProvider, ocrPluginType: number): Promise<OCR3Config> {
    const resultConfigInfo = await provider.get('ocr3ConfigInfo', [
      {
        type: 'int',
        value: BigInt(ocrPluginType),
      },
    ])
    const configInfoStack = resultConfigInfo.stack

    const configDigest = configInfoStack.readBigNumber()
    const bigF = configInfoStack.readNumber()
    const n = configInfoStack.readNumber()
    const isSignatureVerificationEnabled = configInfoStack.readBoolean()

    const resultTransmitters = await provider.get('ocr3Transmitters', [
      {
        type: 'int',
        value: BigInt(ocrPluginType),
      },
    ])
    const transmittersStack = resultTransmitters.stack
    const transmittersTupleItems = transmittersStack.readLispList()
    const transmitters: Address[] = transmittersTupleItems.map((t: TupleItem) => {
      if (t.type !== 'cell' && t.type !== 'slice' && t.type !== 'builder') {
        throw Error('Not a cell: ' + t.type)
      }
      return t.cell.beginParse().loadAddress()
    })

    const resultSigners = await provider.get('ocr3Signers', [
      {
        type: 'int',
        value: BigInt(ocrPluginType),
      },
    ])
    const signersStack = resultSigners.stack
    const signersTupleItems = signersStack.readLispList()
    const signers: bigint[] = signersTupleItems.map((t: TupleItem) => {
      if (t.type != 'int') {
        throw Error('Not an int: ' + t.type)
      }
      return t.value
    })

    const ocr3Config = {
      configInfo: {
        configDigest: configDigest,
        bigF: bigF,
        n: n,
        isSignatureVerificationEnabled: isSignatureVerificationEnabled,
      },
      signers: signers,
      transmitters: transmitters,
    }
    return ocr3Config
  }
}
