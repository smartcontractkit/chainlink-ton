import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { JettonMinter, MinterOpcodes } from '../../wrappers/jetton/JettonMinter'
import { JettonWallet, opcodes as walletOpcodes } from '../../wrappers/jetton/JettonWallet'
import { ERROR_INVALID_EXCESSES_DESTINATION } from '../../wrappers/wton'
import * as bouncer from '../../wrappers/test/mock/Bouncer'

const JETTON_DATA_URI = 'wton.test'
const WTON_MINT_OPCODE = 0x00000015
const INTERNAL_TRANSFER_OPCODE = 0x178d4519
const ERROR_BALANCE_ERROR = 47
const ERROR_NOT_ENOUGH_GAS = 48
const ERROR_INVALID_OP = 72
const ERROR_NOT_OWNER = 73
const ERROR_NOT_VALID_WALLET = 74
const ERROR_UNSUFFICIENT_AMOUNT = 76

type MintOptions = {
  minterContract?: SandboxContract<JettonMinter>
  destination: Address
  jettonAmount?: bigint
  tonAmount?: bigint
  forwardTonAmount?: bigint
  responseDestination?: Address | null
  transferInitiator?: Address | null
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
          admin: deployer.address,
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

  function mintBody({
    destination,
    queryId,
    jettonAmount,
    tonAmount,
    responseDestination,
    transferInitiator,
    forwardTonAmount,
  }: {
    destination: Address
    queryId: bigint
    jettonAmount: bigint
    tonAmount: bigint
    responseDestination: Address | null
    transferInitiator: Address | null
    forwardTonAmount: bigint
  }) {
    const internalTransferMsg = beginCell()
      .storeUint(INTERNAL_TRANSFER_OPCODE, 32)
      .storeUint(queryId, 64)
      .storeCoins(jettonAmount)
      .storeAddress(transferInitiator)
      .storeAddress(responseDestination)
      .storeCoins(forwardTonAmount)
      .storeBit(0)
      .endCell()

    return beginCell()
      .storeUint(WTON_MINT_OPCODE, 32)
      .storeUint(queryId, 64)
      .storeAddress(destination)
      .storeCoins(tonAmount)
      .storeRef(internalTransferMsg)
      .endCell()
  }

  async function sendMint({
    minterContract = minter,
    destination,
    jettonAmount = toNano('1'),
    tonAmount = toNano('0.2'),
    forwardTonAmount = 0n,
    responseDestination = deployer.address,
    transferInitiator = null,
    value,
  }: MintOptions) {
    const queryId = nextQueryId++
    const body = mintBody({
      destination,
      queryId,
      jettonAmount,
      tonAmount,
      responseDestination,
      transferInitiator,
      forwardTonAmount,
    })

    const result = await deployer.send({
      to: minterContract.address,
      value: value ?? jettonAmount + tonAmount + toNano('0.3'),
      body,
    })

    return { queryId, result }
  }

  async function mintTo(destination: Address, options: Omit<MintOptions, 'destination'> = {}) {
    const { result } = await sendMint({ destination, ...options })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: minter.address,
      success: true,
    })

    return result
  }

  function burnBody(queryId: bigint, jettonAmount: bigint, responseDestination: Address | null) {
    return beginCell()
      .storeUint(walletOpcodes.in.BURN, 32)
      .storeUint(queryId, 64)
      .storeCoins(jettonAmount)
      .storeAddress(responseDestination)
      .storeBit(0)
      .endCell()
  }

  function transferBody({
    queryId,
    jettonAmount,
    destination,
    responseDestination,
    forwardTonAmount = 0n,
  }: {
    queryId: bigint
    jettonAmount: bigint
    destination: Address
    responseDestination: Address | null
    forwardTonAmount?: bigint
  }) {
    return beginCell()
      .storeUint(walletOpcodes.in.TRANSFER, 32)
      .storeUint(queryId, 64)
      .storeCoins(jettonAmount)
      .storeAddress(destination)
      .storeAddress(responseDestination)
      .storeBit(0)
      .storeCoins(forwardTonAmount)
      .storeBit(0)
      .endCell()
  }

  function internalTransferBody({
    queryId,
    jettonAmount,
    transferInitiator,
    responseDestination,
    forwardTonAmount = 0n,
  }: {
    queryId: bigint
    jettonAmount: bigint
    transferInitiator: Address | null
    responseDestination: Address | null
    forwardTonAmount?: bigint
  }) {
    return beginCell()
      .storeUint(INTERNAL_TRANSFER_OPCODE, 32)
      .storeUint(queryId, 64)
      .storeCoins(jettonAmount)
      .storeAddress(transferInitiator)
      .storeAddress(responseDestination)
      .storeCoins(forwardTonAmount)
      .storeBit(0)
      .endCell()
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
    const result = await owner.send({
      to: wallet.address,
      value,
      body: transferBody({
        queryId: nextQueryId++,
        jettonAmount,
        destination,
        responseDestination,
        forwardTonAmount,
      }),
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
    const result = await owner.send({
      to: wallet.address,
      value,
      body: burnBody(nextQueryId++, jettonAmount, responseDestination),
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

    it('rejects mint messages that spoof a transfer initiator', async () => {
      const { result } = await sendMint({
        destination: alice.address,
        transferInitiator: alice.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: ERROR_INVALID_OP,
      })
      expect((await minter.getJettonData()).totalSupply).toEqual(0n)
    })

    it('rolls supply back and refunds the caller when mint deployment bounces', async () => {
      const rejector = await deployRejector()
      const mintAmount = toNano('1')
      await sendMint({
        destination: rejector.address,
        jettonAmount: mintAmount,
        responseDestination: rejector.address, // refund
      })

      const rejectorWallet = await userWallet(rejector.address)
      const c = await blockchain.getContract(rejectorWallet.address)
      c.balance = 0n // Put wallet in debt to trigger the mint bounce

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
      expect(mintRefundBalance).toBeGreaterThanOrEqual(mintAmount) // second mint refunded
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
        exitCode: ERROR_UNSUFFICIENT_AMOUNT,
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
        exitCode: ERROR_NOT_ENOUGH_GAS,
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
        exitCode: ERROR_INVALID_OP,
      })
      expect(await totalSupply()).toEqual(0n)
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
        exitCode: ERROR_NOT_OWNER,
      })
      expect(await walletBalance(alice.address)).toEqual(toNano('1'))
    })

    it('rejects forged internal transfer senders', async () => {
      const bobMint = toNano('0.5')
      await mintTo(bob.address, { jettonAmount: bobMint })

      const bobWallet = await userWallet(bob.address)
      const forgedTransfer = internalTransferBody({
        queryId: nextQueryId++,
        jettonAmount: toNano('0.1'),
        transferInitiator: alice.address,
        responseDestination: deployer.address,
      })

      const forgedResult = await deployer.send({
        to: bobWallet.address,
        value: toNano('0.2'),
        body: forgedTransfer,
      })

      expect(forgedResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: bobWallet.address,
        success: false,
        exitCode: ERROR_NOT_VALID_WALLET,
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
        exitCode: ERROR_BALANCE_ERROR,
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
    it('rejects burns without a refund destination', async () => {
      const mintAmount = toNano('1')
      await mintTo(alice.address, { jettonAmount: mintAmount })

      const aliceWallet = await userWallet(alice.address)
      const burnResult = await alice.send({
        to: aliceWallet.address,
        value: toNano('0.2'),
        body: burnBody(nextQueryId++, mintAmount, null),
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
        exitCode: ERROR_NOT_OWNER,
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

      const forgedBurn = beginCell()
        .storeUint(walletOpcodes.in.BURN_NOTIFICATION, 32)
        .storeUint(nextQueryId++, 64)
        .storeCoins(toNano('0.5'))
        .storeAddress(alice.address)
        .storeAddress(recipient.address)
        .endCell()

      const forgedResult = await deployer.send({
        to: minter.address,
        value: toNano('0.1'),
        body: forgedBurn,
      })

      expect(forgedResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: minter.address,
        success: false,
        exitCode: ERROR_NOT_VALID_WALLET,
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
        exitCode: ERROR_BALANCE_ERROR,
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
  })
})
