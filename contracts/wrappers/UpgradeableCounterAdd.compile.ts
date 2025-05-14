import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/examples/in_place_upgrade_with_data_migration/upgradeable_counter_add.tact',
    options: {
        debug: true,
    },
};
