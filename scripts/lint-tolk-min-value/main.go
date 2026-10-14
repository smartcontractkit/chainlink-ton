// SPDX-License-Identifier: BUSL-1.1
package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

func main() {
	verbose := flag.Bool("verbose", false, "print each handler's classification")
	flag.Parse()
	root := "."
	if flag.NArg() > 1 {
		fmt.Fprintln(os.Stderr, "Usage: lint-tolk-min-value [-verbose] [root]")
		os.Exit(2)
	}
	if flag.NArg() == 1 {
		root = flag.Arg(0)
	}
	r, err := lint(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "lint-tolk-min-value:", err)
		os.Exit(2)
	}
	var counts []string
	for _, group := range policyGroups {
		counts = append(counts, fmt.Sprintf("%d %s", r.groups[group], group))
	}
	fmt.Printf("classified %d contracts: %s\n", r.contracts, strings.Join(counts, ", "))
	if *verbose {
		for _, classification := range r.classifications {
			fmt.Println(classification)
		}
	}
	for _, diagnostic := range r.diagnostics {
		fmt.Fprintln(os.Stderr, diagnostic)
	}
	if len(r.diagnostics) > 0 {
		os.Exit(1)
	}
}
