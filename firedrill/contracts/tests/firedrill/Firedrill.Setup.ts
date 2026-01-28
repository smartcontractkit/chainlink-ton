import { Address, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { randomAddress } from '@ton/test-utils'
import { compile } from '@ton/blueprint'

import { FiredrillOnRamp } from '../../wrappers/FiredrillOnRamp'
import { FiredrillOffRamp } from '../../wrappers/FiredrillOffRamp'
import { FiredrillEntrypoint } from '../../wrappers/FiredrillEntrypoint'
import { CrossChainAddress } from '../../../../contracts/wrappers/ccip/OffRamp'

import { generateRandomContractId } from '../../../../contracts/src/utils'

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
    firedrillOnRamp?: Address
    firedrillOffRamp?: Address
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
    firedrillContracts: {
      firedrillOnRamp: opts?.firedrillOnRamp ?? randomAddress(),
      firedrillOffRamp: opts?.firedrillOffRamp ?? randomAddress(),
    },
    sSendLast: 0n,
  }

  const entrypoint = blockchain.openContract(FiredrillEntrypoint.createFromConfig(config, code))
  const deployer = await blockchain.treasury('deployer')
  await entrypoint.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { entrypoint, config }
}

export const CROSS_CHAIN_ONRAMP_ADDRESS = Buffer.from("0xcafaae1bab0e7d637cba2f6a3b920185c93d95df", "hex")

export const CROSS_CHAIN_OFFRAMP_ADDRESS = Buffer.from("0x0ed77acda17beaff5e2a6b66eeeb791e8a1bc0a7", "hex")


export async function setupFiredrill(blockchain: Blockchain) {
  const deployer = await blockchain.treasury('deployer')
  const tokenAddress = TOKEN_ADDRESS

  // Deploy OnRamp and OffRamp first
  const { onramp } = await deployFiredrillOnRamp(blockchain, deployer, {
    controlAddress: deployer.address, // Will be updated to entrypoint later
  })

  const { offramp } = await deployFiredrillOffRamp(blockchain, deployer, {
    controlAddress: deployer.address, // Will be updated to entrypoint later
    onRampAddress: CROSS_CHAIN_ONRAMP_ADDRESS,
  })

  // Deploy Entrypoint with references to OnRamp and OffRamp
  const { entrypoint, config } = await deployFiredrillEntrypoint(blockchain, deployer, {
    tokenAddress,
    firedrillOnRamp: onramp.address,
    firedrillOffRamp: offramp.address,
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
