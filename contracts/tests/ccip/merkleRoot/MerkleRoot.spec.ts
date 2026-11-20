import {
  Blockchain,
  createShardAccount,
  internal,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox'
import { beginCell, Cell, CommonMessageInfoInternal, toNano } from '@ton/core'
import { crc32 } from 'zlib'

import { errorCode, facilityId } from '../../../wrappers/utils'
import { generateMockTonAddress } from '../../../src/utils'

import * as typeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import {
  FACILITY_NAME,
  CONTRACT_VERSION,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/MerkleRoot'
import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import { contractCode } from '../../../wrappers/codeLoader'
import { ChainSelectors } from '../../utils/Selectors'
import EVM_ADDRESS from '../../utils/evmAddress'
import { findTransaction, findTransactionRequired, flattenTransaction } from '@ton/test-utils'
import { buildRichBounceBody, RichBouncePhase } from '../../utils/richBounce'
import {
  sendMessageAsync,
  captureAccountChanges,
  sendBouncedMessage,
} from '../../utils/sendInternalMessage'

interface MerkleRootStorageOverrides {
  root?: bigint
  timestamp?: bigint
  minMsgNr?: bigint
  maxMsgNr?: bigint
  messageStates?: bigint
  pendingExecutorDeploy?: bigint
  deliveredMessageCount?: bigint
}

async function deployMerkleRootContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  overrides: MerkleRootStorageOverrides = {},
) {
  const code = await contractCode.ccip.local('MerkleRoot')
  let data = mr.MerkleRoot_Storage.create({
    root: overrides.root ?? 0n,
    owner: owner.address,
    timestamp: overrides.timestamp ?? BigInt(Math.floor(Date.now() / 1000)),
    minMsgNr: overrides.minMsgNr ?? 0n,
    maxMsgNr: overrides.maxMsgNr ?? 5n,
    messageStates: overrides.messageStates ?? 0n,
    pendingExecutorDeploy: overrides.pendingExecutorDeploy ?? 0n,
    deliveredMessageCount: overrides.deliveredMessageCount ?? 0n,
  })

  const contract = blockchain.openContract(
    mr.MerkleRoot.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('1'))
  return contract
}

describe('MerkleRoot - TypeAndVersion Tests', () => {
  const currentVersionSpec = typeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: CONTRACT_VERSION,
    deployContract: deployMerkleRootContract,
  })
  currentVersionSpec.run([
    {
      code: 'MerkleRoot',
      name: 'merkleroot',
    },
  ])
})

describe('MerkleRoot - Unit Tests', () => {
  let blockchain: Blockchain
  let merkleRoot: SandboxContract<mr.MerkleRoot>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    merkleRoot = await deployMerkleRootContract(blockchain, await blockchain.treasury('owner'))
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await merkleRoot.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

    const [typeSlice] = await merkleRoot.getTypeAndVersion()
    expect(typeSlice.loadStringTail()).toBe(FACILITY_NAME)
    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await merkleRoot.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
  })
})

describe('MerkleRoot - Message Handling', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let nonOwner: SandboxContract<TreasuryContract>

  const SOURCE_CHAIN_SELECTOR = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001
  const DEST_CHAIN_SELECTOR = ChainSelectors.testnet.ton
  const METADATA_HASH = 0xabcdefn
  const ROOT = 0x1234n
  const NOW = 10_000n
  const THRESHOLD_SEC = 3600n

  // Encode a message state (2 bits) into the `messageStates` uint128 storage word.
  const encodeState = (seqNum: bigint, state: bigint, minMsgNr = 0n): bigint =>
    state << ((seqNum - minMsgNr) * 2n)

  const buildMessage = (
    sequenceNumber: bigint,
    receiver = generateMockTonAddress(),
  ): mr.Any2TVMRampMessage =>
    mr.Any2TVMRampMessage.create({
      header: mr.RampMessageHeader.create({
        messageId: sequenceNumber,
        sourceChainSelector: SOURCE_CHAIN_SELECTOR,
        destChainSelector: DEST_CHAIN_SELECTOR,
        sequenceNumber,
        nonce: 0n,
      }),
      sender: EVM_ADDRESS,
      data: [],
      receiver,
      gasLimit: toNano('0.03'),
      tokenAmounts: null,
    })

  const buildMessageRef = (sequenceNumber: bigint): mr.RampMessageRef => {
    const { messageId, sourceChainSelector } = buildMessage(sequenceNumber).header
    return mr.RampMessageRef.create({ messageId, sourceChainSelector, sequenceNumber })
  }

  // Opaque to the MerkleRoot: relayed unchanged on OffRamp_ExecuteValidated.
  const CONTEXT = beginCell().storeUint(0xc0ffee, 24).endCell()

  const loadStorage = async (address: mr.MerkleRoot['address']): Promise<mr.MerkleRoot_Storage> => {
    const contract = await blockchain.getContract(address)
    const accountState = contract.accountState
    if (accountState?.type !== 'active') throw new Error('MerkleRoot not active')
    const data = accountState.state.data
    if (!data) throw new Error('MerkleRoot storage missing')
    return mr.MerkleRoot_Storage.fromSlice(data.beginParse())
  }

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = Number(NOW)
    owner = await blockchain.treasury('owner')
    nonOwner = await blockchain.treasury('nonOwner')
  })

  beforeEach(async () => {
    // Fresh blockchain per test so each MerkleRoot deploy gets a unique address.
    blockchain = await Blockchain.create()
    blockchain.now = Number(NOW)
    owner = await blockchain.treasury('owner')
    nonOwner = await blockchain.treasury('nonOwner')
  })

  describe('MerkleRoot_Validate', () => {
    it('should forward OffRamp_ExecuteValidated to owner on happy path (DON)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const message = buildMessage(1n)
      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message,
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: false,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        success: true,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          const decoded = mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse())
          return (
            decoded.root === ROOT &&
            decoded.metadataHash === METADATA_HASH &&
            decoded.context.equals(CONTEXT) &&
            decoded.deployExecutor &&
            decoded.message.header.sequenceNumber === 1n
          )
        },
      })

      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.InProgress, 1n))
    })

    describe('when the OffRamp bounces OffRamp_ExecuteValidated', () => {
      // Sends MerkleRoot_Validate while the owner (the OffRamp) rejects every message, so the
      // OffRamp_ExecuteValidated it answers with bounces back to the root.
      const validateBounced = async (
        merkleRoot: SandboxContract<mr.MerkleRoot>,
        isManualExecution: boolean,
      ) => {
        const ownerAccount = (await blockchain.getContract(owner.address)).account
        await blockchain.setShardAccount(
          owner.address,
          createShardAccount({
            address: owner.address,
            code: await contractCode.ccip.local('tests.mock.Bouncer'),
            data: Cell.EMPTY,
            balance: toNano('10'),
          }),
        )
        const result = await merkleRoot.sendMerkleRootValidate(
          blockchain.sender(owner.address),
          toNano('0.5'),
          {
            message: buildMessage(1n),
            permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
            metadataHash: METADATA_HASH,
            isManualExecution,
            context: CONTEXT,
            excessesTo: owner.address,
          },
        )
        await blockchain.setShardAccount(owner.address, ownerAccount)

        expect(result.transactions).toHaveTransaction({
          from: merkleRoot.address,
          to: owner.address,
          op: mr.OffRamp_ExecuteValidated.PREFIX,
          success: false,
        })
        const bounce = findTransaction(result.transactions, {
          from: owner.address,
          to: merkleRoot.address,
          op: 0xfffffffe,
          success: true,
        })
        if (!bounce) throw new Error('Rich bounce of OffRamp_ExecuteValidated not found')
        return { result, bounce }
      }

      const manualRetry = (merkleRoot: SandboxContract<mr.MerkleRoot>) =>
        merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
          message: buildMessage(1n),
          permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
          metadataHash: METADATA_HASH,
          isManualExecution: true,
          context: CONTEXT,
          excessesTo: owner.address,
        })

      const expectExecuteValidated = (
        transactions: Awaited<ReturnType<typeof manualRetry>>['transactions'],
        merkleRoot: SandboxContract<mr.MerkleRoot>,
        deployExecutor: boolean,
      ) =>
        expect(transactions).toHaveTransaction({
          from: merkleRoot.address,
          to: owner.address,
          op: mr.OffRamp_ExecuteValidated.PREFIX,
          body(x) {
            if (!x) return false
            return (
              mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse()).deployExecutor ===
              deployExecutor
            )
          },
        })

      describe('on the first attempt (Untouched)', () => {
        let merkleRoot: SandboxContract<mr.MerkleRoot>
        let bounced: Awaited<ReturnType<typeof validateBounced>>

        beforeEach(async () => {
          merkleRoot = await deployMerkleRootContract(blockchain, owner, {
            root: ROOT,
            timestamp: NOW,
            minMsgNr: 1n,
            maxMsgNr: 3n,
          })
          bounced = await validateBounced(merkleRoot, false)
        })

        it('should mark the message Failure and notify the OffRamp', async () => {
          const storage = await loadStorage(merkleRoot.address)
          expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Failure, 1n))

          expect(bounced.result.transactions).toHaveTransaction({
            from: merkleRoot.address,
            to: owner.address,
            op: mr.MerkleRoot_ExecutionStateChanged.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = mr.MerkleRoot_ExecutionStateChanged.fromSlice(x.beginParse())
              return (
                decoded.state === mr.ExecutionState.Failure &&
                decoded.excessesTo.equals(owner.address)
              )
            },
          })
        })

        it('should make the next attempt deploy the executor, whose deploy was reverted', async () => {
          // Offset 0: seqNum 1 with minMsgNr 1.
          expect((await loadStorage(merkleRoot.address)).pendingExecutorDeploy).toBe(1n)

          // Failure allows manual execution even though the commit is fresh.
          const retry = await manualRetry(merkleRoot)
          expectExecuteValidated(retry.transactions, merkleRoot, true)

          const storage = await loadStorage(merkleRoot.address)
          expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.InProgress, 1n))
          expect(storage.pendingExecutorDeploy).toBe(0n)
        })

        it('should keep asking to deploy the executor while attempts keep bouncing', async () => {
          await validateBounced(merkleRoot, true)
          expect((await loadStorage(merkleRoot.address)).pendingExecutorDeploy).toBe(1n)

          const retry = await manualRetry(merkleRoot)
          expectExecuteValidated(retry.transactions, merkleRoot, true)
        })

        it('should reject the bounce once the message is no longer InProgress', async () => {
          const result = await blockchain.sendMessage(bounced.bounce.inMessage!)
          expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: merkleRoot.address,
            success: false,
            exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.InvalidState'],
          })
        })
      })

      it('should commit Failure and the pending deploy when the bounce cannot pay for ExecutionStateChanged', async () => {
        // The root notifies the OffRamp with the value the bounce carries. If that value covers the
        // root's compute but not the notification, the send must be skipped (IGNORE_ERRORS) rather
        // than failing the action phase, which would revert the state change and leave the message
        // InProgress forever.
        const bounceBody = buildRichBounceBody({
          originalBody: mr.OffRamp_ExecuteValidated.toCell(
            mr.OffRamp_ExecuteValidated.create({
              message: buildMessage(1n),
              root: ROOT,
              metadataHash: METADATA_HASH,
              deployExecutor: true,
              context: CONTEXT,
              excessesTo: owner.address,
            }),
          ),
          bouncedByPhase: RichBouncePhase.ComputeFailed,
          exitCode: 0xffff,
        })
        const deployInProgress = (root: bigint) =>
          deployMerkleRootContract(blockchain, owner, {
            root,
            timestamp: NOW,
            minMsgNr: 1n,
            maxMsgNr: 3n,
            messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
          })
        const bounce = (merkleRoot: SandboxContract<mr.MerkleRoot>, value: bigint) =>
          sendBouncedMessage(blockchain, owner.address, {
            to: merkleRoot.address,
            value,
            body: bounceBody,
          })

        // Measure, on a funded bounce to another root, the handler's compute fee and the
        // notification's forward fee.
        const funded = await bounce(await deployInProgress(ROOT + 1n), toNano('0.5'))
        const fundedHandler = findTransactionRequired(funded.transactions, {
          from: owner.address,
          success: true,
        }).description
        if (fundedHandler.type !== 'generic' || fundedHandler.computePhase.type !== 'vm') {
          throw new Error('Expected the bounce handler to run')
        }
        const notification = findTransactionRequired(funded.transactions, {
          to: owner.address,
          op: mr.MerkleRoot_ExecutionStateChanged.PREFIX,
        })
        const notificationInfo = notification.inMessage!.info as CommonMessageInfoInternal
        // The header carries the forward fee minus the sender's share, so half of it is still
        // below the full forward fee.
        const value = fundedHandler.computePhase.gasFees + notificationInfo.forwardFee / 2n

        // Enough for the root to process the bounce, not enough for the notification.
        const merkleRoot = await deployInProgress(ROOT)
        const underfunded = await bounce(merkleRoot, value)
        expect(underfunded.transactions).toHaveTransaction({
          from: owner.address,
          to: merkleRoot.address,
          success: true,
          aborted: false,
        })
        expect(underfunded.transactions).not.toHaveTransaction({
          from: merkleRoot.address,
          op: mr.MerkleRoot_ExecutionStateChanged.PREFIX,
        })

        const storage = await loadStorage(merkleRoot.address)
        expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Failure, 1n))
        expect(storage.pendingExecutorDeploy).toBe(1n)

        const retry = await manualRetry(merkleRoot)
        expectExecuteValidated(retry.transactions, merkleRoot, true)
      })

      it('should not set the pending deploy when a retry bounces after the executor was deployed', async () => {
        // Failure after an executor flow: the executor exists.
        const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
          root: ROOT,
          timestamp: NOW,
          minMsgNr: 1n,
          maxMsgNr: 3n,
          messageStates: encodeState(1n, mr.ExecutionState.Failure, 1n),
        })

        await validateBounced(merkleRoot, true)
        const storage = await loadStorage(merkleRoot.address)
        expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Failure, 1n))
        expect(storage.pendingExecutorDeploy).toBe(0n)

        const retry = await manualRetry(merkleRoot)
        expectExecuteValidated(retry.transactions, merkleRoot, false)
      })
    })

    it('should throw on a legacy bounce', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner)
      const result = await blockchain.sendMessage(
        internal({
          from: owner.address,
          to: merkleRoot.address,
          value: toNano('0.1'),
          bounced: true,
          body: beginCell()
            .storeUint(0xffffffff, 32)
            .storeUint(mr.OffRamp_ExecuteValidated.PREFIX, 32)
            .endCell(),
        }),
      )
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.UnhandledLegacyBounce'],
      })
    })

    it('should reject MerkleRoot_Validate from non-owner (NotOwner)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootValidate(nonOwner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: false,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.NotOwner'],
      })
    })

    it('should reject MerkleRoot_Validate when message was already executed (SkippedAlreadyExecutedMessage)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Success, 1n),
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: false,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.SkippedAlreadyExecutedMessage'],
      })
    })

    it('should reject DON re-execution when state is Failure (AlreadyExecuted)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Failure, 1n),
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: false,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.AlreadyExecuted'],
      })
    })

    it('should reject manual execution when commit is fresh and state is Untouched (ManualExecutionNotYetEnabled)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: true,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.ManualExecutionNotYetEnabled'],
      })
    })

    it('should allow manual execution when commit is old and state is Untouched', async () => {
      // timestamp is much older than blockchain.now, so the commit is past the threshold
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        timestamp: NOW - THRESHOLD_SEC - 1n,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: true,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        success: true,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          const decoded = mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse())
          return decoded.context.equals(CONTEXT) && decoded.deployExecutor
        },
      })
    })

    it('should allow manual execution when state is Failure even if commit is fresh', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Failure, 1n),
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: true,
        context: CONTEXT,
        excessesTo: owner.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        success: true,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          const decoded = mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse())
          // Failure after an executor flow: the executor exists, so it is not deployed again.
          return !decoded.deployExecutor
        },
      })
    })
  })

  describe('MerkleRoot_MarkState', () => {
    it('should make the next attempt deploy the executor when its deploy bounced', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })
      // The OffRamp reports an InitExecute that bounced without reaching an executor.
      await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.Failure,
        excessesTo: owner.address,
        executorDeployFailed: true,
      })
      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Failure, 1n))
      expect(storage.pendingExecutorDeploy).toBe(1n)

      const retry = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        isManualExecution: true,
        context: CONTEXT,
        excessesTo: owner.address,
      })
      expect(retry.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          return mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse()).deployExecutor
        },
      })
      expect((await loadStorage(merkleRoot.address)).pendingExecutorDeploy).toBe(0n)
    })

    it('should mark seq as Success and increment deliveredMessageCount', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.Success,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Success, 1n))
      expect(storage.deliveredMessageCount).toBe(1n)
    })

    it('should mark seq as Failure without incrementing deliveredMessageCount', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.Failure,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Failure, 1n))
      expect(storage.deliveredMessageCount).toBe(0n)
    })

    it('should reject MerkleRoot_MarkState from non-owner (NotOwner)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(nonOwner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.Success,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.NotOwner'],
      })
    })

    it('should reject transitioning away from Success (InvalidState)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Success, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.Failure,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.InvalidState'],
      })
    })

    it('should reject marking a non-final state like InProgress (InvalidState)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.InProgress,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.InvalidState'],
      })
    })

    it('should reject seqNum out of bounds (SeqNumOutOfBounds)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        messageRef: buildMessageRef(42n),
        state: mr.ExecutionState.Success,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.SeqNumOutOfBounds'],
      })
    })

    it('should freeze the contract and return the balance to owner when all messages are delivered', async () => {
      // Single-message range so a single Success finalizes the root.
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        minMsgNr: 1n,
        maxMsgNr: 1n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const body = mr.MerkleRoot.createCellOfMerkleRootMarkState({
        messageRef: buildMessageRef(1n),
        state: mr.ExecutionState.Success,
        excessesTo: owner.address,
        executorDeployFailed: false,
      })

      const txs = await sendMessageAsync(blockchain, owner.address, {
        to: merkleRoot.address,
        value: toNano('0.1'),
        body,
      })

      const { transactions, accountSnapshots } = await captureAccountChanges(blockchain, txs, [
        merkleRoot.address,
      ])

      expect(transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
        op: mr.MerkleRoot_MarkState.PREFIX,
      })

      const markStateSuccessTX = findTransaction(transactions, {
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })
      if (!markStateSuccessTX) throw new Error('MerkleRoot_MarkState transaction not found')
      const snap = accountSnapshots.get(markStateSuccessTX.lt)
      if (!snap) throw new Error('Account snapshot not found for MerkleRoot_MarkState transaction')

      // The excesses carried by MarkState go back to the owner first (mode 64), to be refunded
      // to the execution caller.
      const excessTX = findTransaction(transactions, {
        from: merkleRoot.address,
        to: owner.address,
        op: mr.MerkleRoot_ExecutionStateChanged.PREFIX,
      })
      if (!excessTX) throw new Error('ReturnExecuteExcess transaction not found')
      const excessValue = flattenTransaction(excessTX).value
      if (excessValue == undefined) throw new Error('Value not found in excess transaction')
      const excess = mr.MerkleRoot_ExecutionStateChanged.fromSlice(
        excessTX.inMessage!.body.beginParse(),
      )
      expect(excess.root).toEqual(ROOT)
      expect(excess.excessesTo.equals(owner.address)).toBe(true)
      // Trigger value minus the MarkState fees.
      expect(excessValue).toBeLessThan(toNano('0.1'))
      expect(excessValue).toBeGreaterThan(toNano('0.09'))

      // Final report, sent NoBounce: merkleRoot then sends the rest of its own balance (CARRY_ALL_BALANCE) to owner.
      const freezeTX = findTransaction(transactions, {
        from: merkleRoot.address,
        to: owner.address,
        inMessageBounceable: false,
        body: (b) => b !== undefined && b.bits.length === 0 && b.refs.length === 0,
      })
      if (!freezeTX) throw new Error('Freeze return transaction not found')
      const returnedValue = flattenTransaction(freezeTX).value
      if (returnedValue == undefined)
        throw new Error('Returned value not found in freeze transaction')

      expect(snap.before.balance).toBeGreaterThan(0n)
      expect(snap.after.balance).toEqual(0n)
      // The freeze only carries the root's own pre-tx balance (minus forward fees), not the
      // trigger value, which was returned as excess.
      expect(returnedValue).toBeGreaterThan(0n)
      expect(returnedValue).toBeLessThanOrEqual(snap.before.balance)
    })
  })
})
