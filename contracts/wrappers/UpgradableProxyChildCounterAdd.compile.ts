import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/examples/proxy_upgrade/upgradable_proxy_child_counter_add.tact',
    options: {
        debug: true,
    },
};
