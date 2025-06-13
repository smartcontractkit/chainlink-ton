import { OwnableCounter } from '../wrappers/lib/access/OwnableCounter'
import { NetworkProvider } from '@ton/blueprint'

export async function run(provider: NetworkProvider) {
  const counter = provider.open(await OwnableCounter.fromInit(1337n, 13n))
  await provider.waitForDeploy(counter.address)

  // run methods on `Counter`
}
