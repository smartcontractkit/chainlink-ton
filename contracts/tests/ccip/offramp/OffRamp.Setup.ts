import { Cell, Address, Dictionary, toNano, beginCell, StateInit, contractAddress } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { KeyPair } from '@ton/crypto'

import {
  generateMockTonAddress,
  bigIntToBuffer,
  uint8ArrayToBigInt,
  asSnakedCell,
  generateEd25519KeyPair,
  generateRandomContractId,
  WRAPPED_NATIVE,
  generateRandomTonAddress,
} from '../../../src/utils'
import { contractCode } from '../../../wrappers/codeLoader'

import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import * as OCR3Logs from '../../../wrappers/libraries/ocr/Logs'
import * as deployable from '../../../wrappers/libraries/Deployable'
import { PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS } from './OffRamp.commitAndExec.spec'
import { ChainSelectors } from '../../utils/Selectors'
import { setupTestFeeQuoter } from '../helpers/SetUp'

import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as tr from '../../../wrappers/examples/Receiver'

import * as CCIPLogs from '../../../wrappers/ccip/Logs'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import * as ofManual from '../../../wrappers/ccip/OffRamp'
import generateMessageID, { getMetadataHash } from '../../../src/offramp/generateMessageID'
import { MerkleHelper } from '../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { assertLog, expectFailedTransaction, expectSuccessfulTransaction } from '../../Logs'

export async function deployOffRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  code?: Cell,
  opts?: {
    deployerCode?: Cell
    merkleRootCode?: Cell
    receiveExecutorCode?: Cell
    feeQuoter?: Address
  },
): Promise<SandboxContract<of.OffRamp>> {
  const storage = of.Storage.create({
    id: generateRandomContractId(),
    ownable: of.Ownable2Step.create({
      owner: owner.address,
    }),
    deployables: of.OffRamp_Deployables.create({
      rmnRouter: owner.address, // used to determine who can send RMN updates
      deployer: opts?.deployerCode ?? Cell.EMPTY,
      merkleRootCode: opts?.merkleRootCode ?? Cell.EMPTY,
      receiveExecutorCode: opts?.receiveExecutorCode ?? Cell.EMPTY,
    }),
    feeQuoter: opts?.feeQuoter ?? owner.address, // placeholder
    ocr3Base: of.OCR3Base.create({
      chainId: 1n,
      commit: null,
      execute: null,
    }),
    cursedSubjects: of.CursedSubjects.create({
      data: new Set(),
    }),
    chainSelector: ChainSelectors.testnet.ton,
    permissionlessExecutionThresholdSeconds: PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS,
    sourceChainConfigs: new Map(),
    latestPriceSequenceNumber: 0n,
  })

  const offramp = blockchain.openContract(
    of.OffRamp.fromStorage(storage, {
      overrideContractCode: code ?? (await contractCode.ccip.local('OffRamp')),
    }),
  )

  let result = await offramp.sendDeploy(owner.getSender(), toNano('0.05'))
  expect(result.transactions).toHaveTransaction({
    from: owner.address,
    to: offramp.address,
    deploy: true,
    success: true,
  })
  return offramp
}
export const createSignatures = (
  signerList: KeyPair[],
  hash: Buffer<ArrayBufferLike>,
): of.SignatureEd25519[] => {
  return signerList.map((signer) => {
    const sig = ocr.createSignature(signer, hash)
    return of.SignatureEd25519.create(sig)
  })
}

export function getMerkleRootID(root: bigint) {
  return beginCell().storeUint(root, 256)
}

export function getDefaultMetadataHash(sourceChainSelector: bigint): bigint {
  return getMetadataHash(sourceChainSelector, ChainSelectors.testnet.ton, EVM_ONRAMP_ADDRESS_TEST)
}

export const EVM_SENDER_ADDRESS_TEST = 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an
export const EVM_ONRAMP_ADDRESS_TEST = beginCell()
  .storeBuffer(Buffer.from('111111c891c5d4e6ad68064ae45d43146d4f9f3a', 'hex'), 20)
  .asSlice()

export class OffRampTestSetup {
  signersPublicKeys: bigint[]

  // Constants and configuration
  configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

  public offRamp: SandboxContract<of.OffRamp> = null as any
  public router: SandboxContract<rt.Router> = null as any
  public receiver: SandboxContract<tr.Receiver> = null as any

  constructor(
    public readonly blockchain: Blockchain,
    public readonly deployer: SandboxContract<TreasuryContract>,
    public readonly code: {
      merkleRoot: Cell
      offRamp: Cell
      router: Cell
      feeQuoter: Cell
      receiveExecutor: Cell
      tokenRegistry: Cell
      deployer: Cell
    },
    public readonly transmitters: SandboxContract<TreasuryContract>[],
    public readonly signers: KeyPair[],
    public readonly feeQuoter: SandboxContract<fq.FeeQuoter>,
  ) {
    this.signersPublicKeys = this.signers.map((signer) => uint8ArrayToBigInt(signer.publicKey))

    // Populate the emulator library code
    // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())

    _libs.set(BigInt(`0x${code.merkleRoot.hash().toString('hex')}`), code.merkleRoot)
    _libs.set(BigInt(`0x${code.receiveExecutor.hash().toString('hex')}`), code.receiveExecutor)

    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs
  }

  static async Init(blockchain: Blockchain): Promise<OffRampTestSetup> {
    const deployer = await blockchain.treasury('deployer')
    return new OffRampTestSetup(
      blockchain,
      deployer,
      {
        deployer: await contractCode.ccip.local('Deployable'),
        merkleRoot: await contractCode.ccip.local('MerkleRoot'),
        offRamp: await contractCode.ccip.local('OffRamp'),
        router: await contractCode.ccip.local('Router'),
        feeQuoter: await contractCode.ccip.local('FeeQuoter'),
        receiveExecutor: await contractCode.ccip.local('ReceiveExecutor'),
        tokenRegistry: await contractCode.ccip.local('TokenRegistry'),
      },
      await Promise.all([
        blockchain.treasury('transmitter1'),
        blockchain.treasury('transmitter2'),
        blockchain.treasury('transmitter3'),
        blockchain.treasury('transmitter4'),
      ]),
      await Promise.all([
        generateEd25519KeyPair(),
        generateEd25519KeyPair(),
        generateEd25519KeyPair(),
        generateEd25519KeyPair(),
      ]),
      await setupTestFeeQuoter(deployer, blockchain),
    )
  }

  async SetupContracts() {
    // setup offramp
    {
      // Use a library reference
      let merkleRootLibPrep = beginCell()
        .storeUint(2, 8)
        .storeBuffer(this.code.merkleRoot.hash())
        .endCell()
      let merkleRootCode = new Cell({
        exotic: true,
        bits: merkleRootLibPrep.bits,
        refs: merkleRootLibPrep.refs,
      })

      let receiveExecutorLibPrep = beginCell()
        .storeUint(2, 8)
        .storeBuffer(this.code.receiveExecutor.hash())
        .endCell()
      let receiveExecutorCode = new Cell({
        exotic: true,
        bits: receiveExecutorLibPrep.bits,
        refs: receiveExecutorLibPrep.refs,
      })

      this.offRamp = await deployOffRampContract(
        this.blockchain,
        this.deployer,
        this.code.offRamp,
        {
          deployerCode: this.code.deployer,
          merkleRootCode: merkleRootCode,
          receiveExecutorCode: receiveExecutorCode,
          feeQuoter: this.feeQuoter.address,
        },
      )

      let resultFeeQuoterAddAuthorizedCaller = await this.feeQuoter.sendFeeQuoterAddPriceUpdater(
        this.deployer.getSender(),
        toNano('0.01'),
        { priceUpdater: this.offRamp.address },
      )
      expect(resultFeeQuoterAddAuthorizedCaller.transactions).toHaveTransaction({
        from: this.deployer.address,
        to: this.feeQuoter.address,
        success: true,
      })
    }
    // setup router
    //
    {
      let data = rt.Storage.create({
        id: generateRandomContractId(),
        ownable: rt.Ownable2Step.create({
          owner: this.deployer.address,
        }),
        wrappedNative: WRAPPED_NATIVE,
        onRamps: new Map(),
        offRamps: new Map(),
        rmnRemote: rt.RMNRemote.create({
          admin: rt.Ownable2Step.create({ owner: this.deployer.address }),
          cursedSubjects: rt.CursedSubjects.create({ data: new Set() }),
          forwardUpdates: new Set(),
        }),
        tokenRegistryDeployment: rt.Router_TokenRegistryDeployment.create({
          deployableCode: this.code.deployer,
          tokenRegistryCode: this.code.tokenRegistry,
        }),
      })

      this.router = this.blockchain.openContract(
        rt.Router.fromStorage(data, { overrideContractCode: this.code.router }),
      )

      const result = await this.router.sendDeploy(this.deployer.getSender(), toNano('1'))

      expect(result.transactions).toHaveTransaction({
        from: this.deployer.address,
        to: this.router.address,
        deploy: true,
        success: true,
      })

      // setup ramp
      const updateRampsResult = await this.router.sendRouterApplyRampUpdates(
        this.deployer.getSender(),
        toNano('1'),
        {
          queryId: 0n,
          offRampAdds: rt.OffRamps.create({
            sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
            offRamp: this.offRamp.address,
          }),
        },
      )
      expect(updateRampsResult.transactions).toHaveTransaction({
        from: this.deployer.address,
        to: this.router.address,
        success: true,
      })
    }

    // Deploy test receiver
    {
      let code = await contractCode.ccip.local('ccip.test.receiver')
      this.receiver = this.blockchain.openContract(
        tr.Receiver.createFromConfig(
          {
            id: generateRandomContractId(),
            ownable: { owner: this.deployer.address, pendingOwner: null },
            authorizedCaller: this.router.address,
            behavior: tr.ReceiverBehavior.Accept,
          },
          code,
        ),
      )
      const result = await this.receiver.sendDeploy(this.deployer.getSender(), toNano('0.05'))
      expect(result.transactions).toHaveTransaction({
        from: this.deployer.address,
        to: this.receiver.address,
        deploy: true,
        success: true,
      })
    }
  }

  createDefaultOCRConfig(
    overrides: Partial<Omit<of.OCR3Base_SetOCR3Config, '$'>> = {},
  ): [bigint, of.OCR3Base_SetOCR3Config] {
    return [
      toNano('100'),
      of.OCR3Base_SetOCR3Config.create({
        configDigest: this.configDigest,
        ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
        bigF: 1n,
        isSignatureVerificationEnabled: true,
        signers: this.signersPublicKeys,
        transmitters: this.transmitters.map((t) => t.address),
        ...overrides,
      }),
    ]
  }

  createDefaultUpdateSourceChainConfigs(
    overrides: Partial<Omit<of.SourceChainConfig, '$'>> = {},
  ): of.SourceChainConfigUpdate[] {
    return [
      of.SourceChainConfigUpdate.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        config: of.SourceChainConfig.create({
          router: this.router.address,
          isEnabled: true,
          minSeqNr: 1n,
          isRMNVerificationDisabled: true,
          onRamp: EVM_ONRAMP_ADDRESS_TEST,
          ...overrides,
        }),
      }),
      of.SourceChainConfigUpdate.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
        config: of.SourceChainConfig.create({
          router: this.router.address,
          isEnabled: true,
          minSeqNr: 1n,
          isRMNVerificationDisabled: true,
          onRamp: EVM_ONRAMP_ADDRESS_TEST,
          ...overrides,
        }),
      }),
    ]
  }

  createTestMessage(
    sequenceNumber = 1n,
    messageId = 1n,
    receiverAddress = generateMockTonAddress(),
    data: Cell = Cell.EMPTY,
  ): of.Any2TVMRampMessage {
    const header = of.RampMessageHeader.create({
      messageId,
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      destChainSelector: ChainSelectors.testnet.ton,
      sequenceNumber,
      nonce: 0n,
    })

    return of.Any2TVMRampMessage.create({
      header,
      sender: beginCell().storeBuffer(bigIntToBuffer(EVM_SENDER_ADDRESS_TEST)).asSlice(),
      data: data,
      receiver: receiverAddress,
      gasLimit: toNano('0.03'), // 200_000_000 nanotons
      tokenAmounts: null,
    })
  }

  createMerkleRoot(minSeqNr: bigint, maxSeqNr: bigint, merkleRootBytes: bigint): of.MerkleRoot {
    return of.MerkleRoot.create({
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      onRampAddress: EVM_ONRAMP_ADDRESS_TEST,
      minSeqNr,
      maxSeqNr,
      merkleRoot: merkleRootBytes,
    })
  }

  async setupOCRConfigs() {
    await this.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await this.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await this.setupSourceChainConfig()
  }

  async setupOCRConfig(
    ocrPluginType: bigint = ocr.OCR3_PLUGIN_TYPE_COMMIT,
    overrides: Partial<Omit<of.OCR3Base_SetOCR3Config, 'ocrPluginType' | '$'>> = {},
  ) {
    const result = await this.offRamp.sendOCR3BaseSetOCR3Config(
      this.deployer.getSender(),
      ...this.createDefaultOCRConfig({ ocrPluginType, ...overrides }),
    )
    expectSuccessfulTransaction(result, this.deployer.address, this.offRamp.address)

    assertLog(result.transactions, this.offRamp.address, OCR3Logs.LogTypes.OCR3BaseConfigSet, {
      ocrPluginType,
      configDigest: this.configDigest,
      signers: overrides.signers ?? this.signersPublicKeys,
      transmitters: this.transmitters.map((t) => t.address),
      bigF: 1,
    })

    return result
  }

  async setupSourceChainConfig(
    overrides: Partial<Omit<of.SourceChainConfig, '$'>> = {},
    isInitialSetup = true,
  ) {
    const configs = this.createDefaultUpdateSourceChainConfigs({ ...overrides })
    const result = await this.offRamp.sendOffRampUpdateSourceChainConfigs(
      this.deployer.getSender(),
      toNano('0.5'),
      {
        configs,
      },
    )
    expectSuccessfulTransaction(result, this.deployer.address, this.offRamp.address)

    if (isInitialSetup) {
      for (const config of configs) {
        assertLog(
          result.transactions,
          this.offRamp.address,
          CCIPLogs.LogTypes.SourceChainSelectorAdded,
          {
            sourceChainSelector: config.sourceChainSelector,
          },
        )
      }
    }

    for (const config of configs) {
      assertLog(
        result.transactions,
        this.offRamp.address,
        CCIPLogs.LogTypes.SourceChainConfigUpdated,
        {
          sourceChainSelector: config.sourceChainSelector,
          sourceChainConfig: {
            ...config.config,
            ...overrides,
            onRamp: config.config.onRamp,
            minSeqNr: expect.anything(),
          },
        },
      )
    }

    return result
  }

  // Helper to test commit report flow
  async commitReport(
    merkleRoots: of.MerkleRoot[],
    value: bigint = toNano('0.5'),
    sequenceBytes = 0x01,
    priceUpdates: of.PriceUpdates | null = null,
    expectSuccess = true,
    exitCode = 0,
  ) {
    // Build the CommitReport using the generated wrapper types
    const genReport = of.CommitReport.create({
      priceUpdates: priceUpdates ? of.PriceUpdates.create(priceUpdates) : null,
      merkleRoots,
    })

    const reportContext: ocr.ReportContext = {
      configDigest: this.configDigest,
      padding: 0n,
      sequenceBytes,
    }
    const signatures = createSignatures(
      this.signers.slice(0, 2),
      ocr.hashReport(of.CommitReport.toCell(genReport), reportContext),
    )

    const result = await this.offRamp.sendOffRampCommit(this.transmitters[0].getSender(), value, {
      reportContext: of.ReportContext.create({
        configDigest: this.configDigest,
        sequenceBytes: BigInt(sequenceBytes),
      }),
      report: genReport,
      signatures,
    })
    if (expectSuccess) {
      expectSuccessfulTransaction(result, this.transmitters[0].address, this.offRamp.address)

      assertLog(result.transactions, this.offRamp.address, CCIPLogs.LogTypes.CommitReportAccepted, {
        merkleRoot: merkleRoots[0] ?? null,
        priceUpdates,
      })
    } else {
      expectFailedTransaction(result, this.transmitters[0].address, this.offRamp.address, exitCode)
    }

    return result
  }

  //TODO: When we test for token transfers this will take more parameters
  createExecuteReport(
    messages: of.Any2TVMRampMessage[],
    sourceChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
  ): of.ExecutionReport {
    return of.ExecutionReport.create({
      sourceChainSelector,
      // TODO tolk type should should be snakedCell
      messages: asSnakedCell(messages, (msg) =>
        (() => {
          const b = beginCell()
          of.Any2TVMRampMessage.store(msg, b)
          return b
        })(),
      ),
      offchainTokenData: Cell.EMPTY, // TODO tolk type should be snakedCell
      proofs: [],
      proofFlagBits: 0n,
    })
  }

  // Helper to test execute report flow
  async executeReport(report: of.ExecutionReport, sequenceBytes = 0x02, expectSuccess = true) {
    const result = await this.offRamp.sendOffRampExecute(
      this.transmitters[0].getSender(),
      toNano('0.2'),
      {
        reportContext: of.ReportContext.create({
          configDigest: this.configDigest,
          sequenceBytes: BigInt(sequenceBytes),
        }),
        report,
      },
    )

    if (expectSuccess) {
      expectSuccessfulTransaction(result, this.transmitters[0].address, this.offRamp.address)
    }

    return result
  }

  async manualExecuteReport(
    report: of.ExecutionReport,
    gasOverride: bigint | undefined = undefined,
    expectSuccess = true,
  ) {
    const result = await this.offRamp.sendOffRampManuallyExecute(
      this.transmitters[0].getSender(),
      toNano('0.5'),
      {
        report,
        gasOverride: gasOverride ?? 0n,
      },
    )

    if (expectSuccess) {
      expectSuccessfulTransaction(result, this.transmitters[0].address, this.offRamp.address)
    }

    return result
  }

  async executeReportExpectingFailure(
    report: of.ExecutionReport,
    expectedErrorCode: number,
    sequenceBytes = 0x02,
  ) {
    const result = await this.executeReport(report, sequenceBytes, false)
    expectFailedTransaction(
      result,
      this.transmitters[0].address,
      this.offRamp.address,
      expectedErrorCode,
    )
    return result
  }

  async setupAndCommitMessage(message: of.Any2TVMRampMessage) {
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = this.createMerkleRoot(1n, 1n, rootBytes)

    await this.setupOCRConfigs()
    await this.commitReport([root])

    return { root, metadataHash, rootBytes }
  }

  merkleRootAddress(root: of.MerkleRoot) {
    const data = deployable.builder.data.contractData
      .encode({
        owner: this.offRamp.address,
        id: deployable.builder.data.namespaced.encode({
          namespace: NameSpace.CCIPNamespace.MerkleRoot,
          id: getMerkleRootID(root.merkleRoot),
        }),
      })
      .endCell()

    const init: StateInit = {
      code: this.code.deployer,
      data,
    }

    const workchain = 0
    return contractAddress(workchain, init)
  }
}

export function generateMerkleRootBytes(
  messages: of.Any2TVMRampMessage[],
  metadataHash: bigint,
): bigint {
  let hashedMessages = messages.map((msg) => {
    return generateMessageID(msg, metadataHash)
  })

  let merkleHelper: MerkleHelper = new MerkleHelper()

  return merkleHelper.getMerkleRoot(hashedMessages)
}

// Helper to build CursedSubjects from an array of subject IDs
export function buildCursedSubjects(subjects: Set<bigint>): of.CursedSubjects {
  return of.CursedSubjects.create({ data: subjects })
}
