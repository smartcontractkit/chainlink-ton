import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'

import { compile } from '@ton/blueprint'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox'

import { JettonMinter } from '../../../wrappers/jetton/JettonMinter'
import { JettonWallet } from '../../../wrappers/jetton/JettonWallet'

const JETTON_DATA_URI = 'wton.gas'
const WTON_MINT_OPCODE = 0x00000015
const INTERNAL_TRANSFER_OPCODE = 0x178d4519

type ConfiguredGasConstants = {
  GAS_CONSUMPTION_JettonTransfer: number
  GAS_CONSUMPTION_JettonReceive: number
  GAS_CONSUMPTION_BurnRequest: number
  GAS_CONSUMPTION_BurnNotification: number
}

function readConfiguredGasConstants(): ConfiguredGasConstants {
  const feesFile = path.join(__dirname, '../../../contracts/wton/fees-management.tolk')
  const source = fs.readFileSync(feesFile, 'utf8')

  const readConstant = (name: keyof ConfiguredGasConstants) => {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`))
    if (!match) {
      throw new Error(`Missing gas constant ${name} in fees-management.tolk`)
    }
    return Number(match[1])
  }

  return {
    GAS_CONSUMPTION_JettonTransfer: readConstant('GAS_CONSUMPTION_JettonTransfer'),
    GAS_CONSUMPTION_JettonReceive: readConstant('GAS_CONSUMPTION_JettonReceive'),
    GAS_CONSUMPTION_BurnRequest: readConstant('GAS_CONSUMPTION_BurnRequest'),
    GAS_CONSUMPTION_BurnNotification: readConstant('GAS_CONSUMPTION_BurnNotification'),
  }
}

function mintBody({
  destination,
  queryId,
  jettonAmount,
  tonAmount,
  responseDestination,
  forwardTonAmount,
  forwardPayload,
}: {
  destination: Address
  queryId: bigint
  jettonAmount: bigint
  tonAmount: bigint
  responseDestination: Address
  forwardTonAmount: bigint
  forwardPayload: Cell | null
}) {
  const internalTransferMsg = beginCell()
    .storeUint(INTERNAL_TRANSFER_OPCODE, 32)
    .storeUint(queryId, 64)
    .storeCoins(jettonAmount)
    .storeAddress(null)
    .storeAddress(responseDestination)
    .storeCoins(forwardTonAmount)

  if (forwardPayload) {
    internalTransferMsg.storeBit(1).storeRef(forwardPayload)
  } else {
    internalTransferMsg.storeBit(0)
  }

  return beginCell()
    .storeUint(WTON_MINT_OPCODE, 32)
    .storeUint(queryId, 64)
    .storeAddress(destination)
    .storeCoins(tonAmount)
    .storeRef(internalTransferMsg.endCell())
    .endCell()
}

function vmGasUsed(tx: any) {
  if (tx.description.type !== 'generic' || tx.description.computePhase.type !== 'vm') {
    throw new Error('Expected a VM transaction')
  }

  return tx.description.computePhase.gasUsed
}

function internalTxTo(result: { transactions: Array<any> }, destination: Address) {
  const tx = result.transactions.find((candidate) => {
    return (
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest.equals(destination)
    )
  })

  if (!tx) {
    throw new Error(`Missing internal transaction to ${destination.toString()}`)
  }

  return tx
}

describe('wTON gas calibration', () => {
  let blockchain: Blockchain
  let minterCode: Cell
  let walletCode: Cell

  let minter: SandboxContract<JettonMinter>
  let deployer: SandboxContract<TreasuryContract>
  let alice: SandboxContract<TreasuryContract>
  let bob: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let nextQueryId: bigint

  beforeAll(async () => {
    minterCode = await compile('wton.JettonMinter')
    walletCode = await compile('wton.JettonWallet')
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    alice = await blockchain.treasury('alice')
    bob = await blockchain.treasury('bob')
    recipient = await blockchain.treasury('recipient')
    nextQueryId = 1n

    const content = beginCell().storeStringTail(JETTON_DATA_URI).endCell()
    minter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          transferAdmin: null,
          walletCode,
          jettonContent: content,
          totalSupply: 0n,
        },
        minterCode,
      ),
    )

    await minter.sendTopUpTons(deployer.getSender(), toNano('0.01'))
  })

  async function userWallet(owner: Address) {
    return blockchain.openContract(
      JettonWallet.createFromAddress(await minter.getWalletAddress(owner)),
    )
  }

  async function mintTo(
    destination: Address,
    jettonAmount: bigint,
    {
      tonAmount = toNano('0.2'),
      forwardTonAmount = 0n,
      forwardPayload = null,
    }: {
      tonAmount?: bigint
      forwardTonAmount?: bigint
      forwardPayload?: Cell | null
    } = {},
  ) {
    const queryId = nextQueryId++
    const body = mintBody({
      destination,
      queryId,
      jettonAmount,
      tonAmount,
      responseDestination: deployer.address,
      forwardTonAmount,
      forwardPayload,
    })

    return await deployer.send({
      to: minter.address,
      value: jettonAmount + tonAmount + toNano('0.5'),
      body,
    })
  }

  it('keeps fee-management gas constants aligned with measured wallet and minter execution', async () => {
    const configured = readConfiguredGasConstants()
    // Exercise the highest live receive branch: notify recipient owner and still send excesses.
    const transferForwardPayload = beginCell().storeStringTail('wton.gas.forward').endCell()
    const transferCustomPayload = beginCell().storeStringTail('wton.gas.custom').endCell()
    const burnCustomPayload = beginCell().storeStringTail('wton.gas.burn').endCell()
    const mintForwardPayload = beginCell().storeStringTail('wton.gas.mint-forward').endCell()

    const mintResult = await mintTo(alice.address, toNano('1.5'), {
      tonAmount: toNano('0.3'),
      forwardTonAmount: toNano('0.05'),
      forwardPayload: mintForwardPayload,
    })
    const aliceWallet = await userWallet(alice.address)
    const bobWallet = await userWallet(bob.address)

    const transferResult = await aliceWallet.sendTransfer(alice.getSender(), {
      value: toNano('0.8'),
      message: {
        queryId: Number(nextQueryId++),
        jettonAmount: toNano('0.7'),
        destination: bob.address,
        responseDestination: alice.address,
        customPayload: transferCustomPayload,
        forwardTonAmount: toNano('0.05'),
        forwardPayload: transferForwardPayload,
      },
    })

    const burnResult = await bobWallet.sendBurn(bob.getSender(), {
      value: toNano('0.2'),
      message: {
        queryId: nextQueryId++,
        jettonAmount: toNano('0.3'),
        responseDestination: recipient.address,
        customPayload: burnCustomPayload,
      },
    })

    const mintMinterGas = vmGasUsed(internalTxTo(mintResult, minter.address))
    const mintReceiveGas = vmGasUsed(internalTxTo(mintResult, aliceWallet.address))
    const transferSendGas = vmGasUsed(internalTxTo(transferResult, aliceWallet.address))
    const transferReceiveGas = vmGasUsed(internalTxTo(transferResult, bobWallet.address))
    const burnRequestGas = vmGasUsed(internalTxTo(burnResult, bobWallet.address))
    const burnNotificationGas = vmGasUsed(internalTxTo(burnResult, minter.address))
    const maxSendTransferGas = Number(transferSendGas > mintMinterGas ? transferSendGas : mintMinterGas)
    const maxReceiveTransferGas = Number(
      transferReceiveGas > mintReceiveGas ? transferReceiveGas : mintReceiveGas,
    )

    console.table([
      { operation: 'mint minter (worst candidate)', gasUsed: mintMinterGas },
      { operation: 'mint receive (candidate)', gasUsed: mintReceiveGas },
      { operation: 'transfer sender wallet (worst candidate)', gasUsed: transferSendGas },
      { operation: 'transfer receiver wallet (worst candidate)', gasUsed: transferReceiveGas },
      { operation: 'burn sender wallet', gasUsed: burnRequestGas },
      { operation: 'burn minter notification', gasUsed: burnNotificationGas },
    ])

    printTransactionFees(mintResult.transactions)
    printTransactionFees(transferResult.transactions)
    printTransactionFees(burnResult.transactions)

    expect({
      GAS_CONSUMPTION_JettonTransfer: maxSendTransferGas,
      GAS_CONSUMPTION_JettonReceive: maxReceiveTransferGas,
      GAS_CONSUMPTION_BurnRequest: Number(burnRequestGas),
      GAS_CONSUMPTION_BurnNotification: Number(burnNotificationGas),
    }).toEqual(configured)
  })
  })