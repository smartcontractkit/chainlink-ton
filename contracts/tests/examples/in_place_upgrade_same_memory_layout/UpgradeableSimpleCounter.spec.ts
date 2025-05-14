import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { UpgradeableSimpleCounterAdd } from '../../../wrappers/examples/in_place_upgrade_same_memory_layout/UpgradeableSimpleCounterAdd';
import { UpgradeableSimpleCounterSub } from '../../../wrappers/examples/in_place_upgrade_same_memory_layout/UpgradeableSimpleCounterSub';
import '@ton/test-utils';
import { Get, Getter } from '../../../build/Getter/tact_Getter';
// import { sleep } from '@ton/blueprint';

async function setUpTest(i: bigint): Promise<{
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    owner: SandboxContract<TreasuryContract>,
    upgradeableCounter: SandboxContract<UpgradeableSimpleCounterAdd>,
    getter: SandboxContract<Getter>,
}> {
    // Verbosity = 'none' | 'vm_logs' | 'vm_logs_location' | 'vm_logs_gas' | 'vm_logs_full' | 'vm_logs_verbose';
    let blockchain = await Blockchain.create();
    blockchain.verbosity = {
        print: true,
        blockchainLogs: false,
        vmLogs: 'none',
        debugLogs: true,
    };

    let deployer = await blockchain.treasury('deployer');
    let owner = await blockchain.treasury('owner');

    let upgradeableCounter = blockchain.openContract(await UpgradeableSimpleCounterAdd.fromInit(0n, owner.address, 1n, i));

    const counterDeployResult = await upgradeableCounter.send(
        deployer.getSender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    expect(counterDeployResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: upgradeableCounter.address,
        deploy: true,
        success: true,
    });

    let getter = blockchain.openContract(await Getter.fromInit(0n, owner.address, 0n));

    const getterDeployResult = await getter.send(
        deployer.getSender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    expect(getterDeployResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: getter.address,
        deploy: true,
        success: true,
    });


    return {
        blockchain,
        deployer,
        owner,
        upgradeableCounter,
        getter,
    }
};

describe('UpgradeableSimpleCounter', () => {

    it('should deploy', async () => {
        await setUpTest(0n);
    });

    it('should deploy on version 1', async () => {
        let {
            upgradeableCounter,
        } = await setUpTest(0n);
        const version = await upgradeableCounter.getVersion();
        expect(version).toBe(1n);
    }, 100000);

    it('should have initial value', async () => {
        let {
            blockchain,
            upgradeableCounter,
            getter,
        } = await setUpTest(0n);
        const user = await blockchain.treasury('user');
        await assertCount(upgradeableCounter, getter, user.getSender(), 0n);
    }, 100000);

    it('version 1 should increase counter', async () => {
        let {
            blockchain,
            upgradeableCounter,
            owner,
            getter,
        } = await setUpTest(0n);
        const increaseTimes = 3;
        for (let i = 0; i < increaseTimes; i++) {
            const increaser = await blockchain.treasury('increaser' + i);
            const counterBefore = await upgradeableCounter.getCounter();
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

            await assertCount(upgradeableCounter, getter, owner.getSender(), counterBefore + increaseBy);
        }
    }, 100000);

    it('should be upgraded to version 2', async () => {
        let {
            owner,
            upgradeableCounter,
            getter,
        } = await setUpTest(0n);
        let substractorCounter = await UpgradeableSimpleCounterSub.fromInit(0n, owner.address, 0n, 0n);
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
                }
            )
        expect(upgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableCounter.address,
            success: true,
        });

        const version = await upgradeableCounter.getVersion();
        expect(version).toBe(2n);
    }, 100000);

    it('upgrade should conserve the internal state', async () => {
        const initialValue = 10n;
        let {
            owner,
            upgradeableCounter,
            getter,
        } = await setUpTest(initialValue);
        const initialId = await upgradeableCounter.getId();
        let substractorCounter = await UpgradeableSimpleCounterSub.fromInit(0n, owner.address, 0n, 0n);
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
                }
            )
        expect(upgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableCounter.address,
            success: true,
        });

        await assertCount(upgradeableCounter, getter, owner.getSender(), initialValue);
        const newId = await upgradeableCounter.getId();
        expect(newId).toBe(initialId);
    }, 100000);

    it('version 2 should decrease de counter', async () => {
        let {
            blockchain,
            owner,
            upgradeableCounter,
            getter,
        } = await setUpTest(3n);
        let substractorCounter = await UpgradeableSimpleCounterSub.fromInit(0n, owner.address, 0n, 0n);
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
                }
            )
        expect(upgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableCounter.address,
            success: true,
        });


        const decreaseTimes = 3;
        for (let i = 0; i < decreaseTimes; i++) {
            const decreaser = await blockchain.treasury('decreaser' + i);

            const counterBefore = await upgradeableCounter.getCounter();
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

            await assertCount(upgradeableCounter, getter, owner.getSender(), counterBefore - decreaseBy);
        }
    }, 100000);
});

async function assertCount(upgradeableCounter: SandboxContract<UpgradeableSimpleCounterAdd>, getter: SandboxContract<Getter>, sender: Treasury, expectedCount: bigint) {
    const counter = await upgradeableCounter.getCounter();
    expect(counter).toBe(expectedCount);
    const getterDeployResult = await getter.send(
        sender,
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Get',
            queryId: BigInt(Math.floor(Math.random() * 10000)),
            opcode: 0n,
            Address: upgradeableCounter.address,
        }
    )

    expect(getterDeployResult.transactions).toHaveTransaction({
        from: sender.address,
        to: getter.address,
        deploy: false,
        success: true,
    });

    const getterResult = await getter.getResponse();
    console.log('getterResult', getterResult);
    expect(getterResult).toBe(expectedCount);
}

