import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { Get, Getter } from '../../../build/Getter/tact_Getter';
import { UpgradeableCounterAdd } from '../../../build/UpgradeableCounterAdd/tact_UpgradeableCounterAdd';
import { storeStateV2, UpgradeableCounterSub } from '../../../build/UpgradeableCounterSub/tact_UpgradeableCounterSub';
import { HeaderUpgradeable, InitParams } from '../../../build/UpgradeableCounterSub/tact_UpgradeableCounterAdd';

async function setUpTest(i: bigint): Promise<{
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    owner: SandboxContract<TreasuryContract>,
    upgradeableCounter: SandboxContract<UpgradeableCounterAdd>,
    getter: SandboxContract<Getter>,
}> {
    // Verbosity = 'none' | 'vm_logs' | 'vm_logs_location' | 'vm_logs_gas' | 'vm_logs_full' | 'vm_logs_verbose';
    let blockchain = await Blockchain.create();
    blockchain.verbosity = {
        print: true,
        blockchainLogs: false,
        vmLogs: 'vm_logs',
        debugLogs: true,
    };

    let deployer = await blockchain.treasury('deployer');
    let owner = await blockchain.treasury('owner');

    let upgradeableCounter = blockchain.openContract(await UpgradeableCounterAdd.fromInit(0n, owner.address, i));

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

describe('UpgradeableCounter', () => {

    it('should deploy', async () => {
        await setUpTest(0n);
    });

    // it('should deploy on version 1', async () => {
    //     let {
    //         upgradeableCounter,
    //     } = await setUpTest(0n);
    //     const version = await upgradeableCounter.getVersion();
    //     expect(version).toBe(1n);
    // }, 100000);

    // it('should have initial value', async () => {
    //     let {
    //         blockchain,
    //         upgradeableCounter,
    //         getter,
    //     } = await setUpTest(0n);
    //     const user = await blockchain.treasury('user');
    //     await assertCount(upgradeableCounter, getter, user.getSender(), 0n);
    // }, 100000);

    // it('version 1 should increase counter', async () => {
    //     let {
    //         blockchain,
    //         upgradeableCounter,
    //         owner,
    //         getter,
    //     } = await setUpTest(0n);
    //     const increaseTimes = 3;
    //     for (let i = 0; i < increaseTimes; i++) {
    //         const increaser = await blockchain.treasury('increaser' + i);
    //         const counterBefore = await getCount(getter, owner.getSender(), upgradeableCounter);
    //         const increaseBy = BigInt(1);

    //         let increaseResult = await upgradeableCounter.send(
    //             increaser.getSender(),
    //             {
    //                 value: toNano('0.05'),
    //             },
    //             {
    //                 $$type: 'Step',
    //                 queryId: BigInt(Math.floor(Math.random() * 10000)),
    //             }
    //         );

    //         expect(increaseResult.transactions).toHaveTransaction({
    //             from: increaser.address,
    //             to: upgradeableCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableCounter, getter, owner.getSender(), counterBefore + increaseBy);
    //     }
    // }, 100000);

    // it('should be upgraded to version 2 after commit', async () => {
    //     let {
    //         owner,
    //         upgradeableCounter,
    //         getter,
    //     } = await setUpTest(0n);
    //     let header: HeaderUpgradeable = {
    //         $$type: "HeaderUpgradeable",
    //         owner: owner.address,
    //         _version: 2n,
    //     }
    //     let initParams: InitParams = {
    //         $$type: "InitParams",
    //         header: header,
    //         stateToBeMigrated: beginCell().endCell(),
    //     }
    //     let substractorCounter = (await UpgradeableCounterSub.fromInit(initParams)).init;
    //     if (substractorCounter == null) {
    //         throw new Error('init is null');
    //     }
    //     let substractorCounterCode = substractorCounter.code;
    //     let upgradeResult = await
    //         upgradeableCounter.send(
    //             owner.getSender(),
    //             {
    //                 value: toNano('0.05'),
    //             },
    //             {
    //                 $$type: 'Upgrade',
    //                 code: substractorCounterCode,
    //             }
    //         )
    //     expect(upgradeResult.transactions).toHaveTransaction({
    //         from: owner.address,
    //         to: upgradeableCounter.address,
    //         success: true,
    //     });

    //     const sameVersion = await upgradeableCounter.getVersion();
    //     expect(sameVersion).toBe(1n);

    //     let CommitUpgradeResult = await
    //         upgradeableCounter.send(
    //             owner.getSender(),
    //             {
    //                 value: toNano('0.05'),
    //             },
    //             {
    //                 $$type: 'CommitUpgrade',
    //             }
    //         )
    //     expect(CommitUpgradeResult.transactions).toHaveTransaction({
    //         from: owner.address,
    //         to: upgradeableCounter.address,
    //         success: true,
    //     });

    //     const version = await upgradeableCounter.getVersion();
    //     expect(version).toBe(2n);
    // }, 100000);

    // it('uncommited version 2 should increase counter', async () => {
    //     let {
    //         blockchain,
    //         upgradeableCounter,
    //         owner,
    //         getter,
    //     } = await setUpTest(0n);

    //     await upgradeCounter(owner, upgradeableCounter, await createSubCounterInit(owner));

    //     const increaseTimes = 3;
    //     for (let i = 0; i < increaseTimes; i++) {
    //         const increaser = await blockchain.treasury('increaser' + i);
    //         const counterBefore = await getCount(getter, owner.getSender(), upgradeableCounter);
    //         const increaseBy = BigInt(1);

    //         let increaseResult = await upgradeableCounter.send(
    //             increaser.getSender(),
    //             {
    //                 value: toNano('0.05'),
    //             },
    //             {
    //                 $$type: 'Step',
    //                 queryId: BigInt(Math.floor(Math.random() * 10000)),
    //             }
    //         );

    //         expect(increaseResult.transactions).toHaveTransaction({
    //             from: increaser.address,
    //             to: upgradeableCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableCounter, getter, owner.getSender(), counterBefore + increaseBy);
    //     }
    // }, 100000);

    // it('version 2 should decrease de counter', async () => {
    //     let {
    //         blockchain,
    //         owner,
    //         upgradeableCounter,
    //         getter,
    //     } = await setUpTest(3n);

    //     await upgradeCounter(owner, upgradeableCounter, await createSubCounterInit(owner));
    //     await commitCounterUpgrade(owner, upgradeableCounter);

    //     const decreaseTimes = 3;
    //     for (let i = 0; i < decreaseTimes; i++) {
    //         const decreaser = await blockchain.treasury('decreaser' + i);

    //         const counterBefore = await getCount(getter, owner.getSender(), upgradeableCounter);
    //         const decreaseBy = BigInt(1);

    //         let decreaseResult = await upgradeableCounter.send(
    //             decreaser.getSender(),
    //             {
    //                 value: toNano('0.05'),
    //             },
    //             {
    //                 $$type: 'Step',
    //                 queryId: BigInt(Math.floor(Math.random() * 10000)),
    //             }
    //         );

    //         expect(decreaseResult.transactions).toHaveTransaction({
    //             from: decreaser.address,
    //             to: upgradeableCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableCounter, getter, owner.getSender(), counterBefore - decreaseBy);
    //     }
    // }, 100000);

    // it('backroll should take us back to version 1 and it should increase de counter', async () => {
    //     let {
    //         blockchain,
    //         owner,
    //         upgradeableCounter,
    //         getter,
    //     } = await setUpTest(3n);

    //     await upgradeCounter(owner, upgradeableCounter, await createSubCounterInit(owner));
    //     await commitCounterUpgrade(owner, upgradeableCounter);

    //     const version2 = await upgradeableCounter.getVersion();
    //     expect(version2).toBe(2n);

    //     await rollbackUpgrade(owner, upgradeableCounter);

    //     const version1 = await upgradeableCounter.getVersion();
    //     expect(version1).toBe(1n);

    //     const increaseTimes = 3;
    //     for (let i = 0; i < increaseTimes; i++) {
    //         const increaser = await blockchain.treasury('increaser' + i);
    //         const counterBefore = await upgradeableCounter.getCounter();
    //         const increaseBy = BigInt(1);

    //         let increaseResult = await upgradeableCounter.send(
    //             increaser.getSender(),
    //             {
    //                 value: toNano('0.05'),
    //             },
    //             {
    //                 $$type: 'Step',
    //                 queryId: BigInt(Math.floor(Math.random() * 10000)),
    //             }
    //         );

    //         expect(increaseResult.transactions).toHaveTransaction({
    //             from: increaser.address,
    //             to: upgradeableCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableCounter, getter, owner.getSender(), counterBefore + increaseBy);
    //     }
    // }, 100000);
});

async function createSubCounterInit(owner: SandboxContract<TreasuryContract>): Promise<Cell> {
    let header: HeaderUpgradeable = {
        $$type: "HeaderUpgradeable",
        owner: owner.address,
        _version: 0n,
    }
    let initParams: InitParams = {
        $$type: "InitParams",
        header: header,
        stateToBeMigrated: beginCell().endCell(),
    }
    let init = (await UpgradeableCounterSub.fromInit(initParams)).init;
    if (init == null) {
        throw new Error('init is null');
    }
    return init.code
}

async function commitCounterUpgrade(owner: SandboxContract<TreasuryContract>, upgradeableCounter: SandboxContract<UpgradeableCounterAdd>) {
    let CommitUpgradeResult = await upgradeableCounter.send(
        owner.getSender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'CommitUpgrade',
        }
    );
    expect(CommitUpgradeResult.transactions).toHaveTransaction({
        from: owner.address,
        to: upgradeableCounter.address,
        success: true,
    });
}

async function upgradeCounter(owner: SandboxContract<TreasuryContract>, upgradeableCounter: SandboxContract<UpgradeableCounterAdd>, code: Cell) {
    let upgradeResult = await upgradeableCounter.send(
        owner.getSender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Upgrade',
            code: code,
        }
    );
    expect(upgradeResult.transactions).toHaveTransaction({
        from: owner.address,
        to: upgradeableCounter.address,
        success: true,
    });
}

async function assertCount(upgradeableCounter: SandboxContract<UpgradeableCounterAdd>, getter: SandboxContract<Getter>, sender: Treasury, expectedCount: bigint) {
    const getterResult = await getCount(getter, sender, upgradeableCounter);
    console.log('getterResult', getterResult);
    console.log('expectedCount', expectedCount);
    expect(getterResult).toBe(expectedCount);
}

async function getCount(getter: SandboxContract<Getter>, sender: Treasury, upgradeableCounter: SandboxContract<UpgradeableCounterAdd>) {
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
    );

    expect(getterDeployResult.transactions).toHaveTransaction({
        from: sender.address,
        to: getter.address,
        deploy: false,
        success: true,
    });

    const getterResult = await getter.getResponse();
    return getterResult;
}

