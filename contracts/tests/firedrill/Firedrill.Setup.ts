import { Address, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { randomAddress } from '@ton/test-utils'
import { compile } from '@ton/blueprint'

import { FiredrillOnRamp } from '../../wrappers/firedrill/FiredrillOnRamp'
import { FiredrillOffRamp } from '../../wrappers/firedrill/FiredrillOffRamp'
import { FiredrillEntrypoint } from '../../wrappers/firedrill/FiredrillEntrypoint'
import { CrossChainAddress } from '../../wrappers/ccip/OffRamp'

import { generateRandomContractId } from '../../src/utils'

export const CHAINSEL_TON_TEST = 13879075125137744094n
export const TOKEN_ADDRESS = randomAddress()

export async function deployFiredrillOnRamp(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  opts?: {
    controlAddress?: Address
    chainSelector?: bigint
  },
) {
  const code = await compile('firedrill.onramp')
  const config = {
    id: generateRandomContractId(),
    controlAddress: opts?.controlAddress ?? owner.address,
    chainSelector: opts?.chainSelector ?? CHAINSEL_TON_TEST,
    tokenAddress: TOKEN_ADDRESS,
  }

  const onramp = blockchain.openContract(FiredrillOnRamp.createFromConfig(config, code))
  const deployer = await blockchain.treasury('deployer')
  await onramp.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { onramp, config }
}

export async function deployFiredrillOffRamp(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  opts?: {
    controlAddress?: Address
    chainSelector?: bigint
    onRampAddress?: CrossChainAddress
  },
) {
  const code = await compile('firedrill.offramp')
  const config = {
    id: generateRandomContractId(),
    controlAddress: opts?.controlAddress ?? owner.address,
    chainSelector: opts?.chainSelector ?? CHAINSEL_TON_TEST,
    onRampAddress: opts?.onRampAddress ?? CROSS_CHAIN_ONRAMP_ADDRESS,
  }

  const offramp = blockchain.openContract(FiredrillOffRamp.createFromConfig(config, code))
  const deployer = await blockchain.treasury('deployer')
  await offramp.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { offramp, config }
}

export async function deployFiredrillEntrypoint(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  opts?: {
    chainSelector?: bigint
    tokenAddress?: Address
  },
) {
  const code = await compile('firedrill.entrypoint')
  const config = {
    id: generateRandomContractId(),
    ownable: {
      owner: owner.address,
      pendingOwner: null,
    },
    chainSelector: opts?.chainSelector ?? CHAINSEL_TON_TEST,
    tokenAddress: opts?.tokenAddress ?? TOKEN_ADDRESS,
    firedrillContracts: undefined,
    sSendLast: 0n,
  }

  const entrypoint = blockchain.openContract(FiredrillEntrypoint.createFromConfig(config, code))
  const deployer = await blockchain.treasury('deployer')
  await entrypoint.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { entrypoint, config }
}

export async function setupFiredrill(blockchain: Blockchain) {
  const deployer = await blockchain.treasury('deployer')
  const tokenAddress = TOKEN_ADDRESS

  // Deploy Entrypoint with references to OnRamp and OffRamp
  const { entrypoint, config } = await deployFiredrillEntrypoint(blockchain, deployer, {
    tokenAddress,
  })

  // Deploy OnRamp and OffRamp first
  const { onramp } = await deployFiredrillOnRamp(blockchain, deployer, {
    controlAddress: entrypoint.address, // Will be updated to entrypoint later
  })

  const { offramp } = await deployFiredrillOffRamp(blockchain, deployer, {
    controlAddress: entrypoint.address, // Will be updated to entrypoint later
    onRampAddress: tonAddressToCrossChainAddress(onramp.address),
  })

  const initRampsResult = await entrypoint.sendInitRamps(
    deployer.getSender(),
    toNano('0.05'),
    onramp.address,
    offramp.address,
  )
  expect(initRampsResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: entrypoint.address,
    success: true,
  })

  return {
    deployer,
    entrypoint,
    onramp,
    offramp,
    tokenAddress,
    config,
  }
}

// Should be used for offramp unit tests only
export const CROSS_CHAIN_ONRAMP_ADDRESS = Buffer.from(
  '0xcafaae1bab0e7d637cba2f6a3b920185c93d95df',
  'hex',
)

const TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE = 36
export function tonAddressToCrossChainAddress(addr: Address): CrossChainAddress {
  const hash = addr.hash
  const slice = beginCell()
    .storeUint(0, 32) // basechain prefix
    .storeBuffer(hash, 32) // accountId (hash)
    .endCell()
    .beginParse()
  return slice.loadBuffer(TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE)
}
