import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/test/mock/trace_probe.tolk',
  withStackComments: true,
}
