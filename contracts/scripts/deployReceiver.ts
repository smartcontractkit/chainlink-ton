import { Address, toNano } from '@ton/core'
import { compile, NetworkProvider } from '@ton/blueprint'
import { Receiver, ReceiverBehavior } from '../wrappers/ccip/Receiver'
import { generateRandomContractId } from '../src/utils'

export async function run(provider: NetworkProvider, args: string[]) {
  const [routerRaw] = args

  if (!routerRaw) {
    throw new Error(
      'Usage: yarn blueprint run deployReceiver --<network> --mnemonic <routerAddress>',
    )
  }

  const routerAddress = Address.parse(routerRaw)

  const receiverAddress = await deployReceiver(provider, routerAddress)

  console.log('✅ Receiver deployed at:', receiverAddress.toString())
}

export async function deployReceiver(
  provider: NetworkProvider,
  routerAddress: Address,
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
        authorizedCaller: routerAddress,
      },
      await compile('ccip.test.receiver'),
    ),
  )

  await receiver.sendDeploy(provider.sender(), toNano('0.5'))
  await provider.waitForDeploy(receiver.address)
  return receiver.address
}
