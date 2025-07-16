import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/examples/jetton/simple_receiver.tolk',
  withStackComments: true, // Fift output will contain comments, if you wish to debug its output
  experimentalOptions: '', // you can pass experimental compiler options here
}
