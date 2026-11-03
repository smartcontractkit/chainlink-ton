import { Address, beginCell, Cell, contractAddress, toNano } from '@ton/core'
import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { computeAddress, randomBytes, SigningKey } from 'ethers'

import * as mcms from '../../../wrappers/mcms/MCMS'
import { generateRandomContractId } from '../../../src/utils'
import { merkleProof } from '../../../src/mcms'

import { MCMS_VERSIONS, McmsVersion } from './versions'

export const CHAIN_ID = -239n
export const COMPUTE_GAS_LIMIT = 1_000_000n
export const DEFAULT_VALUE = toNano('2')

export type LimitsSigner = {
  address: string
  keyPair: SigningKey
  index: number
  group: number
}

export type GroupLayout = {
  groupQuorums: Map<number, number>
  groupParents: Map<number, number>
  groupForIndex: (index: number) => number
}

export type Outcome = {
  gasUsed: bigint
  exitCode: number
  result: SendMessageResult
}

export function flatGroupLayout(options: {
  activeGroups: number
  groupQuorum?: number
  rootQuorum?: number
}): GroupLayout {
  const { activeGroups, groupQuorum = 1, rootQuorum = 2 } = options
  if (activeGroups < 1 || activeGroups > mcms.NUM_GROUPS - 1) {
    throw new Error(`activeGroups ${activeGroups} is outside 1..${mcms.NUM_GROUPS - 1}`)
  }
  const groupQuorums = new Map<number, number>()
  const groupParents = new Map<number, number>()

  for (let group = 0; group < mcms.NUM_GROUPS; group++) {
    groupQuorums.set(group, group === 0 ? rootQuorum : group <= activeGroups ? groupQuorum : 0)
    groupParents.set(group, 0)
  }

  return {
    groupQuorums,
    groupParents,
    groupForIndex: (index) => (index % activeGroups) + 1,
  }
}

export function makeSigners(count: number, layout: GroupLayout): LimitsSigner[] {
  const keyPairs = Array.from({ length: count }, () => new SigningKey(randomBytes(32)))
  keyPairs.sort((a, b) => {
    const aAddress = BigInt(computeAddress(a))
    const bAddress = BigInt(computeAddress(b))
    return aAddress < bAddress ? -1 : aAddress > bAddress ? 1 : 0
  })

  return keyPairs.map((keyPair, index) => ({
    address: computeAddress(keyPair),
    keyPair,
    index,
    group: layout.groupForIndex(index),
  }))
}

export function buildStorageConfig(
  signers: LimitsSigner[],
  layout: GroupLayout,
): Pick<mcms.ContractData, 'signers' | 'config'> {
  const signersByAddress = new Map<bigint, Buffer>()
  const signersByIndex = new Map<number, Buffer>()

  for (const signer of signers) {
    const signerData = mcms.builder.data.signer
      .encode({ address: BigInt(signer.address), index: signer.index, group: signer.group })
      .asCell()
    const signerBytes = signerData.beginParse().loadBuffer(mcms.LEN_SIGNER_BYTES)
    signersByAddress.set(BigInt(signer.address), signerBytes)
    signersByIndex.set(signer.index, signerBytes)
  }

  return {
    signers: signersByAddress,
    config: {
      signers: signersByIndex,
      groupQuorums: layout.groupQuorums,
      groupParents: layout.groupParents,
    },
  }
}

export function makeRootMetadata(
  mcmsAddress: Address,
  preOpCount: bigint,
  postOpCount: bigint,
  overridePreviousRoot = false,
): mcms.RootMetadata {
  return {
    chainId: CHAIN_ID,
    multiSig: mcmsAddress,
    preOpCount,
    postOpCount,
    overridePreviousRoot,
  }
}

export function makeOps(mcmsAddress: Address, count: number, value = 0n): mcms.Op[] {
  return Array.from({ length: count }, (_, nonce) => ({
    chainId: CHAIN_ID,
    multiSig: mcmsAddress,
    nonce: BigInt(nonce),
    to: mcmsAddress,
    value,
    data: Cell.EMPTY,
  }))
}

export class McmsLimitsHarness {
  private constructor(
    readonly version: McmsVersion,
    readonly blockchain: Blockchain,
    readonly owner: SandboxContract<TreasuryContract>,
    readonly mcms: SandboxContract<mcms.ContractClient>,
  ) {}

  static async create(options: {
    version: McmsVersion
    blockchain?: Blockchain
    ownerSeed?: string
    initialConfig?: { signers: LimitsSigner[]; layout: GroupLayout }
  }): Promise<McmsLimitsHarness> {
    const { version, blockchain = await Blockchain.create(), ownerSeed, initialConfig } = options
    blockchain.now = 1

    const owner = await blockchain.treasury(
      ownerSeed ?? `limits-owner-${generateRandomContractId()}`,
    )
    const code = await MCMS_VERSIONS[version].loadCode()
    const data = mcms.builder.data.contractDataEmpty(
      Number(generateRandomContractId()),
      owner.address,
    )
    if (initialConfig) {
      Object.assign(data, buildStorageConfig(initialConfig.signers, initialConfig.layout))
    }
    const init = { code, data: MCMS_VERSIONS[version].encodeStorage(data) }
    const contract = blockchain.openContract(
      new mcms.ContractClient(contractAddress(0, init), init),
    )

    return new McmsLimitsHarness(version, blockchain, owner, contract)
  }

  async send(body: Cell, value = DEFAULT_VALUE): Promise<Outcome> {
    const result = await this.mcms.sendInternal(this.owner.getSender(), value, body)
    const tx = result.transactions.find(
      (candidate) =>
        candidate.inMessage?.info.type === 'internal' &&
        candidate.inMessage.info.dest.equals(this.mcms.address),
    )
    if (!tx || tx.description.type !== 'generic' || tx.description.computePhase.type !== 'vm') {
      throw new Error('Expected an MCMS VM transaction')
    }

    const { gasUsed, exitCode } = tx.description.computePhase
    return { gasUsed, exitCode, result }
  }

  async deploy(): Promise<Outcome> {
    return this.send(Cell.EMPTY)
  }

  async setConfig(
    signers: LimitsSigner[],
    layout: GroupLayout,
    options: { clearRoot?: boolean; value?: bigint } = {},
  ): Promise<Outcome> {
    const body = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: signers.map((signer) => BigInt(signer.address)),
        signerGroups: signers.map((signer) => signer.group),
        groupQuorums: layout.groupQuorums,
        groupParents: layout.groupParents,
        clearRoot: options.clearRoot ?? false,
      })
      .asCell()

    return this.send(body, options.value)
  }

  async setRoot(options: {
    signingSigners: LimitsSigner[]
    validUntil: bigint
    metadata: mcms.RootMetadata
    ops: mcms.Op[]
    value?: bigint
  }): Promise<{ outcome: Outcome; opProofs: bigint[][] }> {
    const [setRoot, opProofs] = merkleProof.build(
      options.signingSigners.map((signer) => signer.keyPair),
      options.validUntil,
      options.metadata,
      options.ops,
    )

    const outcome = await this.send(
      mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
      options.value,
    )
    return { outcome, opProofs }
  }

  async execute(op: mcms.Op, proof: bigint[], value = DEFAULT_VALUE): Promise<Outcome> {
    const body = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(op).asCell(),
        proof,
      })
      .asCell()
    return this.send(body, value)
  }

  async getTypeAndVersion(): Promise<[string, string]> {
    return this.mcms.getTypeAndVersion()
  }

  async getConfig(): Promise<mcms.Config> {
    return this.mcms.getConfig()
  }

  async getRoot(): Promise<[bigint, bigint]> {
    return this.mcms.getRoot()
  }
}
