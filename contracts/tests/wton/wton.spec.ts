import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import {
  JettonMinter,
  MinterOpcodes,
  builder as minterBuilder,
} from '../../wrappers/jetton/JettonMinter'
import { JettonErrorCodes } from '../../wrappers/jetton/constants'
import { JettonWallet, builder as walletBuilder } from '../../wrappers/jetton/JettonWallet'
import {
  ERROR_INVALID_EXCESSES_DESTINATION,
  ERROR_INVALID_RECIPIENT,
  WTON_MINT_OPCODE,
  WTON_WITHDRAW_EXCESS_OPCODE,
} from '../../wrappers/wton'
import * as bouncer from '../../wrappers/test/mock/Bouncer'

const JETTON_DATA_URI = 'wton.test'
const MASTERCHAIN_ZERO_ADDRESS = Address.parse(`-1:${'0'.repeat(64)}`)

type MintOptions = {
  sender?: SandboxContract<TreasuryContract>
  minterContract?: SandboxContract<JettonMinter>
  destination: Address
  jettonAmount?: bigint
  tonAmount?: bigint
  forwardTonAmount?: bigint
  responseDestination?: Address | null
  transferInitiator?: Address | null
  customPayload?: Cell | null
  value?: bigint
}

describe('wTON', () => {
  let blockchain: Blockchain

  let minterCode: Cell
  let walletCode: Cell
  let bouncerCode: Cell

  let minter: SandboxContract<JettonMinter>
  let deployer: SandboxContract<TreasuryContract>
  let alice: SandboxContract<TreasuryContract>
  let bob: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let nextQueryId: bigint

  beforeAll(async () => {
    minterCode = await compile('wton.JettonMinter')
    walletCode = await compile('wton.JettonWallet')
    bouncerCode = await compile('tests.mock.Bouncer')
  })

  async function deployMinter(customWalletCode: Cell = walletCode) {
    const content = beginCell().storeStringTail(JETTON_DATA_URI).endCell()
    const contract = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          // wTON has no admin runtime path; deploy storage matches the get_jetton_data null admin.
          admin: null,
          transferAdmin: null,
          walletCode: customWalletCode,
          jettonContent: content,
          totalSupply: 0n,
        },
        minterCode,
      ),
    )

    const res = await contract.sendTopUpTons(deployer.getSender(), toNano('0.01'))
    expect(res.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    })

    return contract
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    deployer = await blockchain.treasury('deployer')
    alice = await blockchain.treasury('alice')
    bob = await blockchain.treasury('bob')
    recipient = await blockchain.treasury('recipient')

    nextQueryId = 1n
    minter = await deployMinter()
  })

  async function userWallet(owner: Address): Promise<SandboxContract<JettonWallet>> {
    const walletAddr = await minter.getWalletAddress(owner)
    return blockchain.openContract(JettonWallet.createFromAddress(walletAddr))
  }

  async function walletBalance(owner: Address) {
    const wallet = await userWallet(owner)
    return (await wallet.getWalletData()).balance
  }

  async function walletNativeBalance(owner: Address) {
    const wallet = await userWallet(owner)
    return contractBalance(wallet.address)
  }

  async function totalSupply() {
    return (await minter.getJettonData()).totalSupply
  }

  async function sumWalletBalances(owners: Address[]) {
    let total = 0n
    for (const owner of owners) {
      total += await walletBalance(owner)
    }
    return total
  }

  async function contractBalance(address: Address) {
    return (await blockchain.getContract(address)).balance
  }

  async function expectBalanceIncreaseAtLeast(address: Address, before: bigint, minDelta: bigint) {
    const after = await contractBalance(address)
    expect(after - before).toBeGreaterThanOrEqual(minDelta)
  }

  function internalTransactionTo(result: { transactions: Array<any> }, address: Address) {
    const tx = result.transactions.find((candidate) => {
      return (
        candidate.inMessage?.info.type === 'internal' &&
        candidate.inMessage.info.dest.equals(address)
      )
    })

    if (!tx) {
      throw new Error(`Missing internal transaction to ${address.toString()}`)
    }

    return tx
  }

  function internalTransactionFromTo(
    result: { transactions: Array<any> },
    source: Address,
    destination: Address,
  ) {
    const tx = result.transactions.find((candidate) => {
      return (
        candidate.inMessage?.info.type === 'internal' &&
        candidate.inMessage.info.src?.equals(source) &&
        candidate.inMessage.info.dest.equals(destination)
      )
    })

    if (!tx) {
      throw new Error(
        `Missing internal transaction from ${source.toString()} to ${destination.toString()}`,
      )
    }

    return tx
  }

  function internalMessageBodyTo(result: { transactions: Array<any> }, address: Address) {
    const tx = internalTransactionTo(result, address)
    const body = tx.inMessage?.body

    if (!body) {
      throw new Error(`Missing internal message body to ${address.toString()}`)
    }

    return body
  }

  function hasInternalTransactionTo(result: { transactions: Array<any> }, address: Address) {
    return result.transactions.some((candidate) => {
      return (
        candidate.inMessage?.info.type === 'internal' &&
        candidate.inMessage.info.dest.equals(address)
      )
    })
  }

  async function sendMint({
    sender = deployer,
    minterContract = minter,
    destination,
    jettonAmount = toNano('1'),
    tonAmount = toNano('0.2'),
    forwardTonAmount = 0n,
    responseDestination = deployer.address,
    transferInitiator = null,
    customPayload = null,
    value,
  }: MintOptions) {
    const queryId = nextQueryId++
    const result = await minterContract.sendMint(sender.getSender(), {
      value: value ?? jettonAmount + tonAmount + toNano('0.3'),
      mintOpcode: WTON_MINT_OPCODE,
      message: {
        queryId,
        destination,
        tonAmount,
        jettonAmount,
        from: transferInitiator,
        responseDestination,
        forwardTonAmount,
        customPayload,
      },
    })

    return { queryId, result }
  }

  async function mintTo(destination: Address, options: Omit<MintOptions, 'destination'> = {}) {
    const sender = options.sender ?? deployer
    const { result } = await sendMint({ destination, ...options, sender })

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: minter.address,
      success: true,
    })

    return result
  }

  async function deployRejector() {
    const rejector = blockchain.openContract(bouncer.ContractClient.createFromConfig(bouncerCode))
    await rejector.sendDeploy(deployer.getSender(), toNano('0.05'))
    return rejector
  }

  async function transferFrom(
    owner: SandboxContract<TreasuryContract>,
    {
      jettonAmount,
      destination,
      responseDestination = owner.address,
      value = toNano('0.5'),
      forwardTonAmount = 0n,
    }: {
      jettonAmount: bigint
      destination: Address
      responseDestination?: Address | null
      value?: bigint
      forwardTonAmount?: bigint
    },
  ) {
    const wallet = await userWallet(owner.address)
    const result = await wallet.sendTransfer(owner.getSender(), {
      value,
      message: {
        queryId: Number(nextQueryId++),
        jettonAmount,
        destination,
        responseDestination,
        customPayload: null,
        forwardTonAmount,
        forwardPayload: null,
      },
    })

    return { wallet, result }
  }

  async function burnFrom(
    owner: SandboxContract<TreasuryContract>,
    {
      jettonAmount,
      responseDestination,
      value = toNano('0.2'),
    }: {
      jettonAmount: bigint
      responseDestination: Address | null
      value?: bigint
    },
  ) {
    const wallet = await userWallet(owner.address)
    const result = await wallet.sendBurn(owner.getSender(), {
      value,
      message: {
        queryId: nextQueryId++,
        jettonAmount,
        responseDestination,
        customPayload: null,
      },
    })

    return { wallet, result }
  }

  async function withdrawExcessFrom(
    owner: SandboxContract<TreasuryContract>,
    {
      sendExcessesTo,
      value = toNano('0.05'),
    }: {
      sendExcessesTo: Address
      value?: bigint
    },
  ) {
    const wallet = await userWallet(owner.address)
    const result = await wallet.sendWithdrawExcess(owner.getSender(), {
      value,
      opcode: WTON_WITHDRAW_EXCESS_OPCODE,
      message: {
        queryId: nextQueryId++,
        sendExcessesTo,
      },
    })

    return { wallet, result }
  }

  describe('basic e2e', () => {
    it('deploys and exposes basic jetton data', async () => {
      const data = await minter.getJettonData()

      expect(data.totalSupply).toEqual(0n)
      expect(data.mintable).toBe(true)
      expect(data.admin).toBeNull()
      expect(data.jettonWalletCode.equals(walletCode)).toBe(true)
    })

    it('deploys with admin and transferAdmin set to null in raw storage', async () => {
      const contract = await blockchain.getContract(minter.address)
      const accountState = contract.accountState
      expect(accountState?.type).toEqual('active')
      if (accountState?.type !== 'active') {
        throw new Error('Minter account is not active')
      }
      const dataCell = accountState.state.data
      expect(dataCell).toBeDefined()
      const storage = minterBuilder.data.contractData.load(dataCell!.beginParse())
      expect(storage.admin).toBeNull()
      expect(storage.transferAdmin).toBeNull()
    })

    it('completes a mint-transfer-burn lifecycle', async () => {
      const minted = toNano('2')
      const transferred = toNano('0.75')
      const burned = toNano('0.5')
      const recipientBalanceBefore = await contractBalance(recipient.address)

      await mintTo(alice.address, { jettonAmount: minted })

      const aliceWallet = await userWallet(alice.address)
      const bobWallet = await userWallet(bob.address)
      await aliceWallet.sendTransfer(alice.getSender(), {
        value: toNano('0.5'),
        message: {
          queryId: Number(nextQueryId++),
          jettonAmount: transferred,
          destination: bob.address,
          responseDestination: alice.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })

      await bobWallet.sendBurn(bob.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: nextQueryId++,
          jettonAmount: burned,
          responseDestination: recipient.address,
          customPayload: null,
        },
      })

      expect(await walletBalance(alice.address)).toEqual(minted - transferred)
      expect(await walletBalance(bob.address)).toEqual(transferred - burned)
      expect((await minter.getJettonData()).totalSupply).toEqual(minted - burned)
      await expectBalanceIncreaseAtLeast(recipient.address, recipientBalanceBefore, burned)
    })

    it('accepts direct top-ups on both minter and wallet', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)
      const minterBalanceBefore = await contractBalance(minter.address)
      const walletBalanceBefore = await contractBalance(aliceWallet.address)

      const minterTopUp = await minter.sendTopUpTons(deployer.getSender(), toNano('1'))
      expect(minterTopUp.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: true,
      })

      const walletTopUp = await aliceWallet.sendTopUpTons(alice.getSender(), toNano('1'))
      expect(walletTopUp.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: true,
      })

      expect(await contractBalance(minter.address)).toBeGreaterThan(minterBalanceBefore)
      expect(await contractBalance(aliceWallet.address)).toBeGreaterThan(walletBalanceBefore)
    })

    it('keeps wallet addresses stable before and after first deployment', async () => {
      const predictedAliceWallet = await minter.getWalletAddress(alice.address)
      const predictedBobWallet = await minter.getWalletAddress(bob.address)

      await mintTo(alice.address, { jettonAmount: toNano('1') })
      await mintTo(bob.address, { jettonAmount: toNano('0.5') })

      expect((await userWallet(alice.address)).address.equals(predictedAliceWallet)).toBe(true)
      expect((await userWallet(bob.address)).address.equals(predictedBobWallet)).toBe(true)
    })

    it('responds to wallet-address requests and can include the owner address', async () => {
      const queryId = nextQueryId++
      const result = await deployer.send({
        to: minter.address,
        value: toNano('0.05'),
        body: minterBuilder.messages.in.requestWalletAddress
          .encode({
            queryId,
            ownerAddress: alice.address,
            includeOwnerAddress: true,
          })
          .asCell(),
      })

      expect(result.transactions).toHaveTransaction({
        from: minter.address,
        to: deployer.address,
        success: true,
      })

      const body = internalMessageBodyTo(result, deployer.address).beginParse()
      expect(body.loadUint(32)).toEqual(MinterOpcodes.TAKE_WALLET_ADDRESS)
      expect(body.loadUintBig(64)).toEqual(queryId)

      const walletAddress = body.loadMaybeAddress()
      expect(walletAddress?.equals(await minter.getWalletAddress(alice.address))).toBe(true)

      expect(body.loadBit()).toBe(true)
      expect(body.loadRef().beginParse().loadAddress().equals(alice.address)).toBe(true)
      expect(body.remainingBits).toEqual(0)
      expect(body.remainingRefs).toEqual(0)
    })

    it('returns a null wallet address for non-basechain owners while preserving the echoed owner', async () => {
      const queryId = nextQueryId++
      const result = await deployer.send({
        to: minter.address,
        value: toNano('0.05'),
        body: minterBuilder.messages.in.requestWalletAddress
          .encode({
            queryId,
            ownerAddress: MASTERCHAIN_ZERO_ADDRESS,
            includeOwnerAddress: true,
          })
          .asCell(),
      })

      expect(result.transactions).toHaveTransaction({
        from: minter.address,
        to: deployer.address,
        success: true,
      })

      const body = internalMessageBodyTo(result, deployer.address).beginParse()
      expect(body.loadUint(32)).toEqual(MinterOpcodes.TAKE_WALLET_ADDRESS)
      expect(body.loadUintBig(64)).toEqual(queryId)
      expect(body.loadMaybeAddress()).toBeNull()
      expect(body.loadBit()).toBe(true)
      expect(body.loadRef().beginParse().loadAddress().equals(MASTERCHAIN_ZERO_ADDRESS)).toBe(true)
      expect(body.remainingBits).toEqual(0)
      expect(body.remainingRefs).toEqual(0)
    })

    it('keeps total supply equal to the sum of live wallet balances after mixed operations', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1.2') })
      await mintTo(bob.address, { jettonAmount: toNano('0.8') })

      await burnFrom(alice, {
        jettonAmount: toNano('0.3'),
        responseDestination: recipient.address,
      })

      expect(await totalSupply()).toEqual(await sumWalletBalances([alice.address, bob.address]))
    })
  })

  describe('minting', () => {
    it('mints wTON into a backed wallet', async () => {
      const mintAmount = toNano('1')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const walletData = await aliceWallet.getWalletData()
      const walletBalance = await walletNativeBalance(alice.address)
      const minterData = await minter.getJettonData()

      expect(walletData.balance).toEqual(mintAmount)
      expect(minterData.totalSupply).toEqual(mintAmount)
      expect(walletBalance).toBeGreaterThanOrEqual(mintAmount)
    })

    it('rejects mint messages without a refund destination', async () => {
      const mintAmount = toNano('1')
      const { result } = await sendMint({
        destination: alice.address,
        jettonAmount: mintAmount,
        responseDestination: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: ERROR_INVALID_EXCESSES_DESTINATION,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rejects mint messages to non-basechain recipients', async () => {
      const { result } = await sendMint({
        destination: MASTERCHAIN_ZERO_ADDRESS,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.WRONG_WORKCHAIN,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rejects mint messages with non-basechain refund destinations', async () => {
      const { result } = await sendMint({
        destination: alice.address,
        responseDestination: MASTERCHAIN_ZERO_ADDRESS,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.WRONG_WORKCHAIN,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rejects mint messages whose recipient is the minter itself', async () => {
      const { result } = await sendMint({
        destination: minter.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: ERROR_INVALID_RECIPIENT,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rejects mint messages whose refund destination is the minter itself', async () => {
      const { result } = await sendMint({
        destination: alice.address,
        responseDestination: minter.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: ERROR_INVALID_RECIPIENT,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rejects mint messages that spoof a transfer initiator', async () => {
      const { result } = await sendMint({
        destination: alice.address,
        transferInitiator: alice.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.INVALID_OP,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rolls supply back and best-effort refunds the caller when mint deployment bounces', async () => {
      const rejector = await deployRejector()
      const mintAmount = toNano('1')
      await sendMint({
        destination: rejector.address,
        jettonAmount: mintAmount,
        responseDestination: rejector.address, // refund
      })

      const rejectorWallet = await userWallet(rejector.address)
      const rejectorWalletContract = await blockchain.getContract(rejectorWallet.address)
      rejectorWalletContract.balance = 0n // Put wallet in debt to trigger the mint bounce
      const rejectorBalanceBefore = await contractBalance(rejector.address)

      const { result } = await sendMint({
        destination: rejector.address,
        jettonAmount: mintAmount,
        responseDestination: rejector.address, // refund
      })

      // mint transfer notification bounce
      expect(result.transactions).toHaveTransaction({
        from: minter.address,
        to: rejectorWallet.address,
        success: false,
      })

      // mint-bounce flow
      expect(result.transactions).toHaveTransaction({
        from: minter.address,
        to: rejector.address,
        success: false,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(mintAmount) // first mint

      const mintRefundBalance = await contractBalance(rejector.address)
      expect(mintRefundBalance).toBeGreaterThan(rejectorBalanceBefore) // best-effort refund still deposits on a throwing destination
    })

    it('refunds bounced mint dispatches even for dust principal near the transfer-budget floor', async () => {
      const rejector = await deployRejector()
      const setupMintAmount = toNano('1')

      await sendMint({
        destination: rejector.address,
        jettonAmount: setupMintAmount,
        responseDestination: rejector.address,
      })

      const rejectorWallet = await userWallet(rejector.address)
      const rejectorWalletContract = await blockchain.getContract(rejectorWallet.address)
      rejectorWalletContract.balance = 0n

      const dustMintAmount = toNano('0.000001')

      async function dispatchesAt(tonAmount: bigint) {
        const { result } = await sendMint({
          destination: rejector.address,
          jettonAmount: dustMintAmount,
          tonAmount,
          responseDestination: rejector.address,
        })

        return hasInternalTransactionTo(result, rejectorWallet.address)
      }

      // Finding fix: derive the first dispatching dust amount from the live fee model
      // instead of pinning the regression to a stale magic boundary literal.
      let lowerBound = 1n
      let upperBound = toNano('0.05')

      expect(await dispatchesAt(upperBound)).toBe(true)

      while (lowerBound + 1n < upperBound) {
        const candidate = lowerBound + (upperBound - lowerBound) / 2n
        if (await dispatchesAt(candidate)) {
          upperBound = candidate
        } else {
          lowerBound = candidate
        }
      }

      const dustTonAmount = upperBound
      rejectorWalletContract.balance = 0n
      const refundBalanceBefore = await contractBalance(rejector.address)

      const { result } = await sendMint({
        destination: rejector.address,
        jettonAmount: dustMintAmount,
        tonAmount: dustTonAmount,
        responseDestination: rejector.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: minter.address,
        to: rejectorWallet.address,
        success: false,
      })
      expect(result.transactions).toHaveTransaction({
        from: minter.address,
        to: rejector.address,
        success: false,
      })
      expect(await walletBalance(rejector.address)).toEqual(setupMintAmount)
      expect((await minter.getJettonData()).totalSupply).toEqual(setupMintAmount)
      expect(await contractBalance(rejector.address)).toBeGreaterThan(refundBalanceBefore)
    })

    it('accumulates repeated mints into the same wallet', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1.25') })
      await mintTo(alice.address, { jettonAmount: toNano('0.75') })

      expect(await walletBalance(alice.address)).toEqual(toNano('2'))
      expect(await totalSupply()).toEqual(toNano('2'))
    })

    it('can mint with forwarded TON to the recipient owner', async () => {
      const mintAmount = toNano('1')
      const forwardTonAmount = toNano('0.05')
      const bobBalanceBefore = await contractBalance(bob.address)

      const mintResult = await mintTo(bob.address, {
        jettonAmount: mintAmount,
        tonAmount: toNano('0.4'),
        forwardTonAmount,
      })

      expect(await walletBalance(bob.address)).toEqual(mintAmount)
      const bobReceiveTx = internalTransactionTo(mintResult, bob.address)
      const bobBalanceAfter = await contractBalance(bob.address)
      const delta = bobBalanceAfter - bobBalanceBefore
      expect(delta).toEqual(forwardTonAmount - bobReceiveTx.totalFees.coins)
    })

    it('rejects underfunded mint principal', async () => {
      const jettonAmount = toNano('1')
      const tonAmount = toNano('0.2')
      const { result } = await sendMint({
        destination: alice.address,
        jettonAmount,
        tonAmount,
        value: jettonAmount + tonAmount - 1n,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_ENOUGH_GAS,
      })
      expect(await totalSupply()).toEqual(0n)
    })

    it('rejects mint calls that leave no room for the minter dispatch fee', async () => {
      const jettonAmount = toNano('1')
      const tonAmount = toNano('0.2')
      await minter.sendTopUpTons(deployer.getSender(), toNano('0.01'))

      const { result } = await sendMint({
        destination: alice.address,
        jettonAmount,
        tonAmount,
        value: jettonAmount + tonAmount,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_ENOUGH_GAS,
      })
      expect(await totalSupply()).toEqual(0n)
    })

    it('rejects underfunded mint transfer budget when forwarding TON', async () => {
      const { result } = await sendMint({
        destination: alice.address,
        jettonAmount: toNano('1'),
        tonAmount: 1n,
        forwardTonAmount: toNano('0.05'),
        value: toNano('1.1'),
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_ENOUGH_GAS,
      })
      expect(await totalSupply()).toEqual(0n)
    })

    it('rejects malformed internal transfer payloads', async () => {
      const body = beginCell()
        .storeUint(WTON_MINT_OPCODE, 32)
        .storeUint(nextQueryId++, 64)
        .storeAddress(alice.address)
        .storeCoins(toNano('0.2'))
        .storeRef(beginCell().storeUint(0x12345678, 32).endCell())
        .endCell()

      const result = await deployer.send({
        to: minter.address,
        value: toNano('1.5'),
        body,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.INVALID_OP,
      })
      expect(await totalSupply()).toEqual(0n)
    })

    it('rejects metadata changes because wTON has no admin opcode surface', async () => {
      const dataBefore = await minter.getJettonData()
      const result = await minter.sendChangeContent(deployer.getSender(), {
        message: {
          queryId: nextQueryId++,
          content: beginCell().storeStringTail('wton.changed').endCell(),
        },
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.WRONG_OP,
      })
      expect((await minter.getJettonData()).jettonContent.equals(dataBefore.jettonContent)).toBe(
        true,
      )
    })
  })

  describe('transferring', () => {
    it('transfers wTON between wallets', async () => {
      const mintAmount = toNano('2')
      const transferAmount = toNano('0.75')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const bobWallet = await userWallet(bob.address)

      const transferResult = await aliceWallet.sendTransfer(alice.getSender(), {
        value: toNano('0.5'),
        message: {
          queryId: Number(nextQueryId++),
          jettonAmount: transferAmount,
          destination: bob.address,
          responseDestination: alice.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })

      expect(transferResult.transactions).toHaveTransaction({
        from: aliceWallet.address,
        to: bobWallet.address,
        success: true,
      })
      expect(await walletBalance(alice.address)).toEqual(mintAmount - transferAmount)
      expect(await walletBalance(bob.address)).toEqual(transferAmount)
      expect(await walletNativeBalance(bob.address)).toBeGreaterThanOrEqual(transferAmount)
    })

    it('forwards TON to the recipient owner when requested', async () => {
      const transferAmount = toNano('0.4')
      const forwardTonAmount = toNano('0.05')
      await mintTo(alice.address, { jettonAmount: toNano('1.5') })

      const aliceWallet = await userWallet(alice.address)
      const bobBalanceBefore = await contractBalance(bob.address)

      const transferResult = await aliceWallet.sendTransfer(alice.getSender(), {
        value: toNano('0.7'),
        message: {
          queryId: Number(nextQueryId++),
          jettonAmount: transferAmount,
          destination: bob.address,
          responseDestination: alice.address,
          customPayload: null,
          forwardTonAmount,
          forwardPayload: null,
        },
      })

      expect(transferResult.transactions).toHaveTransaction({
        from: aliceWallet.address,
        success: true,
      })
      expect(await walletBalance(bob.address)).toEqual(transferAmount)
      expect(await walletNativeBalance(bob.address)).toBeGreaterThanOrEqual(transferAmount)

      const bobReceiveTx = internalTransactionTo(transferResult, bob.address)
      const bobBalanceAfter = await contractBalance(bob.address)
      expect(bobBalanceAfter - bobBalanceBefore).toEqual(
        forwardTonAmount - bobReceiveTx.totalFees.coins,
      )
    })

    it('rejects transfers to non-basechain recipients', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })

      const aliceWallet = await userWallet(alice.address)
      const transferResult = await aliceWallet.sendTransfer(alice.getSender(), {
        value: toNano('0.5'),
        message: {
          queryId: Number(nextQueryId++),
          jettonAmount: toNano('0.25'),
          destination: MASTERCHAIN_ZERO_ADDRESS,
          responseDestination: alice.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })

      expect(transferResult.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
        exitCode: JettonErrorCodes.WRONG_WORKCHAIN,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
      expect(await totalSupply()).toEqual(toNano('1'))
    })

    it('rejects transfers from non-owners', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })

      const aliceWallet = await userWallet(alice.address)
      const transferResult = await aliceWallet.sendTransfer(deployer.getSender(), {
        value: toNano('0.5'),
        message: {
          queryId: Number(nextQueryId++),
          jettonAmount: toNano('0.25'),
          destination: bob.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })

      expect(transferResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: aliceWallet.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_OWNER,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
    })

    it('rejects forged internal transfer senders', async () => {
      const bobMint = toNano('0.5')
      await mintTo(bob.address, { jettonAmount: bobMint })

      const bobWallet = await userWallet(bob.address)
      const forgedTransfer = walletBuilder.messages.out.internalTransferStep
        .encode({
          queryId: nextQueryId++,
          jettonAmount: toNano('0.1'),
          transferInitiator: alice.address,
          responseDestination: deployer.address,
          forwardPayload: null,
        })
        .asCell()

      const forgedResult = await deployer.send({
        to: bobWallet.address,
        value: toNano('0.2'),
        body: forgedTransfer,
      })

      expect(forgedResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: bobWallet.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_VALID_WALLET,
      })
      expect(await walletBalance(bob.address)).toEqual(bobMint)
    })

    it('rejects malformed forged internal transfers with a null initiator', async () => {
      const bobMint = toNano('0.5')
      await mintTo(bob.address, { jettonAmount: bobMint })

      const bobWallet = await userWallet(bob.address)
      const forgedTransfer = walletBuilder.messages.out.internalTransferStep
        .encode({
          queryId: nextQueryId++,
          jettonAmount: toNano('0.1'),
          transferInitiator: null,
          responseDestination: deployer.address,
          forwardPayload: null,
        })
        .asCell()

      const forgedResult = await deployer.send({
        to: bobWallet.address,
        value: toNano('0.2'),
        body: forgedTransfer,
      })

      expect(forgedResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: bobWallet.address,
        success: false,
      })
      expect(await walletBalance(bob.address)).toEqual(bobMint)
    })

    it('supports transfers without a response destination', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })

      const { result } = await transferFrom(alice, {
        jettonAmount: toNano('0.25'),
        destination: bob.address,
        responseDestination: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        success: true,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('0.75'))
      expect(await walletBalance(bob.address)).toEqual(toNano('0.25'))
    })

    it('rejects transfers that exceed wallet balance', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('0.2') })

      const { result } = await transferFrom(alice, {
        jettonAmount: toNano('0.25'),
        destination: bob.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: (await userWallet(alice.address)).address,
        success: false,
        exitCode: JettonErrorCodes.BALANCE_ERROR,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('0.2'))
      expect(await totalSupply()).toEqual(toNano('0.2'))
    })

    it('rejects underfunded transfer value before moving balance', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)

      const { result } = await transferFrom(alice, {
        jettonAmount: toNano('0.25'),
        destination: bob.address,
        value: 1n,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
      expect(await totalSupply()).toEqual(toNano('1'))
    })

    it('still rejects underfunded transfers after wallet top-ups', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)
      await aliceWallet.sendTopUpTons(deployer.getSender(), toNano('5'))

      const { result } = await transferFrom(alice, {
        jettonAmount: toNano('0.25'),
        destination: bob.address,
        value: 1n,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
      expect(await totalSupply()).toEqual(toNano('1'))
    })

    it('restores the sender balance when the destination wallet receive path bounces', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1.2') })
      await mintTo(bob.address, { jettonAmount: toNano('1') })

      const aliceWallet = await userWallet(alice.address)
      const bobWallet = await userWallet(bob.address)
      const aliceBalanceBefore = await walletBalance(alice.address)
      const bobBalanceBefore = await walletBalance(bob.address)
      const supplyBefore = await totalSupply()

      const contract = await blockchain.getContract(bobWallet.address)
      contract.balance = 0n

      const { result } = await transferFrom(alice, {
        jettonAmount: toNano('0.3'),
        destination: bob.address,
        value: toNano('0.5'),
      })

      expect(result.transactions).toHaveTransaction({
        from: aliceWallet.address,
        to: bobWallet.address,
        success: false,
      })
      expect(await walletBalance(alice.address)).toEqual(aliceBalanceBefore)
      expect(await walletBalance(bob.address)).toEqual(bobBalanceBefore)
      expect(await totalSupply()).toEqual(supplyBefore)
    })

    it('preserves total supply across chained transfers', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('2.5') })

      await transferFrom(alice, {
        jettonAmount: toNano('1'),
        destination: bob.address,
      })
      await transferFrom(bob, {
        jettonAmount: toNano('0.4'),
        destination: recipient.address,
      })

      expect(await totalSupply()).toEqual(
        await sumWalletBalances([alice.address, bob.address, recipient.address]),
      )
    })
  })

  describe('burning', () => {
    it('owner can withdraw wallet surplus to a chosen basechain address', async () => {
      const minted = toNano('1')
      await mintTo(alice.address, { jettonAmount: minted })

      const aliceWallet = await userWallet(alice.address)
      await aliceWallet.sendTopUpTons(alice.getSender(), toNano('5'))

      const walletJettonsBefore = await walletBalance(alice.address)
      const walletNativeBefore = await walletNativeBalance(alice.address)
      const recipientBefore = await contractBalance(recipient.address)

      const { result } = await withdrawExcessFrom(alice, {
        sendExcessesTo: recipient.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: true,
      })

      expect(await walletBalance(alice.address)).toEqual(walletJettonsBefore)
      expect(await totalSupply()).toEqual(walletJettonsBefore)
      expect((await contractBalance(recipient.address)) - recipientBefore).toBeGreaterThan(
        toNano('4'),
      )
      expect(await walletNativeBalance(alice.address)).toBeLessThan(walletNativeBefore)
      expect(await walletNativeBalance(alice.address)).toBeGreaterThanOrEqual(minted)
    })

    it('rejects excess withdrawals from non-owners', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)

      const result = await aliceWallet.sendWithdrawExcess(deployer.getSender(), {
        value: toNano('0.05'),
        opcode: WTON_WITHDRAW_EXCESS_OPCODE,
        message: {
          queryId: nextQueryId++,
          sendExcessesTo: recipient.address,
        },
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: aliceWallet.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_OWNER,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
      expect(await totalSupply()).toEqual(toNano('1'))
    })

    it('rejects burns without a refund destination', async () => {
      const mintAmount = toNano('1')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const burnResult = await aliceWallet.sendBurn(alice.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: nextQueryId++,
          jettonAmount: mintAmount,
          responseDestination: null,
          customPayload: null,
        },
      })

      expect(burnResult.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
        exitCode: ERROR_INVALID_EXCESSES_DESTINATION,
      })
      expect(await walletBalance(alice.address)).toEqual(mintAmount)
      expect((await minter.getJettonData()).totalSupply).toEqual(mintAmount)
    })

    it('rejects burns to non-basechain payout destinations', async () => {
      const mintAmount = toNano('1')
      const masterchainRecipient = Address.parse(`-1:${'0'.repeat(64)}`)
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const burnResult = await aliceWallet.sendBurn(alice.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: nextQueryId++,
          jettonAmount: mintAmount,
          responseDestination: masterchainRecipient,
          customPayload: null,
        },
      })

      expect(burnResult.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
        exitCode: JettonErrorCodes.WRONG_WORKCHAIN,
      })
      expect(await walletBalance(alice.address)).toEqual(mintAmount)
      expect((await minter.getJettonData()).totalSupply).toEqual(mintAmount)
    })

    it('rejects burns from non-owners', async () => {
      const mintAmount = toNano('1')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const burnResult = await aliceWallet.sendBurn(deployer.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: nextQueryId++,
          jettonAmount: mintAmount,
          responseDestination: recipient.address,
          customPayload: null,
        },
      })

      expect(burnResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: aliceWallet.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_OWNER,
      })
      expect(await walletBalance(alice.address)).toEqual(mintAmount)
    })

    it('burns wTON and pays the nominated recipient', async () => {
      const mintAmount = toNano('1')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const recipientBalanceBefore = await contractBalance(recipient.address)

      const burnResult = await aliceWallet.sendBurn(alice.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: nextQueryId++,
          jettonAmount: mintAmount,
          responseDestination: recipient.address,
          customPayload: null,
        },
      })

      expect(burnResult.transactions).toHaveTransaction({
        from: aliceWallet.address,
        to: minter.address,
        success: true,
      })
      expect(await walletBalance(alice.address)).toEqual(0n)
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
      await expectBalanceIncreaseAtLeast(recipient.address, recipientBalanceBefore, mintAmount)
    })

    it('keeps burn payout at a throwing destination because withdrawal is non-bounceable', async () => {
      const mintAmount = toNano('1')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const rejector = await deployRejector()
      const rejectorBalanceBefore = await contractBalance(rejector.address)

      const burnResult = await aliceWallet.sendBurn(alice.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: nextQueryId++,
          jettonAmount: mintAmount,
          responseDestination: rejector.address,
          customPayload: null,
        },
      })

      expect(burnResult.transactions).toHaveTransaction({
        from: minter.address,
        to: rejector.address,
        success: false,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
      expect(await walletBalance(alice.address)).toEqual(0n)
      await expectBalanceIncreaseAtLeast(rejector.address, rejectorBalanceBefore, mintAmount)
    })

    it('rejects forged burn notifications sent directly to the minter', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })

      const forgedBurn = walletBuilder.messages.out.burnNotificationForMinter
        .encode({
          queryId: nextQueryId++,
          jettonAmount: toNano('0.5'),
          burnInitiator: alice.address,
          responseDestination: recipient.address,
        })
        .asCell()

      const forgedResult = await deployer.send({
        to: minter.address,
        value: toNano('0.1'),
        body: forgedBurn,
      })

      expect(forgedResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: JettonErrorCodes.NOT_VALID_WALLET,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(toNano('1'))
    })

    it('supports partial burns and keeps the remainder spendable', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1.5') })

      await burnFrom(alice, {
        jettonAmount: toNano('0.4'),
        responseDestination: recipient.address,
      })
      await transferFrom(alice, {
        jettonAmount: toNano('0.3'),
        destination: bob.address,
      })

      expect(await walletBalance(alice.address)).toEqual(toNano('0.8'))
      expect(await walletBalance(bob.address)).toEqual(toNano('0.3'))
      expect(await totalSupply()).toEqual(toNano('1.1'))
    })

    it('rejects burns that exceed wallet balance', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('0.4') })

      const { result } = await burnFrom(alice, {
        jettonAmount: toNano('0.5'),
        responseDestination: recipient.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: (await userWallet(alice.address)).address,
        success: false,
        exitCode: JettonErrorCodes.BALANCE_ERROR,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('0.4'))
      expect(await totalSupply()).toEqual(toNano('0.4'))
    })

    it('rejects underfunded burn value before moving balance', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)

      const { result } = await burnFrom(alice, {
        jettonAmount: toNano('0.25'),
        responseDestination: recipient.address,
        value: 1n,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
      expect(await totalSupply()).toEqual(toNano('1'))
    })

    it('still rejects underfunded burns after wallet top-ups', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)
      await aliceWallet.sendTopUpTons(deployer.getSender(), toNano('5'))

      const { result } = await burnFrom(alice, {
        jettonAmount: toNano('0.25'),
        responseDestination: recipient.address,
        value: 1n,
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: false,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
      expect(await totalSupply()).toEqual(toNano('1'))
    })

    it('restores wallet balance when burn notification bounces at the minter', async () => {
      const minted = toNano('1')
      await mintTo(alice.address, { jettonAmount: minted })

      const aliceWallet = await userWallet(alice.address)
      const minterContract = await blockchain.getContract(minter.address)
      minterContract.balance = 0n

      // Tiny inbound: post-msg balance (~0.005 TON) is below the minter rent reserve (~0.01 TON),
      // so the action-phase failure that triggers the bounce is RAWRESERVE, not the send action.
      const { result } = await burnFrom(alice, {
        jettonAmount: 1n,
        responseDestination: recipient.address,
        value: toNano('0.01'),
      })

      expect(result.transactions).toHaveTransaction({
        from: aliceWallet.address,
        to: minter.address,
        success: false,
      })

      const bounceTx = result.transactions.find(
        (tx: any) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.src?.equals(minter.address) &&
          tx.inMessage.info.dest.equals(aliceWallet.address),
      )

      expect(bounceTx).toBeDefined()
      expect(await walletBalance(alice.address)).toEqual(minted)
      expect(await totalSupply()).toEqual(minted)
    })

    it('restores wallet balance when the minter payout fails at the send action specifically', async () => {
      const minted = toNano('2')
      await mintTo(alice.address, { jettonAmount: minted })

      const aliceWallet = await userWallet(alice.address)
      const minterContract = await blockchain.getContract(minter.address)
      const recipientBalanceBefore = await contractBalance(recipient.address)
      // Drop the minter balance to zero so the contract has no own funds, but burn the full
      // backing so the wallet's CARRY_ALL_BALANCE notification arrives with ~2 TON of inbound.
      // Post-msg balance now far exceeds requiredMinterReserve, so RAWRESERVE succeeds.
      // The subsequent SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE wants to forward the entire
      // inbound — which would push the contract balance below the just-set reserve floor — so
      // BOUNCE_ON_ACTION_FAIL triggers on the *send* action rather than RAWRESERVE.
      minterContract.balance = 0n

      const { result } = await burnFrom(alice, {
        jettonAmount: minted,
        responseDestination: recipient.address,
        value: toNano('0.2'),
      })

      // Compute phase on the minter succeeded; the bounce comes from BOUNCE_ON_ACTION_FAIL.
      expect(result.transactions).toHaveTransaction({
        from: aliceWallet.address,
        to: minter.address,
        success: false,
      })

      const bounceTx = result.transactions.find(
        (tx: any) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.src?.equals(minter.address) &&
          tx.inMessage.info.dest.equals(aliceWallet.address),
      )
      expect(bounceTx).toBeDefined()

      // No payout reached the nominated recipient because the send action never executed.
      expect(await contractBalance(recipient.address)).toEqual(recipientBalanceBefore)

      // The wallet's onBouncedMessage restored the burned principal, and the minter's compute-phase
      // totalSupply decrement was reverted along with the failed transaction.
      expect(await walletBalance(alice.address)).toEqual(minted)
      expect(await totalSupply()).toEqual(minted)
    })

    it('keeps total supply equal to the sum of balances after sequential burns', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1.5') })
      await mintTo(bob.address, { jettonAmount: toNano('0.7') })

      await burnFrom(alice, {
        jettonAmount: toNano('0.4'),
        responseDestination: recipient.address,
      })
      await burnFrom(bob, {
        jettonAmount: toNano('0.2'),
        responseDestination: recipient.address,
      })

      expect(await totalSupply()).toEqual(await sumWalletBalances([alice.address, bob.address]))
    })

    it('rejects fee-boundary burns unless the payout reaching the recipient still covers the full burned principal', async () => {
      const burnAmount = 1n
      await mintTo(alice.address, { jettonAmount: toNano('1') })

      const snapshot = blockchain.snapshot()
      const candidateValues = ['0.0045', '0.0047', '0.005', '0.006']

      for (const value of candidateValues) {
        await blockchain.loadFrom(snapshot)

        const recipientBalanceBefore = await contractBalance(recipient.address)
        const { result } = await burnFrom(alice, {
          jettonAmount: burnAmount,
          responseDestination: recipient.address,
          value: toNano(value),
        })

        const reachedMinter = result.transactions.some(
          (tx) =>
            tx.inMessage?.info.type === 'internal' && tx.inMessage.info.dest.equals(minter.address),
        )

        if (!reachedMinter) {
          continue
        }

        const recipientTx = internalTransactionTo(result, recipient.address)
        expect(recipientTx.inMessage.info.type).toEqual('internal')
        expect(recipientTx.inMessage.info.value.coins).toBeGreaterThanOrEqual(burnAmount)
        return
      }

      throw new Error(
        'Expected at least one fee-boundary burn candidate to reach the post-check path',
      )
    })
  })

  describe('excess preservation', () => {
    it('keeps pre-existing wallet surplus when a third party mints dust with attacker sendExcessesTo', async () => {
      await mintTo(alice.address, { jettonAmount: toNano('1') })

      const aliceWallet = await userWallet(alice.address)
      await aliceWallet.sendTopUpTons(alice.getSender(), toNano('5'))

      const walletNativeBefore = await walletNativeBalance(alice.address)
      const { result } = await sendMint({
        sender: bob,
        destination: alice.address,
        jettonAmount: 1n,
        tonAmount: toNano('0.2'),
        responseDestination: bob.address,
        value: 1n + toNano('0.2') + toNano('0.3'),
      })

      const excessTx = internalTransactionFromTo(result, aliceWallet.address, bob.address)

      expect(excessTx.inMessage.info.type).toEqual('internal')
      expect(excessTx.inMessage.info.value.coins).toBeLessThan(toNano('1'))
      expect(await walletBalance(alice.address)).toEqual(toNano('1') + 1n)
      expect(await totalSupply()).toEqual(toNano('1') + 1n)
      expect(await walletNativeBalance(alice.address)).toBeGreaterThan(walletNativeBefore)
    })

    it('preserves bounced-transfer surplus across a later third-party inbound transfer', async () => {
      const minted = toNano('1.2')
      await mintTo(alice.address, { jettonAmount: minted })
      await mintTo(bob.address, { jettonAmount: toNano('1') })

      const aliceWallet = await userWallet(alice.address)
      const bobWallet = await userWallet(bob.address)
      const bobWalletContract = await blockchain.getContract(bobWallet.address)
      bobWalletContract.balance = 0n

      await transferFrom(alice, {
        jettonAmount: toNano('0.3'),
        destination: bob.address,
        value: toNano('0.5'),
      })

      expect(await walletBalance(alice.address)).toEqual(minted)
      const walletNativeAfterBounce = await walletNativeBalance(alice.address)

      const { result } = await sendMint({
        sender: recipient,
        destination: alice.address,
        jettonAmount: 1n,
        tonAmount: toNano('0.2'),
        responseDestination: recipient.address,
        value: 1n + toNano('0.2') + toNano('0.3'),
      })

      const excessTx = internalTransactionFromTo(result, aliceWallet.address, recipient.address)

      expect(excessTx.inMessage.info.type).toEqual('internal')
      expect(excessTx.inMessage.info.value.coins).toBeLessThan(toNano('1'))
      expect(await walletBalance(alice.address)).toEqual(minted + 1n)
      expect(await totalSupply()).toEqual(minted + toNano('1') + 1n)
      expect(await walletNativeBalance(alice.address)).toBeGreaterThan(walletNativeAfterBounce)
    })
  })

  describe('extra coverage', () => {
    // This is a tiny deterministic PRNG, not property-test randomness: the fixed seeds keep
    // the sequence reproducible so a failing step can be replayed exactly.
    function createDeterministicFuzzer(seed: number) {
      let state = seed >>> 0

      const nextUint32 = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state
      }

      return {
        pick<T>(values: readonly T[]) {
          return values[nextUint32() % values.length]
        },
      }
    }

    // Bias the spend candidates toward boundary-ish values and full-balance spends while keeping
    // every sampled operation valid for the current wallet state.
    function pickSpendAmount(
      pick: <T>(values: readonly T[]) => T,
      maxAmount: bigint,
      operation: 'transfer' | 'burn',
    ) {
      const candidates = [
        1n,
        maxAmount,
        maxAmount / 2n,
        maxAmount / 3n,
        maxAmount > 1n ? maxAmount - 1n : maxAmount,
        toNano('0.01'),
        toNano('0.05'),
        operation === 'transfer' ? toNano('0.2') : toNano('0.15'),
        operation === 'transfer' ? toNano('0.45') : toNano('0.3'),
      ].filter((amount) => amount > 0n && amount <= maxAmount)

      return pick(Array.from(new Set(candidates)))
    }

    // Exercise only valid mint / transfer / burn sequences and assert the core accounting
    // invariants after every step. The goal is broad state-space coverage without introducing
    // random invalid-input failures that belong in dedicated negative tests.
    async function runDeterministicInvariantSequence(seed: number, steps: number) {
      const owners = [alice, bob, recipient]
      const ownerAddresses = owners.map((owner) => owner.address)
      const { pick } = createDeterministicFuzzer(seed)
      const mintJettonOptions = [
        1n,
        2n,
        7n,
        toNano('0.03'),
        toNano('0.11'),
        toNano('0.2'),
        toNano('0.45'),
        toNano('0.9'),
      ]
      const tonBudgetOptions = [
        toNano('0.2'),
        toNano('0.23'),
        toNano('0.27'),
        toNano('0.31'),
        toNano('0.37'),
        toNano('0.5'),
      ]
      const forwardTonOptions = [
        0n,
        toNano('0.005'),
        toNano('0.01'),
        toNano('0.02'),
        toNano('0.03'),
      ]
      const mintMarginOptions = [
        toNano('0.35'),
        toNano('0.4'),
        toNano('0.45'),
        toNano('0.55'),
        toNano('0.7'),
      ]
      const transferValueOptions = [
        toNano('0.55'),
        toNano('0.6'),
        toNano('0.7'),
        toNano('0.85'),
        toNano('1'),
      ]
      const burnValueOptions = [
        toNano('0.2'),
        toNano('0.23'),
        toNano('0.27'),
        toNano('0.3'),
        toNano('0.35'),
      ]

      for (const owner of owners) {
        const jettonAmount = pick(mintJettonOptions)
        const tonAmount = pick(tonBudgetOptions)
        await mintTo(owner.address, {
          jettonAmount,
          tonAmount,
          responseDestination: pick(ownerAddresses),
          forwardTonAmount: pick(forwardTonOptions),
          value: jettonAmount + tonAmount + pick(mintMarginOptions),
        })
      }

      await assertCoreInvariants(ownerAddresses)

      for (let step = 0; step < steps; step++) {
        const operation = pick(['mint', 'transfer', 'burn'] as const)

        if (operation === 'mint') {
          const jettonAmount = pick(mintJettonOptions)
          const tonAmount = pick(tonBudgetOptions)
          await mintTo(pick(ownerAddresses), {
            jettonAmount,
            tonAmount,
            forwardTonAmount: pick(forwardTonOptions),
            responseDestination: pick(ownerAddresses),
            value: jettonAmount + tonAmount + pick(mintMarginOptions),
          })
        } else {
          const spenders = [] as Array<{
            owner: SandboxContract<TreasuryContract>
            balance: bigint
          }>

          for (const owner of owners) {
            const balance = await walletBalance(owner.address)
            if (balance > 0n) {
              spenders.push({ owner, balance })
            }
          }

          const senderState = spenders.length > 0 ? pick(spenders) : null
          if (!senderState) {
            continue
          }

          const sender = senderState.owner

          if (operation === 'transfer') {
            const receiverOptions = owners.filter((owner) => !owner.address.equals(sender.address))
            const { wallet, result } = await transferFrom(sender, {
              jettonAmount: pickSpendAmount(pick, senderState.balance, 'transfer'),
              destination: pick(receiverOptions).address,
              responseDestination: pick([...ownerAddresses, null] as const),
              value: pick(transferValueOptions),
              forwardTonAmount: pick(forwardTonOptions),
            })

            expect(result.transactions).toHaveTransaction({
              from: sender.address,
              to: wallet.address,
              success: true,
            })
          } else {
            const { wallet, result } = await burnFrom(sender, {
              jettonAmount: pickSpendAmount(pick, senderState.balance, 'burn'),
              responseDestination: pick(ownerAddresses),
              value: pick(burnValueOptions),
            })

            expect(result.transactions).toHaveTransaction({
              from: sender.address,
              to: wallet.address,
              success: true,
            })
          }
        }

        await assertCoreInvariants(ownerAddresses)
      }
    }

    // For wTON solvency we care about two invariants: supply matches wallet balances, and the
    // minter plus all wallet backings still cover that supply with the minter reserve on top.
    async function assertCoreInvariants(owners: Address[]) {
      const supply = await totalSupply()
      expect(supply).toEqual(await sumWalletBalances(owners))

      let hostedTon = 0n
      for (const owner of owners) {
        hostedTon += await walletNativeBalance(owner)
      }

      const balance = await contractBalance(minter.address)
      expect(balance + hostedTon).toBeGreaterThanOrEqual(supply + toNano('0.01'))
    }

    it('keeps core supply and backing invariants across deterministic fuzz sequences', async () => {
      const snapshot = blockchain.snapshot()

      // Reset to the pristine deployed state before each seed so every sequence stays independent.
      for (const seed of [0x1badc0de, 0x0ddc0ffe, 0xdecafbad]) {
        await blockchain.loadFrom(snapshot)
        nextQueryId = 1n
        await runDeterministicInvariantSequence(seed, 24)
      }
    })

    it('keeps supply whole when bounced mint bodies carry ref-heavy trailing payloads', async () => {
      const bounceMinter = await deployMinter(bouncerCode)
      const snapshot = blockchain.snapshot()
      const payloads = [
        beginCell().storeStringRefTail('bounce.ref-tail').endCell(),
        beginCell()
          .storeRef(
            beginCell().storeRef(beginCell().storeStringTail('deep-ref').endCell()).endCell(),
          )
          .endCell(),
      ]

      for (const payload of payloads) {
        await blockchain.loadFrom(snapshot)

        const { result } = await sendMint({
          minterContract: bounceMinter,
          destination: alice.address,
          jettonAmount: 1n,
          tonAmount: toNano('0.2'),
          responseDestination: recipient.address,
          customPayload: payload,
          value: 1n + toNano('0.2') + toNano('0.35'),
        })

        // The wrapper's customPayload lands in the inner InternalTransferStep tail, so this is a
        // focused tripwire for the RichBounceOnlyRootCell assumption used by the mint bounce path.
        expect((await bounceMinter.getJettonData()).totalSupply).toEqual(0n)

        const refundTx = internalTransactionFromTo(result, bounceMinter.address, recipient.address)
        expect(refundTx.inMessage.info.type).toEqual('internal')
        expect(refundTx.inMessage.info.value.coins).toBeGreaterThan(0n)
      }
    })

    it('keeps a wallet live across the modeled five-year storage horizon', async () => {
      const fiveYears = 5 * 365 * 24 * 3600
      const startTime = blockchain.now ?? Math.floor(Date.now() / 1000)
      blockchain.now = startTime

      await mintTo(alice.address, { jettonAmount: toNano('1') })
      const aliceWallet = await userWallet(alice.address)

      blockchain.now = startTime + fiveYears - 60

      const { result } = await transferFrom(alice, {
        jettonAmount: 1n,
        destination: bob.address,
        value: toNano('0.5'),
      })

      expect(result.transactions).toHaveTransaction({
        from: alice.address,
        to: aliceWallet.address,
        success: true,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1') - 1n)
      expect(await walletBalance(bob.address)).toEqual(1n)
      await assertCoreInvariants([alice.address, bob.address])
    })
  })
})
