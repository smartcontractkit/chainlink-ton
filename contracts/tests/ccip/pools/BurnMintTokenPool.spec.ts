import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import {
  BurnMintTokenPool,
  codec as poolCodec,
  opcodes as poolOpcodes,
} from '../../../wrappers/ccip/BurnMintTokenPool'
import { CCTJettonMinter } from '../../../wrappers/ccip/CCTJettonMinter'
import { CCTJettonMinterCode, CCTJettonWalletCode } from '../../../wrappers/ccip/CCTJettonCode'
import { runTokenPoolBehaviorTests } from './TokenPool.behavior'

describe('BurnMintTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let unauthorized: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let cctMinter: SandboxContract<CCTJettonMinter>
  let cctMinterRuntime: SandboxContract<JettonMinter>
  let burnMintPool: SandboxContract<BurnMintTokenPool>
  let cctWalletCode: Cell

  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  const remoteChainSelector = 91000001n
  const sourcePoolAddress = poolCodec.crossChainAddressFromBuffer(Buffer.from('source-pool'))
  const destTokenAddress = poolCodec.crossChainAddressFromBuffer(Buffer.from('dest-token'))
  const receiverAddress = poolCodec.crossChainAddressFromBuffer(Buffer.from('receiver'))

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    offRamp = await blockchain.treasury('offramp')
    unauthorized = await blockchain.treasury('unauthorized')
    recipient = await blockchain.treasury('recipient')

    cctWalletCode = await CCTJettonWalletCode()
    const cctMinterCode = await CCTJettonMinterCode()

    cctMinter = blockchain.openContract(
      CCTJettonMinter.createFromConfig(
        {
          totalSupply: 0n,
          adminAddress: deployer.address,
          nextAdminAddress: null,
          jettonWalletCode: cctWalletCode,
          metadataUri: 'cct-test',
        },
        cctMinterCode,
      ),
    )
    await cctMinter.sendDeploy(deployer.getSender(), toNano('1'))
    cctMinterRuntime = blockchain.openContract(JettonMinter.createFromAddress(cctMinter.address))

    const poolCode = await BurnMintTokenPool.code()
    burnMintPool = blockchain.openContract(
      BurnMintTokenPool.createFromConfig(
        {
          owner: deployer.address,
          token: cctMinter.address,
          tokenDecimals: 9,
          rmnProxy: deployer.address,
          router: deployer.address,
          jettonClient: {
            masterAddress: cctMinter.address,
            jettonWalletCode: cctWalletCode,
          },
        },
        poolCode,
      ),
    )
    await burnMintPool.sendDeploy(deployer.getSender(), toNano('2'))

    await burnMintPool.sendApplyChainUpdates(deployer.getSender(), toNano('0.2'), {
      queryId: 1n,
      remove: [],
      add: [
        {
          remoteChainSelector,
          remotePoolAddresses: [sourcePoolAddress],
          remoteTokenAddress: destTokenAddress,
          outboundRateLimiterConfig: { isEnabled: true, capacity: toNano('100'), rate: 1n },
          inboundRateLimiterConfig: { isEnabled: true, capacity: toNano('100'), rate: 1n },
        },
      ],
    })

    await burnMintPool.sendUpdateRampAccess(deployer.getSender(), toNano('0.2'), {
      queryId: 2n,
      updates: [
        {
          remoteChainSelector,
          onRamp: deployer.address,
          offRamp: offRamp.address,
        },
      ],
    })

    // Mint user-side test balance before handing minter admin to the pool.
    const mintToOnRamp = await cctMinterRuntime.sendMint(deployer.getSender(), {
      value: toNano('1'),
      mintOpcode: 0x00000015,
      message: {
        queryId: 101n,
        destination: deployer.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
    expect(mintToOnRamp.transactions).toHaveTransaction({
      from: deployer.address,
      to: cctMinter.address,
      success: true,
    })

    await cctMinterRuntime.sendMint(deployer.getSender(), {
      value: toNano('1'),
      mintOpcode: 0x00000015,
      message: {
        queryId: 102n,
        destination: unauthorized.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('2'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    // Admin handoff: deployer sets pending admin to pool, pool claims ownership itself.
    const changeAdminResult = await cctMinterRuntime.sendChangeAdmin(deployer.getSender(), {
      value: toNano('0.2'),
      message: {
        queryId: 201n,
        newAdmin: burnMintPool.address,
      },
    })
    expect(changeAdminResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: cctMinter.address,
      success: true,
    })

    const claimAdminResult = await burnMintPool.sendClaimMinterAdmin(
      deployer.getSender(),
      toNano('0.2'),
      202n,
    )
    expect(claimAdminResult.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: cctMinter.address,
      success: true,
    })

    const jettonData = await cctMinterRuntime.getJettonData()
    expect(jettonData.admin).toEqualAddress(burnMintPool.address)
    expect(await cctMinterRuntime.getNextAdminAddress()).toBeNull()

    userWallet = async (address: Address) => {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await cctMinterRuntime.getWalletAddress(address)),
      )
    }
  })

  runTokenPoolBehaviorTests('BurnMintTokenPool', async () => ({
    pool: burnMintPool,
    deployer,
    offRamp,
    altOffRamp: deployer,
    unauthorized,
    recipient,
    remoteChainSelector,
    unsupportedChainSelector: remoteChainSelector + 1n,
    unknownSourcePoolAddress: poolCodec.crossChainAddressFromBuffer(
      Buffer.from('unknown-source-pool'),
    ),
    remoteTokenAddress: destTokenAddress,
    onRampAddress: deployer.address,
    destTokenAddress,
    sourcePoolAddress,
    localToken: cctMinter.address,
  }))

  it('has no pending burn or mint by default', async () => {
    expect(await burnMintPool.getHasPendingBurn(300n)).toBe(false)
    expect(await burnMintPool.getHasPendingMint(301n)).toBe(false)
  })

  it('rejects claim-minter-admin from non-owner sender', async () => {
    const result = await burnMintPool.sendClaimMinterAdmin(
      unauthorized.getSender(),
      toNano('0.2'),
      302n,
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: burnMintPool.address,
      success: false,
    })
  })

  it('reverts lockOrBurn when caller is not configured on-ramp', async () => {
    const unauthorizedWallet = await userWallet(unauthorized.address)
    const poolWallet = await userWallet(burnMintPool.address)
    const result = await unauthorizedWallet.sendTransfer(unauthorized.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 303,
        jettonAmount: toNano('1'),
        destination: burnMintPool.address,
        responseDestination: unauthorized.address,
        customPayload: null,
        forwardTonAmount: toNano('0.2'),
        forwardPayload: poolCodec.lockOrBurnPayload
          .encode({
            queryId: 303n,
            request: {
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: unauthorized.address,
              amount: toNano('1'),
              localToken: cctMinter.address,
            },
            requestedFinalityConfig: 0,
            tokenArgs: null,
            replyTo: unauthorized.address,
          })
          .endCell(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: poolWallet.address,
      to: burnMintPool.address,
      success: false,
    })
  })

  it('reverts lockOrBurn when payload amount does not match transferred amount', async () => {
    const onRampWallet = await userWallet(deployer.address)
    const poolWallet = await userWallet(burnMintPool.address)
    const result = await onRampWallet.sendTransfer(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 304,
        jettonAmount: toNano('2'),
        destination: burnMintPool.address,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.2'),
        forwardPayload: poolCodec.lockOrBurnPayload
          .encode({
            queryId: 304n,
            request: {
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('1'),
              localToken: cctMinter.address,
            },
            requestedFinalityConfig: 0,
            tokenArgs: null,
            replyTo: deployer.address,
          })
          .endCell(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: poolWallet.address,
      to: burnMintPool.address,
      success: false,
    })
  })

  it('burns tokens on lockOrBurn path and clears pending burn on confirmation', async () => {
    const onRampWallet = await userWallet(deployer.address)
    const poolWallet = await userWallet(burnMintPool.address)

    const result = await onRampWallet.sendTransfer(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 11,
        jettonAmount: toNano('3'),
        destination: burnMintPool.address,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.2'),
        forwardPayload: poolCodec.lockOrBurnPayload
          .encode({
            queryId: 11n,
            request: {
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('3'),
              localToken: cctMinter.address,
            },
            requestedFinalityConfig: 0,
            tokenArgs: null,
            replyTo: deployer.address,
          })
          .endCell(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onRampWallet.address,
      success: true,
    })

    expect(await burnMintPool.getHasPendingBurn(11n)).toBe(false)
    expect(await poolWallet.getJettonBalance()).toEqual(0n)

    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: deployer.address,
      success: true,
      op: poolOpcodes.out.lockOrBurnResponse,
    })
  })

  it('mints tokens on releaseOrMint path and clears pending mint on confirmation', async () => {
    const result = await burnMintPool.sendReleaseOrMint(offRamp.getSender(), toNano('0.6'), {
      queryId: 22n,
      request: {
        originalSender: sourcePoolAddress,
        remoteChainSelector,
        receiver: recipient.address,
        sourceDenominatedAmount: toNano('2'),
        localToken: cctMinter.address,
        sourcePoolAddress,
        sourcePoolData: null,
        offchainTokenData: null,
      },
      requestedFinalityConfig: 0,
      replyTo: deployer.address,
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: burnMintPool.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: cctMinter.address,
      success: true,
    })

    expect(await burnMintPool.getHasPendingMint(22n)).toBe(false)

    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: deployer.address,
      success: true,
      op: poolOpcodes.out.releaseOrMintResponse,
      body(body) {
        if (!body) return false
        const response = poolCodec.releaseOrMintResponse.load(body.beginParse())
        return response.queryId === 22n && response.destinationAmount === toNano('2')
      },
    })
  })

  it('mints on releaseOrMint with null replyTo without emitting response message', async () => {
    const result = await burnMintPool.sendReleaseOrMint(offRamp.getSender(), toNano('0.6'), {
      queryId: 305n,
      request: {
        originalSender: sourcePoolAddress,
        remoteChainSelector,
        receiver: recipient.address,
        sourceDenominatedAmount: toNano('1'),
        localToken: cctMinter.address,
        sourcePoolAddress,
        sourcePoolData: null,
        offchainTokenData: null,
      },
      requestedFinalityConfig: 0,
      replyTo: null,
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: burnMintPool.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: cctMinter.address,
      success: true,
    })

    const releaseResponses = result.transactions.filter((tx: any) => {
      return (
        tx.inMessage?.info?.src?.equals?.(burnMintPool.address) &&
        tx.inMessage?.body?.beginParse?.().preloadUint?.(32) ===
          poolOpcodes.out.releaseOrMintResponse
      )
    })
    expect(releaseResponses.length).toBe(0)
    expect(await burnMintPool.getHasPendingMint(305n)).toBe(false)
  })
})
