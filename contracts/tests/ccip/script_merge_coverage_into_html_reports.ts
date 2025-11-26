import { Coverage } from "@ton/sandbox";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const offRampSuffix = "offramp_coverage.json"
const routerSuffix = "router_coverage.json"
const feeQuoterSuffix = "feequoter_coverage.json"

const offRampCoverageResults: Coverage[] = []
const routerCoverageResults: Coverage[] = []
const feeQuoterCoverageResults: Coverage[] = []

const coverageDir = "./.coverage";

// Iterate over all files in ./.coverage directory
const files = readdirSync(coverageDir);

for (const file of files) {
    const filePath = join(coverageDir, file);
    
    if (file.endsWith(offRampSuffix)) {
        const coverage = Coverage.fromJson(readFileSync(filePath, "utf-8"));
        offRampCoverageResults.push(coverage);
    } else if (file.endsWith(routerSuffix)) {
        const coverage = Coverage.fromJson(readFileSync(filePath, "utf-8"));
        routerCoverageResults.push(coverage);
    } else if (file.endsWith(feeQuoterSuffix)) {
        const coverage = Coverage.fromJson(readFileSync(filePath, "utf-8"));
        feeQuoterCoverageResults.push(coverage);
    }
}

// Merge coverage results
const mergeResults = (results: Coverage[]): Coverage | null => {
    if (results.length === 0) return null;
    return results.reduce((acc, curr) => acc.mergeWith(curr));
};

const offRampMerged = mergeResults(offRampCoverageResults);
const routerMerged = mergeResults(routerCoverageResults);
const feeQuoterMerged = mergeResults(feeQuoterCoverageResults);

// Generate HTML reports
if (offRampMerged) {
    writeFileSync("./.coverage/offramp-coverage.html", offRampMerged.report("html"));
    console.log("Generated offramp-coverage.html");
}

if (routerMerged) {
    writeFileSync("./.coverage/router-coverage.html", routerMerged.report("html"));
    console.log("Generated router-coverage.html");
}

if (feeQuoterMerged) {
    writeFileSync("./.coverage/feequoter-coverage.html", feeQuoterMerged.report("html"));
    console.log("Generated feequoter-coverage.html");
}
