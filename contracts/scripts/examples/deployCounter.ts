import { Counter } from '../../wrappers/examples/Counter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const cOunter = provider.open(await Counter.fromInit(1337n, 13n));
    await provider.waitForDeploy(cOunter.address);

    // run methods on `Counter`
}
