import { CompilerConfig } from '@ton/blueprint'

// NOTE: Receiver contract moved from examples/ to ccip/test/ so it gets included
// in published release artifacts (examples.* contracts are excluded from releases).
// See: .github/workflows/contracts-publish-compiled-artifacts.yml
export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/test/tokenPool/contract.tolk',
  withStackComments: true,
}
