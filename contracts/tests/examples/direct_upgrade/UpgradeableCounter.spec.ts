import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { UpgradeableCounterAdd } from '../../../wrappers/examples/direct_upgrade/UpgradeableCounterAdd';
import { UpgradeableCounterSub } from '../../../wrappers/examples/direct_upgrade/UpgradeableCounterSub';
import '@ton/test-utils';

async function setUpTest(i: bigint): Promise<{
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    owner: SandboxContract<TreasuryContract>,
    upgradeableCounter: SandboxContract<UpgradeableCounterAdd>,
}> {
    let blockchain = await Blockchain.create();

    let deployer = await blockchain.treasury('deployer');
    let owner = await blockchain.treasury('owner');

    let upgradeableCounter = blockchain.openContract(await UpgradeableCounterAdd.fromInit(0n, owner.address, 1n, i));

    const deployResult = await upgradeableCounter.send(
        deployer.getSender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    expect(deployResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: upgradeableCounter.address,
        deploy: true,
        success: true,
    });

    return {
        blockchain,
        deployer,
        owner,
        upgradeableCounter,
    }
};

describe('UpgradeableCounter', () => {

    it('should deploy', async () => {
        await setUpTest(0n);
    });

    it('should deploy on version 1', async () => {
        let {
            upgradeableCounter,
        } = await setUpTest(0n);
        const version = await upgradeableCounter.getVersion();
        expect(version).toBe(1n);
    });

    it('version 1 should increase counter', async () => {
        let {
            blockchain,
            upgradeableCounter,
        } = await setUpTest(0n);
        const increaseTimes = 3;
        for (let i = 0; i < increaseTimes; i++) {
            console.log(`increase ${i + 1}/${increaseTimes}`);

            const increaser = await blockchain.treasury('increaser' + i);

            const counterBefore = await upgradeableCounter.getCounter();

            console.log('counter before increasing', counterBefore);

            const increaseBy = BigInt(1);

            let increaseResult = await upgradeableCounter.send(
                increaser.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'Step',
                    queryId: BigInt(Math.floor(Math.random() * 10000)),
                }
            );

            expect(increaseResult.transactions).toHaveTransaction({
                from: increaser.address,
                to: upgradeableCounter.address,
                success: true,
            });

            const counterAfter = await upgradeableCounter.getCounter();

            console.log('counter after increasing', counterAfter);

            expect(counterAfter).toBe(counterBefore + increaseBy);
        }
    });

    it('should be upgraded to version 2', async () => {
        let {
            owner,
            upgradeableCounter,
        } = await setUpTest(0n);
        let substractorCounter = await UpgradeableCounterSub.fromInit(0n, owner.address, 0n, 0n);
        if (substractorCounter.init == null) {
            throw new Error('init is null');
        }
        let substractorCounterCode = substractorCounter.init.code
        let upgradeResult = await
            upgradeableCounter.send(
                owner.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'Upgrade',
                    code: substractorCounterCode,
                    data: null,
                }
            )
        expect(upgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableCounter.address,
            success: true,
        });

        const version = await upgradeableCounter.getVersion();
        expect(version).toBe(2n);
    });

    it('upgrade should conserve the internal state', async () => {
        const initialValue = 10n;
        let {
            owner,
            upgradeableCounter,
        } = await setUpTest(initialValue);
        const initialId = await upgradeableCounter.getId();
        let substractorCounter = await UpgradeableCounterSub.fromInit(0n, owner.address, 0n, 0n);
        if (substractorCounter.init == null) {
            throw new Error('init is null');
        }
        let substractorCounterCode = substractorCounter.init.code
        let upgradeResult = await
            upgradeableCounter.send(
                owner.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'Upgrade',
                    code: substractorCounterCode,
                    data: null,
                }
            )
        expect(upgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableCounter.address,
            success: true,
        });

        const counter = await upgradeableCounter.getCounter();
        expect(counter).toBe(initialValue);
        const newId = await upgradeableCounter.getId();
        expect(newId).toBe(initialId);
    });


    it('version 2 should decrease de counter', async () => {
        let {
            blockchain,
            owner,
            upgradeableCounter,
        } = await setUpTest(3n);
        let substractorCounter = await UpgradeableCounterSub.fromInit(0n, owner.address, 0n, 0n);
        if (substractorCounter.init == null) {
            throw new Error('init is null');
        }
        let substractorCounterCode = substractorCounter.init.code
        let upgradeResult = await
            upgradeableCounter.send(
                owner.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'Upgrade',
                    code: substractorCounterCode,
                    data: null,
                }
            )
        expect(upgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableCounter.address,
            success: true,
        });


        const decreaseTimes = 3;
        for (let i = 0; i < decreaseTimes; i++) {
            console.log(`decrease ${i + 1}/${decreaseTimes}`);

            const decreaser = await blockchain.treasury('decreaser' + i);

            const counterBefore = await upgradeableCounter.getCounter();

            console.log('counter before increasing', counterBefore);

            const decreaseBy = BigInt(1);

            let decreaseResult = await upgradeableCounter.send(
                decreaser.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'Step',
                    queryId: BigInt(Math.floor(Math.random() * 10000)),
                }
            );

            expect(decreaseResult.transactions).toHaveTransaction({
                from: decreaser.address,
                to: upgradeableCounter.address,
                success: true,
            });

            const counterAfter = await upgradeableCounter.getCounter();

            console.log('counter after increasing', counterAfter);

            expect(counterAfter).toBe(counterBefore - decreaseBy);
        }


    });
});
