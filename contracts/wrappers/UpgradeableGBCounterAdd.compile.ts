import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/examples/blue_green_upgrade/upgradeablebg_counter_add.tact',
    options: {
        debug: true,
    },
};
