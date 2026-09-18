// Command legacy-execute-report encodes and decodes ExecuteReport cells using the
// cciplib binding immediately before OffChainTokenData became a nested LispList.
//
// The module is kept outside the cciplib module (see go.mod) so its import resolves
// to the pinned legacy version (v0.0.0-20260915153529-7f72e847b2fb, commit 7f72e847b2fb,
// tag contracts/1.6.2+7f72e847b2fb), the last commit on main before PR #884 introduced
// the nested LispList[LispList[SnakeBytes]]. At that commit,
// ocr.ExecuteReport.OffChainTokenData is *cell.Cell, hardcoded to tvm.EmptyCell for
// tokenless reports — which produces the same single empty cell as the current
// canonicalization.
//
// It uses the real ccipocr3.ExecutePluginReport JSON types and the real
// NewExecutePluginCodecV1/NewExtraDataDecoder from the legacy cciplib, so the
// golden BOC it produces is exactly what the legacy relayer would have transmitted.
//
// Usage:
//
//	legacy-execute-report encode -input <report.json> -output <report.boc>
//	legacy-execute-report decode -input <report.boc> -output <report.json>
//
// The JSON input for encode is a ccipocr3.ExecutePluginReport wrapped in a
// {"report": ...} object (matching the golden fixture at testdata/golden/execute_report.json).
// The JSON output from decode is the same wrapper shape.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/codec"
)

// fixture wraps a ccipocr3.ExecutePluginReport with a human-readable description,
// matching the golden file convention used at testdata/golden/.
type fixture struct {
	Description string                       `json:"description"`
	Report      ccipocr3.ExecutePluginReport `json:"report"`
}

func main() {
	if len(os.Args) < 2 {
		fatalf("usage: %s encode|decode -input <path> -output <path>", os.Args[0])
	}

	switch os.Args[1] {
	case "encode":
		cmdEncode(os.Args[2:])
	case "decode":
		cmdDecode(os.Args[2:])
	default:
		fatalf("unknown subcommand %q; expected encode or decode", os.Args[1])
	}
}

func cmdEncode(args []string) {
	fs := flag.NewFlagSet("encode", flag.ExitOnError)
	input := fs.String("input", "", "path to input JSON file (ccipocr3.ExecutePluginReport fixture)")
	output := fs.String("output", "", "path to write BOC output")
	if err := fs.Parse(args); err != nil {
		fatalf("parse flags: %v", err)
	}
	if *input == "" || *output == "" {
		fatalf("encode requires -input and -output")
	}

	data, err := os.ReadFile(*input)
	if err != nil {
		fatalf("read input %s: %v", *input, err)
	}

	var fx fixture
	if err = json.Unmarshal(data, &fx); err != nil {
		fatalf("decode JSON: %v", err)
	}

	// Construct the legacy codec exactly as the relayer does. The extra-data
	// decoder is keyed by chain family; selector 5009297550715157269 is EVM.
	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM:    codec.NewExtraDataDecoder(),
		chainsel.FamilySolana: codec.NewExtraDataDecoder(),
		chainsel.FamilyTon:    codec.NewExtraDataDecoder(),
	})
	codecInstance := codec.NewExecutePluginCodecV1(edc)

	boc, err := codecInstance.Encode(context.Background(), fx.Report)
	if err != nil {
		fatalf("encode report: %v", err)
	}
	if boc == nil {
		fatalf("encode returned nil BOC (empty report?)")
	}

	if err := os.WriteFile(*output, boc, 0o600); err != nil {
		fatalf("write output %s: %v", *output, err)
	}
}

func cmdDecode(args []string) {
	fs := flag.NewFlagSet("decode", flag.ExitOnError)
	input := fs.String("input", "", "path to input BOC file")
	output := fs.String("output", "", "path to write JSON output")
	if err := fs.Parse(args); err != nil {
		fatalf("parse flags: %v", err)
	}
	if *input == "" || *output == "" {
		fatalf("decode requires -input and -output")
	}

	boc, err := os.ReadFile(*input)
	if err != nil {
		fatalf("read input %s: %v", *input, err)
	}

	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM:    codec.NewExtraDataDecoder(),
		chainsel.FamilySolana: codec.NewExtraDataDecoder(),
		chainsel.FamilyTon:    codec.NewExtraDataDecoder(),
	})
	codecInstance := codec.NewExecutePluginCodecV1(edc)

	report, err := codecInstance.Decode(context.Background(), boc)
	if err != nil {
		fatalf("decode report: %v", err)
	}

	fx := fixture{
		Description: "decoded by legacy-execute-report",
		Report:      report,
	}
	out, err := json.MarshalIndent(fx, "", "  ")
	if err != nil {
		fatalf("encode JSON: %v", err)
	}
	if err := os.WriteFile(*output, append(out, '\n'), 0o600); err != nil {
		fatalf("write output %s: %v", *output, err)
	}
}

// ctx returns a background context. The legacy codec's Encode/Decode accept a
// context.Context but do not use it, so a bare background context is sufficient.

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
