import { Counter } from '../../wrappers/examples/Counter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const counter = provider.open(await Counter.fromInit(1337n, 13n));
    await provider.waitForDeploy(counter.address);

    // run methods on `Counter`
}
