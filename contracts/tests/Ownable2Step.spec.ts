import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { OwnableCounter } from '../wrappers/Ownable2Step';
import '@ton/test-utils';

describe('Counter', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let counter: SandboxContract<OwnableCounter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        counter = blockchain.openContract(await OwnableCounter.fromInit(1337n, 13n));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await counter.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'SetCount',
                queryId: 1n,
                newCount: 14n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: counter.address,
            deploy: true,
            success: true,
        });
    });

    it('Test01: Should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and counter are ready to use
    });

    it('Test02: Should set deployer as owner', async () => {
        const deployer = await blockchain.treasury('deployer');
        const owner = await counter.getOwner();

        expect(owner.toString()).toEqual(deployer.address.toString());
    });

    it('Test03: Should allow owner to call SetCount', async () => {
        const owner = await blockchain.treasury('deployer');
        
        const newCount = 100n;

        const result = await counter.send(
            owner.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'SetCount',
                queryId: 0n,
                newCount: newCount,
            });
        expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: counter.address,
            success: true,
        });

        const countAfterTx = await counter.getCount();

        expect(countAfterTx).toBe(newCount);
    });

    it('Test04: Should prevent non owner from calling SetCount', async () => {
        const other = await blockchain.treasury('other');
        const initialCount = await counter.getCount();

        const result = await counter.send(
            other.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'SetCount',
                queryId: 0n,
                newCount: 100n,
            });
        expect(result.transactions).toHaveTransaction({
            from: other.address,
            to: counter.address,
            success: false,
        });

        const countAfterTx = await counter.getCount();

        expect(countAfterTx).toBe(initialCount);
    });

    it('Test05: TransferOwnership should not directly transfer the ownership', async () => {
        const owner = await blockchain.treasury('deployer');
        const other = await blockchain.treasury('other');
        const initialCount = await counter.getCount();

        const resultTransferOwnership = await counter.send(
            owner.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'TransferOwnership',
                queryId: 0n,
                newOwner: other.address
            }
        );
        expect(resultTransferOwnership.transactions).toHaveTransaction({
            from: owner.address,
            to: counter.address,
            success: true,
        });

        // Check that the owner is still the original one
        const contractOwner = await counter.getOwner();
        expect(contractOwner.toString()).toBe(owner.address.toString());

        // Check that the pending owner cannot operate as owner
        const resultSetCount = await counter.send(
            other.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'SetCount',
                queryId: 0n,
                newCount: 100n,
            });

        expect(resultSetCount.transactions).toHaveTransaction({
            from: other.address,
            to: counter.address,
            success: false,
        });

        const countAfterTx = await counter.getCount();

        expect(countAfterTx).toBe(initialCount);
    });
});
