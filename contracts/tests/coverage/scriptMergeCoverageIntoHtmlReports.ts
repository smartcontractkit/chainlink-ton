import { Coverage } from '@ton/sandbox'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as coverage from './coverage'

const offRampSuffix = `${coverage.CoverageContractName.offramp}.json`
const routerSuffix = `${coverage.CoverageContractName.router}.json`
const feeQuoterSuffix = `${coverage.CoverageContractName.feequoter}.json`
const merkleRootSuffix = `${coverage.CoverageContractName.merkleroot}.json`
const onRampSuffix = `${coverage.CoverageContractName.onramp}.json`
const sendExecutorSuffix = `${coverage.CoverageContractName.send_executor}.json`
const receiveExecutorSuffix = `${coverage.CoverageContractName.receive_executor}.json`
const deployableSuffix = `${coverage.CoverageContractName.deployable}.json`
const mcmsSuffix = `${coverage.CoverageContractName.mcms}.json`
const timelockSuffix = `${coverage.CoverageContractName.timelock}.json`

const offRampCoverageResults: Coverage[] = []
const routerCoverageResults: Coverage[] = []
const feeQuoterCoverageResults: Coverage[] = []
const merkleRootCoverageResults: Coverage[] = []
const onrampCoverageResults: Coverage[] = []
const sendExecutorCoverageResults: Coverage[] = []
const receiveExecutorCoverageResults: Coverage[] = []
const deployableCoverageResults: Coverage[] = []
const mcmsCoverageResults: Coverage[] = []
const timelockCoverageResults: Coverage[] = []

const coverageDir = './.coverage'

// Iterate over all files in ./.coverage directory
const files = readdirSync(coverageDir)

for (const file of files) {
  const filePath = join(coverageDir, file)

  if (file.endsWith(offRampSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    offRampCoverageResults.push(coverage)
  } else if (file.endsWith(routerSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    routerCoverageResults.push(coverage)
  } else if (file.endsWith(feeQuoterSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    feeQuoterCoverageResults.push(coverage)
  } else if (file.endsWith(merkleRootSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    merkleRootCoverageResults.push(coverage)
  } else if (file.endsWith(onRampSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    onrampCoverageResults.push(coverage)
  } else if (file.endsWith(sendExecutorSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    sendExecutorCoverageResults.push(coverage)
  } else if (file.endsWith(receiveExecutorSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    receiveExecutorCoverageResults.push(coverage)
  } else if (file.endsWith(deployableSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    deployableCoverageResults.push(coverage)
  } else if (file.endsWith(mcmsSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    mcmsCoverageResults.push(coverage)
  } else if (file.endsWith(timelockSuffix)) {
    const coverage = Coverage.fromJson(readFileSync(filePath, 'utf-8'))
    timelockCoverageResults.push(coverage)
  }
}

// Merge coverage results
const mergeResults = (results: Coverage[]): Coverage | null => {
  if (results.length === 0) return null
  return results.reduce((acc, curr) => acc.mergeWith(curr))
}

const offRampMerged = mergeResults(offRampCoverageResults)
const routerMerged = mergeResults(routerCoverageResults)
const feeQuoterMerged = mergeResults(feeQuoterCoverageResults)
const merkleRootMerged = mergeResults(merkleRootCoverageResults)
const onRampMerged = mergeResults(onrampCoverageResults)
const sendExecutorMerged = mergeResults(sendExecutorCoverageResults)
const receiveExecutorMerged = mergeResults(receiveExecutorCoverageResults)
const deployableMerged = mergeResults(deployableCoverageResults)
const mcmsMerged = mergeResults(mcmsCoverageResults)
const timelockMerged = mergeResults(timelockCoverageResults)

// Generate HTML reports
if (offRampMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.offramp}.html`,
    offRampMerged.report('html'),
  )
  console.log('Generated offramp-coverage.html')
}

if (routerMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.router}.html`,
    routerMerged.report('html'),
  )
  console.log('Generated router-coverage.html')
}

if (feeQuoterMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.feequoter}.html`,
    feeQuoterMerged.report('html'),
  )
  console.log('Generated feequoter-coverage.html')
}

if (merkleRootMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.merkleroot}.html`,
    merkleRootMerged.report('html'),
  )
  console.log('Generated merkleroot-coverage.html')
}

if (onRampMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.onramp}.html`,
    onRampMerged.report('html'),
  )
  console.log('Generated onramp-coverage.html')
}

if (sendExecutorMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.send_executor}.html`,
    sendExecutorMerged.report('html'),
  )
  console.log('Generated sendexecutor-coverage.html')
}

if (receiveExecutorMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.receive_executor}.html`,
    receiveExecutorMerged.report('html'),
  )
  console.log('Generated receiveexecutor-coverage.html')
}

if (deployableMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.deployable}.html`,
    deployableMerged.report('html'),
  )
  console.log('Generated deployable-coverage.html')
}

if (mcmsMerged) {
  writeFileSync(`./.coverage/${coverage.CoverageContractName.mcms}.html`, mcmsMerged.report('html'))
  console.log('Generated mcms-coverage.html')
}

if (timelockMerged) {
  writeFileSync(
    `./.coverage/${coverage.CoverageContractName.timelock}.html`,
    timelockMerged.report('html'),
  )
  console.log('Generated timelock-coverage.html')
}
