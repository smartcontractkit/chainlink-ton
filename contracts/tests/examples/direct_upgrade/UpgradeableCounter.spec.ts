import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { UpgradeableCounterAdd } from '../../../wrappers/examples/direct_upgrade/UpgradeableCounterAdd';
import { UpgradeableCounterSub } from '../../../wrappers/examples/direct_upgrade/UpgradeableCounterSub';
import '@ton/test-utils';
import { kMaxLength } from 'buffer';
import { assert } from 'console';

describe('UpgradeableCounter', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<TreasuryContract>;
    let upgradeableCounter: SandboxContract<UpgradeableCounterAdd>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        owner = await blockchain.treasury('owner');

        upgradeableCounter = blockchain.openContract(await UpgradeableCounterAdd.fromInit(0n, owner.address, 0n, 0n));

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
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and upgradeableCounter are ready to use
    });

    it('should increase counter', async () => {
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
