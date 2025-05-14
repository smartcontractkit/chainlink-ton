import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { Get, Getter } from '../../../build/Getter/tact_Getter';
import { UpgradeableGBCounterAdd } from '../../../build/UpgradeableGBCounterAdd/tact_UpgradeableGBCounterAdd';
import { storeStateV2, UpgradeableGBCounterSub } from '../../../build/UpgradeableGBCounterSub/tact_UpgradeableGBCounterSub';
import { Header, InitParams } from '../../../build/UpgradeableGBCounterSub/tact_UpgradeableGBCounterAdd';

async function setUpTest(i: bigint): Promise<{
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    owner: SandboxContract<TreasuryContract>,
    upgradeableGBCounter: SandboxContract<UpgradeableGBCounterAdd>,
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

    let upgradeableGBCounter = blockchain.openContract(await UpgradeableGBCounterAdd.fromInit(0n, owner.address, i));

    const counterDeployResult = await upgradeableGBCounter.send(
        deployer.getSender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    expect(counterDeployResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: upgradeableGBCounter.address,
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
        upgradeableGBCounter,
        getter,
    }
};

describe('UpgradeableGBCounter', () => {

    it('should deploy', async () => {
        await setUpTest(0n);
    });

    it('should deploy on version 1', async () => {
        let {
            upgradeableGBCounter,
        } = await setUpTest(0n);
        const version = await upgradeableGBCounter.getVersion();
        expect(version).toBe(1n);
    }, 100000);

    it('should have initial value', async () => {
        let {
            blockchain,
            upgradeableGBCounter,
            getter,
        } = await setUpTest(0n);
        const user = await blockchain.treasury('user');
        await assertCount(upgradeableGBCounter, getter, user.getSender(), 0n);
    }, 100000);

    it('version 1 should increase counter', async () => {
        let {
            blockchain,
            upgradeableGBCounter,
            owner,
            getter,
        } = await setUpTest(0n);
        const increaseTimes = 3;
        for (let i = 0; i < increaseTimes; i++) {
            const increaser = await blockchain.treasury('increaser' + i);
            const counterBefore = await getCount(getter, owner.getSender(), upgradeableGBCounter);
            const increaseBy = BigInt(1);

            let increaseResult = await upgradeableGBCounter.send(
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
                to: upgradeableGBCounter.address,
                success: true,
            });

            await assertCount(upgradeableGBCounter, getter, owner.getSender(), counterBefore + increaseBy);
        }
    }, 100000);

    it('should be upgraded to version 2 after commit', async () => {
        let {
            owner,
            upgradeableGBCounter,
            getter,
        } = await setUpTest(0n);
        let header: Header = {
            $$type: "Header",
            owner: owner.address,
            _version: 2n,
        }
        let initParams: InitParams = {
            $$type: "InitParams",
            header: header,
            stateToBeMigrated: beginCell().endCell(),
        }
        let substractorCounter = (await UpgradeableGBCounterSub.fromInit(initParams)).init;
        if (substractorCounter == null) {
            throw new Error('init is null');
        }
        let substractorCounterCode = substractorCounter.code;
        let upgradeResult = await
            upgradeableGBCounter.send(
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
            to: upgradeableGBCounter.address,
            success: true,
        });

        const sameVersion = await upgradeableGBCounter.getVersion();
        expect(sameVersion).toBe(1n);

        let CommitUpgradeResult = await
            upgradeableGBCounter.send(
                owner.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'CommitUpgrade',
                }
            )
        expect(CommitUpgradeResult.transactions).toHaveTransaction({
            from: owner.address,
            to: upgradeableGBCounter.address,
            success: true,
        });

        const version = await upgradeableGBCounter.getVersion();
        expect(version).toBe(2n);
    }, 100000);

    // it('upgrade with data should change the internal state', async () => {
    //     const initialValue = 5n;
    //     let {
    //         owner,
    //         upgradeableGBCounter,
    //         getter,
    //     } = await setUpTest(initialValue);
    //     const initialId = await upgradeableGBCounter.getId();

    //     const expectedNewId = 1n;
    //     const expectedNewValue = 10n;
    //     await upgradeCounter(owner, upgradeableGBCounter, await createSubCounterInit(owner, { id: expectedNewId, owner: owner.address, counter: expectedNewValue }));
    //     await commitCounterUpgrade(owner, upgradeableGBCounter);

    //     await assertCount(upgradeableGBCounter, getter, owner.getSender(), expectedNewValue);
    //     // const newId = await upgradeableGBCounter.getId();
    //     // expect(newId).toBe(expectedNewId);
    // }, 100000);

    // it('rollback after upgrade with data should go back to original internal state', async () => {
    //     const initialValue = 5n;
    //     let {
    //         owner,
    //         upgradeableGBCounter,
    //         getter,
    //     } = await setUpTest(initialValue);
    //     await assertCount(upgradeableGBCounter, getter, owner.getSender(), initialValue);
    //     const initialId = await upgradeableGBCounter.getId();

    //     const expectedNewId = 1n;
    //     const newValue = 10n;
    //     console.log("upgradeCounter")
    //     await upgradeCounter(owner, upgradeableGBCounter, await createSubCounterInit(owner, { id: expectedNewId, owner: owner.address, counter: newValue }));
    //     console.log("commitCounterUpgrade")
    //     await commitCounterUpgrade(owner, upgradeableGBCounter);
    //     await assertCount(upgradeableGBCounter, getter, owner.getSender(), newValue);
    //     console.log("rollbackUpgrade")
    //     await rollbackUpgrade(owner, upgradeableGBCounter);

    //     await assertCount(upgradeableGBCounter, getter, owner.getSender(), initialValue);
    //     // const newId = await upgradeableGBCounter.getId();
    //     // expect(newId).toBe(initialId);
    // }, 100000);

    // it('uncommited version 2 should increase counter', async () => {
    //     let {
    //         blockchain,
    //         upgradeableGBCounter,
    //         owner,
    //         getter,
    //     } = await setUpTest(0n);

    //     await upgradeCounter(owner, upgradeableGBCounter, await createSubCounterInit(owner, null));

    //     const increaseTimes = 3;
    //     for (let i = 0; i < increaseTimes; i++) {
    //         const increaser = await blockchain.treasury('increaser' + i);
    //         const counterBefore = await upgradeableGBCounter.getCounter();
    //         const increaseBy = BigInt(1);

    //         let increaseResult = await upgradeableGBCounter.send(
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
    //             to: upgradeableGBCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableGBCounter, getter, owner.getSender(), counterBefore + increaseBy);
    //     }
    // }, 100000);

    // it('version 2 should decrease de counter', async () => {
    //     let {
    //         blockchain,
    //         owner,
    //         upgradeableGBCounter,
    //         getter,
    //     } = await setUpTest(3n);

    //     await upgradeCounter(owner, upgradeableGBCounter, await createSubCounterInit(owner, null));
    //     await commitCounterUpgrade(owner, upgradeableGBCounter);

    //     const decreaseTimes = 3;
    //     for (let i = 0; i < decreaseTimes; i++) {
    //         const decreaser = await blockchain.treasury('decreaser' + i);

    //         const counterBefore = await upgradeableGBCounter.getCounter();
    //         const decreaseBy = BigInt(1);

    //         let decreaseResult = await upgradeableGBCounter.send(
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
    //             to: upgradeableGBCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableGBCounter, getter, owner.getSender(), counterBefore - decreaseBy);
    //     }
    // }, 100000);

    // it('backroll should take us back to version 1 and it should increase de counter', async () => {
    //     let {
    //         blockchain,
    //         owner,
    //         upgradeableGBCounter,
    //         getter,
    //     } = await setUpTest(3n);

    //     await upgradeCounter(owner, upgradeableGBCounter, await createSubCounterInit(owner, null));
    //     await commitCounterUpgrade(owner, upgradeableGBCounter);

    //     const version2 = await upgradeableGBCounter.getVersion();
    //     expect(version2).toBe(2n);

    //     await rollbackUpgrade(owner, upgradeableGBCounter);

    //     const version1 = await upgradeableGBCounter.getVersion();
    //     expect(version1).toBe(1n);

    //     const increaseTimes = 3;
    //     for (let i = 0; i < increaseTimes; i++) {
    //         const increaser = await blockchain.treasury('increaser' + i);
    //         const counterBefore = await upgradeableGBCounter.getCounter();
    //         const increaseBy = BigInt(1);

    //         let increaseResult = await upgradeableGBCounter.send(
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
    //             to: upgradeableGBCounter.address,
    //             success: true,
    //         });

    //         await assertCount(upgradeableGBCounter, getter, owner.getSender(), counterBefore + increaseBy);
    //     }
    // }, 100000);
});

// async function createSubCounterInit(owner: SandboxContract<TreasuryContract>, data: { id: bigint, owner: Address, counter: bigint }): Promise<{ code: Cell, data: Cell }> {
//     let header: Header = {
//         $$type: "Header",
//         owner: data.owner,
//         _version: 2n,
//     }
//     let initParams: InitParams = {
//         $$type: "InitParams",
//         header: header,
//         stateToBeMigrated: beginCell().endCell(),
//     }
//     let init = (await UpgradeableGBCounterSub.fromInit(initParams)).init;
//     if (init == null) {
//         throw new Error('init is null');
//     }
//     return {
//         code: init.code,
//         data: null,
//     }
// }

async function commitCounterUpgrade(owner: SandboxContract<TreasuryContract>, upgradeableGBCounter: SandboxContract<UpgradeableGBCounterAdd>) {
    let CommitUpgradeResult = await upgradeableGBCounter.send(
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
        to: upgradeableGBCounter.address,
        success: true,
    });
}

// async function upgradeCounter(owner: SandboxContract<TreasuryContract>, upgradeableGBCounter: SandboxContract<UpgradeableGBCounterAdd>, init: { code: Cell, data: Cell }) {
//     let upgradeResult = await upgradeableGBCounter.send(
//         owner.getSender(),
//         {
//             value: toNano('0.05'),
//         },
//         {
//             $$type: 'Upgrade',
//             code: init.code,
//         }
//     );
//     expect(upgradeResult.transactions).toHaveTransaction({
//         from: owner.address,
//         to: upgradeableGBCounter.address,
//         success: true,
//     });
// }

async function assertCount(upgradeableGBCounter: SandboxContract<UpgradeableGBCounterAdd>, getter: SandboxContract<Getter>, sender: Treasury, expectedCount: bigint) {
    const getterResult = await getCount(getter, sender, upgradeableGBCounter);
    console.log('getterResult', getterResult);
    console.log('expectedCount', expectedCount);
    expect(getterResult).toBe(expectedCount);
}

async function getCount(getter: SandboxContract<Getter>, sender: Treasury, upgradeableGBCounter: SandboxContract<UpgradeableGBCounterAdd>) {
    const getterDeployResult = await getter.send(
        sender,
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Get',
            queryId: BigInt(Math.floor(Math.random() * 10000)),
            opcode: 0n,
            Address: upgradeableGBCounter.address,
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

