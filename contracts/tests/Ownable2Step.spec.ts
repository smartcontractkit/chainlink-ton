import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { OwnableCounter } from '../wrappers/access/OwnableCounter';
import '@ton/test-utils';

const ERROR_ONLY_CALLABLE_BY_OWNER = 1000;
const ERROR_CANNOT_TRANSFER_TO_SELF = 1001;
const ERROR_MUST_BE_PROPOSED_OWNER = 1002;

describe('Ownable2Step Counter', () => {
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
            exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
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
            exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
            success: false,
        });

        const countAfterTx = await counter.getCount();

        expect(countAfterTx).toBe(initialCount);
    });

    it('Test06: AcceptOwnership should transfer the ownership', async () => {
        const owner = await blockchain.treasury('deployer');
        const other = await blockchain.treasury('other');

        await counter.send(
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

        const resultAcceptOwnership = await counter.send(
            other.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'AcceptOwnership',
            queryId: 0n,
            }
        );
        expect(resultAcceptOwnership.transactions).toHaveTransaction({
            from: other.address,
            to: counter.address,
            success: true,
        });

        // Check that the owner is now the new one
        const newOwner = await counter.getOwner();
        expect(newOwner.toString()).toBe(other.address.toString());

        // Check that the new owner can operate as owner
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
            success: true,
        });

        const countAfterTx = await counter.getCount();
        expect(countAfterTx).toBe(100n);

    });

    it('Test07 : AcceptOwnership should not allow the original owner to operate as owner', async () => {
        const owner = await blockchain.treasury('deployer');
        const other = await blockchain.treasury('other');
        await counter.send(
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
        await counter.send(
            other.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'AcceptOwnership',
            queryId: 0n,
            }
        );

        // Check that the original owner cannot operate as owner
        const resultSetCount = await counter.send(
            owner.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'SetCount',
            queryId: 0n,
            newCount: 100n,
        });
        expect(resultSetCount.transactions).toHaveTransaction({
            from: owner.address,
            to: counter.address,
            exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
            success: false,
        });
    });

    it('Test08: Should prevent users from calling AcceptOwnership with no pending owner ', async () => {
        const other = await blockchain.treasury('other');
        const result = await counter.send(
            other.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'AcceptOwnership',
            queryId: 0n,
            });
        expect(result.transactions).toHaveTransaction({
            from: other.address,
            to: counter.address,
            exitCode: ERROR_MUST_BE_PROPOSED_OWNER,
            success: false,
        });
    });

    it('Test09: Should prevent random users from calling AcceptOwnership with pending owner', async () => {
        const pendingOwner = await blockchain.treasury('pendingOwner');
        const other = await blockchain.treasury('other');

        await counter.send(
            deployer.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'TransferOwnership',
            queryId: 0n,
            newOwner: pendingOwner.address
            }
        );

        const result = await counter.send(
            other.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'AcceptOwnership',
            queryId: 0n,
            });
        expect(result.transactions).toHaveTransaction({
            from: other.address,
            to: counter.address,
            exitCode: ERROR_MUST_BE_PROPOSED_OWNER,
            success: false,
        });
    });

    it('Test10: Should prevent non owner from calling TransferOwnership', async () => {
        const other = await blockchain.treasury('other');
        const result = await counter.send(
            other.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'TransferOwnership',
            queryId: 0n,
            newOwner: other.address
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: other.address,
            to: counter.address,
            exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
            success: false,
        });
    });

    it('Test11: Should prevent transfer to self', async () => {
        const owner = await blockchain.treasury('deployer');
        const result = await counter.send(
            owner.getSender(),
            {
            value: toNano('0.05'),
            },
            {
            $$type: 'TransferOwnership',
            queryId: 0n,
            newOwner: owner.address
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: counter.address,
            exitCode: ERROR_CANNOT_TRANSFER_TO_SELF,
            success: false,
        });
    });

});
