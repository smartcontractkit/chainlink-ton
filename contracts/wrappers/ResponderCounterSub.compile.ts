import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/examples/proxy_upgrade/counter_sub.tact',
    options: {
        debug: true,
    },
};
