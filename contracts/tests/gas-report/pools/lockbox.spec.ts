import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Dictionary, beginCell, toNano } from '@ton/core'

import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { WGRAM_MINT_OPCODE } from '../../../wrappers/wgram'
import {
  AccessControl_Data,
  JettonLockBox,
  JettonLockBox_Deposit,
  JettonLockBox_DepositExtra,
} from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployJettonLockBoxHarness } from '../harness'
import { vmGasUsed } from '../token/gas'
import { SendResult, transactionFee } from './gas'

const OPERATOR_ROLE = BigInt(
  '0x' + require('zlib').crc32('OPERATOR_ROLE').toString(16).padStart(8, '0'),
)
const REMOTE_CHAIN_SELECTOR = 91000001n

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

  function depositPayload(amount: bigint, qid: number) {
    return JettonLockBox_Deposit.toCell(
      JettonLockBox_Deposit.create({
        queryId: BigInt(qid),
        token: jettonMinter.address,
        remoteChainSelector: REMOTE_CHAIN_SELECTOR,
        amount,
        context: null,
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
        forwardPayload: depositPayload(payloadAmount, qid),
      },
    })
  }

  it('deposit success fits the on-chain deposit budget', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    const minValue = await costs.getDepositMinValue()
    const result = await deposit(toNano('10'), 1, minValue)
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
  })

  it('deposit failure fits the same deposit budget', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    const minValue = await costs.getDepositMinValue()
    const amount = toNano('10')
    const operatorBalanceBefore = await operatorWallet.getJettonBalance()
    // Amount mismatch forces the custody-return path while keeping the deposit context decodable.
    const result = await deposit(amount, 2, minValue, amount + 1n)
    const tx = findLockboxTx(result, jettonLockBox.address)
    const gas = vmGasUsed(tx)
    const fee = transactionFee(tx)

    console.table([
      {
        operation: 'lockbox deposit failure',
        gasUsed: gas.toString(),
        feeNton: fee.toString(),
        minValueNton: minValue.toString(),
      },
    ])

    expect(gas).toBeLessThanOrEqual(BigInt(await costs.getDepositGasUnits()))
    expect(fee).toBeLessThanOrEqual(minValue)
    // The minimum must also fund the custody return, not just the lockbox transaction fees.
    expect(await operatorWallet.getJettonBalance()).toEqual(operatorBalanceBefore)
  })

  it('withdraw fits the on-chain withdraw budget', async () => {
    const costs = await deployJettonLockBoxHarness(blockchain, deployer)
    await deposit(toNano('10'), 3, await costs.getDepositMinValue())

    const result = await jettonLockBox.sendJettonLockBoxWithdraw(
      operator.getSender(),
      toNano('0.2'),
      {
        queryId: 4n,
        token: jettonMinter.address,
        remoteChainSelector: REMOTE_CHAIN_SELECTOR,
        amount: toNano('1'),
        recipient: recipient.address,
        extra: null,
      },
    )
    const tx = findLockboxTx(result, jettonLockBox.address)
    const gas = vmGasUsed(tx)
    const walletMessage = tx.outMessages
      .values()
      .find(
        (message: any) =>
          message.info.type === 'internal' &&
          message.info.dest instanceof Address &&
          message.info.dest.equals(lockboxWallet.address),
      )
    const fwdFee = walletMessage?.info.forwardFee ?? 0n
    const minValue = await costs.getWithdrawMinValue(0n, fwdFee)

    console.table([
      {
        operation: 'lockbox withdraw',
        gasUsed: gas.toString(),
        feeNton: transactionFee(tx).toString(),
        minValueNton: minValue.toString(),
      },
    ])

    expect(gas).toBeLessThanOrEqual(BigInt(await costs.getWithdrawGasUnits()))
    expect(transactionFee(tx)).toBeLessThanOrEqual(minValue)
  })
})
