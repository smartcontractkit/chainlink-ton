import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core'

import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { WGRAM_MINT_OPCODE } from '../../../wrappers/wgram'
import {
  AccessControl_Data,
  JettonLockBox,
  JettonLockBox_Deposit,
  JettonLockBox_DepositExtra,
  JettonLockBox_Deposited,
  JettonLockBox_Withdraw,
  JettonLockBox_WithdrawExtra,
} from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { AskToTransfer } from '../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployJettonLockBoxHarness } from '../harness'
import { vmGasUsed } from '../token/gas'
import { SendResult, transactionFee } from './gas'

const OPERATOR_ROLE = BigInt(
  '0x' + require('zlib').crc32('OPERATOR_ROLE').toString(16).padStart(8, '0'),
)
const REMOTE_CHAIN_SELECTOR = 91000001n
// A representative non-empty reply context (the CCIP lock context is a cell).
const DEPOSIT_CONTEXT = beginCell()
  .storeUint(0x12345678, 32)
  .storeRef(beginCell().storeUint(0x9abcdef0, 64).endCell())
  .endCell()

// A shallow, wide cell tree: enough cells to make the log fee material.
function makeWideContext(cellCount: number): Cell {
  let layer: Cell[] = []
  for (let i = 0; i < cellCount; i++) {
    layer.push(beginCell().storeUint(i, 32).endCell())
  }
  while (layer.length > 1) {
    const next: Cell[] = []
    for (let i = 0; i < layer.length; i += 4) {
      const builder = beginCell()
      for (let j = 0; j < 4 && i + j < layer.length; j++) builder.storeRef(layer[i + j])
      next.push(builder.endCell())
    }
    layer = next
  }
  return layer[0]
}

function emptyAccessControlData(): AccessControl_Data {
  return {
    $: 'AccessControl_Data',
    roles: Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()) as any,
  }
}

function findLockboxTx(result: SendResult, lockbox: Address) {
  const tx = result.transactions.find(
    (candidate) =>
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest instanceof Address &&
      candidate.inMessage.info.dest.equals(lockbox),
  )
  if (!tx) throw new Error(`missing transaction to lockbox ${lockbox}`)
  return tx
}

describe('JettonLockBox gas calibration', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let operator: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonLockBox: SandboxContract<JettonLockBox>
  let operatorWallet: SandboxContract<JettonWallet>
  let lockboxWallet: SandboxContract<JettonWallet>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = Math.floor(Date.now() / 1000)
    deployer = await blockchain.treasury('deployer')
    operator = await blockchain.treasury('operator')
    recipient = await blockchain.treasury('recipient')

    const walletCode = await contractCode.ccip.local('wgram.JettonWallet')
    const minterCode = await contractCode.ccip.local('wgram.JettonMinter')

    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: null,
          transferAdmin: null,
          walletCode,
          jettonContent: beginCell().storeStringTail('lockbox.gas').endCell(),
          totalSupply: 0n,
        },
        minterCode,
      ),
    )
    await jettonMinter.sendTopUpTons(deployer.getSender(), toNano('0.01'))

    jettonLockBox = blockchain.openContract(
      JettonLockBox.fromStorage(
        {
          id: 1n,
          minterAddress: jettonMinter.address,
          walletAddress: null,
          initializer: deployer.address,
          rbac: emptyAccessControlData(),
        },
        { overrideContractCode: await contractCode.ccip.local('ccip.pool.JettonLockBox') },
      ),
    )
    await jettonLockBox.sendDeploy(deployer.getSender(), toNano('3'))
    await jettonLockBox.sendJettonLockBoxInit(deployer.getSender(), toNano('0.2'), {
      queryId: 1n,
      minterAddress: jettonMinter.address,
      walletAddress: await jettonMinter.getWalletAddress(jettonLockBox.address),
      admin: deployer.address,
    })

    const acClient = blockchain.openContract(
      AccessControlClient.createFromAddress(jettonLockBox.address),
    )
    await acClient.sendGrantRole(deployer.getSender(), toNano('0.1'), {
      queryId: 0n,
      role: OPERATOR_ROLE,
      account: operator.address,
    })

    const mintAmount = toNano('100')
    await jettonMinter.sendMint(deployer.getSender(), {
      value: mintAmount + toNano('1.3'),
      mintOpcode: WGRAM_MINT_OPCODE,
      message: {
        queryId: 0n,
        destination: operator.address,
        tonAmount: toNano('1'),
        jettonAmount: mintAmount,
        from: null,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    operatorWallet = blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(operator.address)),
    )
    lockboxWallet = blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(jettonLockBox.address)),
    )
  })

  function depositPayload(amount: bigint, qid: number, context: Cell | null) {
    return JettonLockBox_Deposit.toCell(
      JettonLockBox_Deposit.create({
        queryId: BigInt(qid),
        token: jettonMinter.address,
        remoteChainSelector: REMOTE_CHAIN_SELECTOR,
        amount,
        context,
        extra: JettonLockBox_DepositExtra.create({
          failureValue: toNano('0.02'),
        }),
      }),
    )
  }

  async function deposit(
    amount: bigint,
    qid: number,
    forwardTonAmount: bigint,
    payloadAmount = amount,
    context: Cell | null = DEPOSIT_CONTEXT,
  ) {
    return operatorWallet.sendTransfer(operator.getSender(), {
      value: toNano('0.5'),
      message: {
        queryId: qid,
        jettonAmount: amount,
        destination: jettonLockBox.address,
        responseDestination: operator.address,
        customPayload: null,
        forwardTonAmount,
        forwardPayload: depositPayload(payloadAmount, qid, context),
      },
    })
  }

  it('deposit success fits the on-chain deposit budget', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    const amount = toNano('10')
    const replyFee = await costs.getDepositReplyFee(2n, amount, DEPOSIT_CONTEXT)
    const minValue = await costs.getDepositMinValue(replyFee)
    const result = await deposit(amount, 2, minValue)
    const tx = findLockboxTx(result, jettonLockBox.address)
    const gas = vmGasUsed(tx)
    const fee = transactionFee(tx)

    console.table([
      {
        operation: 'lockbox deposit success',
        gasUsed: gas.toString(),
        feeNton: fee.toString(),
        minValueNton: minValue.toString(),
      },
    ])

    expect(gas).toBeLessThanOrEqual(BigInt(await costs.getDepositGasUnits()))
    expect(fee).toBeLessThanOrEqual(minValue)
    expect(result.transactions).toHaveTransaction({
      from: jettonLockBox.address,
      to: operator.address,
      op: JettonLockBox_Deposited.PREFIX,
    })
  })

  it('deposit exact minimum covers the event log with a large context', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    const amount = toNano('10')
    const queryId = 6n
    const context = makeWideContext(300)
    const depositCell = depositPayload(amount, Number(queryId), context)
    const replyFee = await costs.getDepositReplyFee(queryId, amount, context)
    const minValue = await costs.getDepositMinValue(replyFee)

    const result = await deposit(amount, Number(queryId), minValue, amount, context)
    const tx = findLockboxTx(result, jettonLockBox.address)
    const gas = vmGasUsed(tx)
    const log = tx.externals.find(
      (message: any) =>
        message.info.type === 'external-out' &&
        message.body.beginParse().preloadUint(32) === JettonLockBox_Deposit.PREFIX,
    )

    console.table([
      {
        operation: 'lockbox deposit large context',
        gasUsed: gas.toString(),
        feeNton: transactionFee(tx).toString(),
        replyFeeNton: replyFee.toString(),
        minValueNton: minValue.toString(),
      },
    ])

    expect(gas).toBeLessThanOrEqual(BigInt(await costs.getDepositGasUnits()))
    expect(result.transactions).toHaveTransaction({
      from: jettonLockBox.address,
      to: operator.address,
      op: JettonLockBox_Deposited.PREFIX,
      success: true,
    })
    expect(log).toBeDefined()
    expect(log!.body.equals(depositCell)).toBe(true)
  })

  it('deposit failure fits the same deposit budget', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    const amount = toNano('10')
    // Amount mismatch forces the failure path while keeping the deposit context decodable.
    const result = await deposit(amount, 4, toNano('0.05'), amount + 1n)
    const tx = findLockboxTx(result, jettonLockBox.address)
    const gas = vmGasUsed(tx)
    const fee = transactionFee(tx)

    console.table([
      {
        operation: 'lockbox deposit failure',
        gasUsed: gas.toString(),
        feeNton: fee.toString(),
      },
    ])

    expect(gas).toBeLessThanOrEqual(BigInt(await costs.getDepositGasUnits()))
    // The min only guarantees the happy path; the failure return is best-effort.
    expect(result.transactions).not.toHaveTransaction({
      from: jettonLockBox.address,
      to: operator.address,
      op: JettonLockBox_Deposited.PREFIX,
    })
  })

  it('withdraw exact minimum delivers jettons and preserves the lockbox balance', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    const amount = toNano('1')
    await deposit(toNano('10'), 5, toNano('0.05'))

    const forwardTonAmount = toNano('0.01')
    const extra = JettonLockBox_WithdrawExtra.create({
      sendExcessesTo: jettonLockBox.address,
      forwardTonAmount,
      forwardPayload: beginCell().storeUint(0x12345678, 32).endCell(),
    })

    const withdraw = JettonLockBox_Withdraw.create({
      queryId: 4n,
      token: jettonMinter.address,
      remoteChainSelector: REMOTE_CHAIN_SELECTOR,
      amount,
      recipient: recipient.address,
      extra,
    })
    // Quote the same forward fee the lockbox computes, then send exactly the resulting minimum.
    const fwdFee = await costs.getWithdrawFwdFee(
      JettonLockBox_Withdraw.toCell(withdraw),
      operator.address,
      lockboxWallet.address,
      jettonLockBox.address,
    )
    const minValue = await costs.getWithdrawMinValue(forwardTonAmount, fwdFee)

    const lockboxBalanceBefore = (await blockchain.getContract(jettonLockBox.address)).balance

    const result = await jettonLockBox.sendJettonLockBoxWithdraw(
      operator.getSender(),
      minValue,
      withdraw,
    )
    const tx = findLockboxTx(result, jettonLockBox.address)
    const gas = vmGasUsed(tx)
    const recipientWallet = blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(recipient.address)),
    )

    console.table([
      {
        operation: 'lockbox withdraw exact minimum',
        gasUsed: gas.toString(),
        feeNton: transactionFee(tx).toString(),
        minValueNton: minValue.toString(),
      },
    ])

    expect(gas).toBeLessThanOrEqual(BigInt(await costs.getWithdrawGasUnits()))
    expect(result.transactions).toHaveTransaction({
      from: operator.address,
      to: jettonLockBox.address,
      op: JettonLockBox_Withdraw.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: jettonLockBox.address,
      to: lockboxWallet.address,
      op: AskToTransfer.PREFIX,
      success: true,
    })
    expect(await recipientWallet.getJettonBalance()).toEqual(amount)
    expect((await blockchain.getContract(jettonLockBox.address)).balance).toBeGreaterThanOrEqual(
      lockboxBalanceBefore,
    )
  })
})
