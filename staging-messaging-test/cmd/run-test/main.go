package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/staging-messaging-test/cases"
	"github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/evm"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/ton"
)

func main() {
	testCase := flag.String("case", "", "Test case to run: ton2evm, evm2ton")
	resultFile := flag.String("result-file", "result.json", "Path to write test result JSON")
	flag.Parse()

	if *testCase == "" {
		fmt.Fprintln(os.Stderr, "Error: -case flag is required")
		fmt.Fprintln(os.Stderr, "Available test cases: ton2evm, evm2ton")
		flag.Usage()
		os.Exit(1)
	}

	resultPath := lib.GetResultFilePath(*resultFile)
	exitCode := 0

	// Initialize logger
	lggr, err := logger.New()
	if err != nil {
		result := lib.TestResult{
			Case:   *testCase,
			Status: "failure",
			Error:  fmt.Sprintf("Failed to create logger: %v", err),
		}
		lib.OutputJSON(result, resultPath)
		os.Exit(1)
	}

	var result *lib.TestResult

	// Run test case with context
	func() {
		ctx, cancel := context.WithTimeout(context.Background(), lib.TestTimeout)
		defer cancel()

		var err error
		switch *testCase {
		case "ton2evm":
			result, err = cases.TON2EVM(ctx, lggr)
		case "evm2ton":
			result, err = cases.EVM2TON(ctx, lggr)
		default:
			result = &lib.TestResult{
				Case:   *testCase,
				Status: "failure",
				Error:  fmt.Sprintf("Unknown test case: %s", *testCase),
			}
			err = fmt.Errorf("unknown test case: %s", *testCase)
		}

		if err != nil {
			exitCode = 1
		}
	}()

	// Output result
	if result != nil {
		lib.OutputJSON(*result, resultPath)
	}
	os.Exit(exitCode)
}
