import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tolk',
    entrypoint: 'contracts/firedrill_entrypoint.tolk',
    withStackComments: true,
    withSrcLineComments: true,
    experimentalOptions: '',
};
