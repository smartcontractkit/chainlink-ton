import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/test/examples/lisp_list.tolk',
  withStackComments: true,
}
