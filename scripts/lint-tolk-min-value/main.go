// SPDX-License-Identifier: BUSL-1.1
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Contracts not yet migrated: missing markers there do not fail the check.
const defaultExcluded = "CCIPSendExecutor,DepositAccount,FeeQuoter,MCMS,MerkleRoot,OffRamp,OnRamp,OnRampAccount,ReceiveExecutor,Router,Timelock,TokenAdminRegistry,TokenAdminRegistryEntry"

func main() {
	abiDir := flag.String("abi", "contracts/build/abi", "directory with generated contract ABIs")
	srcDir := flag.String("src", "contracts/contracts", "directory with contract sources")
	outDir := flag.String("outdir", "", "write overview.md and one file per contract to this directory")
	exclude := flag.String("exclude", defaultExcluded, "comma-separated contracts exempt from missing-marker failures")
	verbose := flag.Bool("verbose", false, "print per-message classification")
	flag.Parse()

	r, err := lint(*abiDir, *srcDir, parseSet(*exclude))
	if err != nil {
		fmt.Fprintln(os.Stderr, "lint-tolk-min-value:", err)
		os.Exit(2)
	}

	if *outDir != "" {
		if err := writeSpec(*outDir, r); err != nil {
			fmt.Fprintln(os.Stderr, "lint-tolk-min-value:", err)
			os.Exit(2)
		}
		fmt.Printf("wrote %s/overview.md and %d contract files\n", *outDir, len(r.contracts))
	}

	fmt.Printf("%d/%d messages classified across %d contracts (%d excluded missing)\n",
		r.classified, r.total, len(r.contracts), len(r.excludedMissing))
	if *verbose {
		for _, c := range r.contracts {
			for _, msg := range c.Messages {
				for _, m := range r.markers[msg] {
					fmt.Printf("  %s: %s/%s — %s\n", msg, m.Category, m.Gate, m.Description)
				}
			}
		}
	}
	for _, m := range r.missing {
		fmt.Fprintln(os.Stderr, "missing marker:", m)
	}
	for _, d := range r.duplicates {
		fmt.Fprintln(os.Stderr, "duplicate:", d)
	}
	for _, i := range r.invalid {
		fmt.Fprintln(os.Stderr, "invalid:", i)
	}
	for _, s := range r.stale {
		fmt.Fprintln(os.Stderr, "stale:", s)
	}

	if !r.ok() {
		os.Exit(1)
	}
}

func parseSet(csv string) map[string]bool {
	set := map[string]bool{}
	for _, name := range strings.Split(csv, ",") {
		if name = strings.TrimSpace(name); name != "" {
			set[name] = true
		}
	}
	return set
}

func writeSpec(dir string, r report) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "overview.md"), []byte(r.overview()), 0o644); err != nil {
		return err
	}
	for _, c := range r.contracts {
		path := filepath.Join(dir, c.Name+".md")
		if err := os.WriteFile(path, []byte(r.contractDoc(c)), 0o644); err != nil {
			return err
		}
	}
	return nil
}
