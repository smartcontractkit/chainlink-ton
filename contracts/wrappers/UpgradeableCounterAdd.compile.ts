import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/examples/direct_upgrade/upgradeable_counter_add.tact',
    options: {
        debug: true,
    },
};
