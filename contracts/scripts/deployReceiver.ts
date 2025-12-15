import { Address, toNano } from '@ton/core'
import { compile, NetworkProvider } from '@ton/blueprint'
import { Receiver, ReceiverBehavior } from '../wrappers/ccip/Receiver'
import { generateRandomContractId } from '../src/utils'

export async function run(provider: NetworkProvider, args: string[]) {
  const [offRampRaw] = args

  if (!offRampRaw) {
    throw new Error(
      'Usage: yarn blueprint run deployReceiver --<network> --mnemonic <offRampAddress>',
    )
  }

  const offRampAddress = Address.parse(offRampRaw)

  const receiverAddress = await deployReceiver(provider, offRampAddress)

  console.log('✅ Receiver deployed at:', receiverAddress.toString())
}

export async function deployReceiver(
  provider: NetworkProvider,
  offRampAddress: Address,
): Promise<Address> {
  const deployer = provider.sender().address!
  const receiver = provider.open(
    Receiver.createFromConfig(
      {
        id: generateRandomContractId(),
        behavior: ReceiverBehavior.RejectAll,
        ownable: {
          owner: deployer,
          pendingOwner: null,
        },
        authorizedCaller: offRampAddress,
      },
      await compile('ccip.test.receiver'),
    ),
  )

  await receiver.sendDeploy(provider.sender(), toNano('0.5'))
  await provider.waitForDeploy(receiver.address)
  return receiver.address
}
