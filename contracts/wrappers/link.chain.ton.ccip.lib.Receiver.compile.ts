import { CompilerConfig } from '@ton/blueprint'

// NOTE: This is a stub contract for tooling to generate bindings.
export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/lib/receiver/wrapper.tolk',
  withStackComments: true,
}
