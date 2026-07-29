#!/usr/bin/env node
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { Project } from 'ts-morph'

import { parseToml } from './abigen/toml'
import transformCellRef from './abigen/transforms/cellRefs'
import addSend from './abigen/transforms/addSend'
import sortErrorsBlocks from './abigen/transforms/sortErrorsBlocks'
import unwrapSnakedCell from './abigen/transforms/unwrapSnakedCell'
import makeQueryIDOptional from './abigen/transforms/makeQueryIDOptional'
import transformDictionaryMaps from './abigen/transforms/maps'

// ---------------------------------------------------------------------------
//   manifest resolution + acton invocation
// ---------------------------------------------------------------------------

function findManifest(args: string[]): string {
  if (args.length > 0) {
    return path.resolve(args[0])
  }

  const cwd = process.cwd()
  const candidates = [path.join(cwd, 'Acton.toml'), path.join(cwd, 'contracts', 'Acton.toml')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate)
    }
  }

  throw new Error(
    'Acton.toml not found. Run from the contracts directory, repo root, or pass a manifest path.',
  )
}

interface ContractEntry {
  name: string
  domain: string
}

function readManifest(manifestPath: string): {
  projectRoot: string
  outputDir: string
  contracts: ContractEntry[]
} {
  const manifest = parseToml(fs.readFileSync(manifestPath, 'utf-8'))
  const projectRoot = path.dirname(manifestPath)
  const outputDir: string = manifest.wrappers?.typescript?.['output-dir']
  if (!outputDir) {
    throw new Error(`Manifest ${manifestPath} is missing [wrappers.typescript] output-dir`)
  }

  const contractsTable: Record<string, { domain: string }> = manifest.contracts ?? {}
  const contracts = Object.entries(contractsTable).map(([name, contract]) => ({
    name,
    domain: contract.domain,
  }))

  return { projectRoot, outputDir, contracts }
}

function generateWrapper(projectRoot: string, name: string, outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  execFileSync('acton', ['wrapper', '--ts', name, '-o', outputPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
}

function main(): void {
  const manifestPath = findManifest(process.argv.slice(2))
  const { projectRoot, outputDir, contracts } = readManifest(manifestPath)

  const project = new Project({ useInMemoryFileSystem: true })

  for (const { name, domain } of contracts) {
    const outputPath = path.join(projectRoot, outputDir, domain, `${name}.ts`)
    generateWrapper(projectRoot, name, outputPath)

    const original = fs.readFileSync(outputPath, 'utf-8')
    const sourceFile = project.createSourceFile(outputPath, original, { overwrite: true })

    sortErrorsBlocks(sourceFile)
    unwrapSnakedCell(sourceFile)
    transformCellRef(sourceFile)
    makeQueryIDOptional(sourceFile)
    transformDictionaryMaps(sourceFile)

    const transformed = sourceFile.getFullText()
    project.removeSourceFile(sourceFile)

    if (transformed !== original) {
      fs.writeFileSync(outputPath, transformed)
    }
  }
}

main()
