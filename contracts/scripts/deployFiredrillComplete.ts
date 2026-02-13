import { Address, toNano } from '@ton/core'
import { compile, NetworkProvider } from '@ton/blueprint'
import { FiredrillEntrypoint } from '../wrappers/firedrill/FiredrillEntrypoint'
import { FiredrillOnRamp } from '../wrappers/firedrill/FiredrillOnRamp'
import { FiredrillOffRamp } from '../wrappers/firedrill/FiredrillOffRamp'
import { generateRandomContractId, LINK_TOKEN } from '../src/utils'
import { tonAddressToCrossChainAddress } from '../tests/firedrill/Firedrill.Setup'
import { randomAddress } from '@ton/test-utils'

const CHAINSEL_TON = 1399300952838017768n
export async function run(provider: NetworkProvider) {
  // Compile contracts
  console.log('📦 Compiling contracts...')
  const entrypointCode = await compile('firedrill.entrypoint')
  const onRampCode = await compile('firedrill.onramp')
  const offRampCode = await compile('firedrill.offramp')
  console.log('✅ Contracts compiled')

  // Get deployer info
  const sender = provider.sender()
  const senderAddress = sender.address
  if (!senderAddress) {
    throw new Error('Sender address not available')
  }

  console.log(`\n🔑 Deployer address: ${senderAddress.toString()}`)

  // Prompt for token address
  const tokenAddressStr = await provider
    .ui()
    .input('Enter token address (or press Enter for default test address):')
  let tokenAddress: Address
  if (tokenAddressStr && tokenAddressStr.trim() !== '') {
    tokenAddress = Address.parse(tokenAddressStr.trim())
  } else {
    // Use a default test token address
    tokenAddress = LINK_TOKEN
    console.log(`Using default token address: ${tokenAddress.toString()}`)
  }

  console.log('\n🚀 Starting deployment...\n')

  // Step 1: Deploy Entrypoint first with random ramp addresses
  console.log('1  Deploying FiredrillEntrypoint...')
  const entrypointConfig = {
    id: generateRandomContractId(),
    ownable: {
      owner: senderAddress,
      pendingOwner: null,
    },
    chainSelector: CHAINSEL_TON,
    tokenAddress: tokenAddress,
    firedrillContracts: undefined,
    sSendLast: 0n,
  }

  const entrypoint = provider.open(
    FiredrillEntrypoint.createFromConfig(entrypointConfig, entrypointCode),
  )

  await entrypoint.sendDeploy(sender, toNano('0.1'))
  await provider.waitForDeploy(entrypoint.address)

  // Verify entrypoint deployed correctly
  const initialChainSelector = await entrypoint.getChainSelector()
  if (initialChainSelector !== CHAINSEL_TON) {
    throw new Error(
      `Entrypoint chain selector mismatch: expected ${CHAINSEL_TON}, got ${initialChainSelector}`,
    )
  }
  console.log(`✅ Entrypoint deployed at: ${entrypoint.address.toString()}\n`)

  // Step 2: Deploy OnRamp with entrypoint as control address
  console.log('2  Deploying FiredrillOnRamp...')
  const onRampConfig = {
    id: generateRandomContractId(),
    controlAddress: entrypoint.address,
    chainSelector: CHAINSEL_TON,
    tokenAddress: tokenAddress,
  }

  const onramp = provider.open(FiredrillOnRamp.createFromConfig(onRampConfig, onRampCode))

  await onramp.sendDeploy(sender, toNano('0.1'))
  await provider.waitForDeploy(onramp.address)

  // Verify onramp deployed correctly by checking static config
  try {
    const onrampStaticConfig = await onramp.getStaticConfig()
  } catch (e) {
    throw new Error('OnRamp deployment verification failed: could not read static config', e)
  }
  console.log(`✅ OnRamp deployed at: ${onramp.address.toString()}\n`)

  // Step 3: Deploy OffRamp with entrypoint as control address and OnRamp cross-chain address
  console.log('3  Deploying FiredrillOffRamp...')
  const offRampConfig = {
    id: generateRandomContractId(),
    controlAddress: entrypoint.address,
    chainSelector: CHAINSEL_TON,
    onRampAddress: tonAddressToCrossChainAddress(onramp.address),
  }

  const offramp = provider.open(FiredrillOffRamp.createFromConfig(offRampConfig, offRampCode))

  await offramp.sendDeploy(sender, toNano('0.1'))
  await provider.waitForDeploy(offramp.address)

  console.log(`✅ OffRamp deployed at: ${offramp.address.toString()}\n`)

  // Step 4: Update ramp addresses in entrypoint
  console.log('4  Updating ramp addresses in Entrypoint...')
  await entrypoint.sendInitRamps(sender, toNano('0.05'), onramp.address, offramp.address)

  // Verify ramps were set correctly
  const setOnRampAddress = await entrypoint.getOnRampAddress()
  const setOffRampAddress = await entrypoint.getOffRampAddress()
  if (!setOnRampAddress.equals(onramp.address)) {
    throw new Error(
      `OnRamp address not set correctly in Entrypoint: expected ${onramp.address.toString()}, got ${setOnRampAddress.toString()}`,
    )
  }
  if (!setOffRampAddress.equals(offramp.address)) {
    throw new Error(
      `OffRamp address not set correctly in Entrypoint: expected ${offramp.address.toString()}, got ${setOffRampAddress.toString()}`,
    )
  }
  console.log('✅ Ramp addresses updated in Entrypoint\n')

  await delay(10000)
  // Verify deployment
  console.log('🔍 Verifying deployment...')
  const chainSelector = await entrypoint.getChainSelector()
  const onRampAddress = await entrypoint.getOnRampAddress()
  const offRampAddress = await entrypoint.getOffRampAddress()
  const owner = await entrypoint.getOwner()

  console.log('\n📋 Deployment Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Entrypoint:     ${entrypoint.address.toString()}`)
  console.log(`OnRamp:         ${onramp.address.toString()}`)
  console.log(`OffRamp:        ${offramp.address.toString()}`)
  console.log(`Chain Selector: ${chainSelector}`)
  console.log(`Token Address:  ${tokenAddress.toString()}`)
  console.log(`Owner:          ${owner.toString()}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Verify ramps are correctly set
  if (onRampAddress.equals(onramp.address) && offRampAddress.equals(offramp.address)) {
    console.log('\n✅ All contracts deployed and configured successfully!')
  } else {
    console.log('\n⚠️  Warning: Ramps may not be correctly set in entrypoint')
    console.log(`   Expected OnRamp:  ${onramp.address.toString()}`)
    console.log(`   Actual OnRamp:    ${onRampAddress.toString()}`)
    console.log(`   Expected OffRamp: ${offramp.address.toString()}`)
    console.log(`   Actual OffRamp:   ${offRampAddress.toString()}`)
  }
}
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
