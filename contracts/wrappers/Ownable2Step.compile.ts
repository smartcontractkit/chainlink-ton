import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/examples/ownable_2step.tact',
    options: {
        debug: true,
    },
};
