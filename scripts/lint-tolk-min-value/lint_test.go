// SPDX-License-Identifier: BUSL-1.1
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const demoABI = `{
  "contract_name": "Demo",
  "description": "link.chain.ton.ccip.Demo",
  "incoming_messages": [{"body_ty_idx": 1}, {"body_ty_idx": 2}],
  "unique_types": [
    {"kind": "void"},
    {"kind": "StructRef", "struct_name": "Demo_Request"},
    {"kind": "AliasRef", "alias_name": "Demo_Reply"}
  ]
}`

func fixture(t *testing.T, abi, src string) (string, string) {
	t.Helper()
	root := t.TempDir()
	abiDir := filepath.Join(root, "abi")
	srcDir := filepath.Join(root, "src")
	if err := os.MkdirAll(abiDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(abiDir, "Demo.json"), []byte(abi), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "demo.tolk"), []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	return abiDir, srcDir
}

func TestParseMarker(t *testing.T) {
	for _, tc := range []struct {
		name, line, category, gate, admission, message string
	}{
		{"admission static", "// minval:check-admission gate=A/static Demo_Request", "check-admission", "A", "static", "Demo_Request"},
		{"default gate and admission", "// minval:check-bounce Demo_Reply", "check-bounce", "S", "", "Demo_Reply"},
		{"explicit none", "// minval:recovery gate=none Demo_Reply", "recovery", "none", "", "Demo_Reply"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := parseMarkers(tc.line, "x.tolk")
			if len(got) != 1 {
				t.Fatalf("want 1 marker, got %d", len(got))
			}
			m := got[0]
			if m.Category != tc.category || m.Gate != tc.gate || m.Admission != tc.admission || m.Message != tc.message {
				t.Fatalf("got %+v", m)
			}
		})
	}
}

func TestParseDetailBlock(t *testing.T) {
	src := "// minval:check-bounce gate=S Demo_Request\n" +
		"// minval.detail: summary line\n" +
		"//   First detail.\n" +
		"//   Second detail.\n" +
		"fun f() {}"
	got := parseMarkers(src, "x.tolk")
	if len(got) != 1 || got[0].Description != "summary line" || got[0].Detail != "First detail. Second detail." {
		t.Fatalf("got %+v", got)
	}
}

func TestGateLabel(t *testing.T) {
	if l := (marker{Gate: "A", Admission: "dynamic"}).gateLabel(); l != "A/dynamic" {
		t.Fatalf("got %q", l)
	}
	if l := (marker{Gate: "S"}).gateLabel(); l != "S" {
		t.Fatalf("got %q", l)
	}
}

func TestCoverage(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S Demo_Request\n// minval.detail: config\nfun f() {}\n"+
			"// minval:check-admission gate=A/static Demo_Reply\n// minval.detail: flow start\nfun g() {}")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.total != 2 || r.classified != 2 || !r.ok() {
		t.Fatalf("unexpected report: %+v", r)
	}
	doc := r.contractDoc(r.contracts[0])
	if !strings.Contains(doc, "| `Demo_Reply` | check-admission | A/static | flow start |") {
		t.Fatalf("contract doc missing row:\n%s", doc)
	}
	if !strings.Contains(r.overview(), "2/2") {
		t.Fatalf("overview missing coverage:\n%s", r.overview())
	}
}

func TestDetailRendered(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S Demo_Request\n// minval.detail: summary\n//   More detail here.\nfun f() {}\n"+
			"// minval:check-admission gate=A/static Demo_Reply\n// minval.detail: flow\nfun g() {}")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if doc := r.contractDoc(r.contracts[0]); !strings.Contains(doc, "## Details") || !strings.Contains(doc, "More detail here.") {
		t.Fatalf("detail not rendered:\n%s", doc)
	}
}

func TestMissingMarkerFails(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI, "// minval:check-bounce gate=S Demo_Request\nfun f() {}")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.missing) != 1 || !strings.Contains(r.missing[0], "Demo: Demo_Reply") {
		t.Fatalf("want missing Demo_Reply, got %+v", r)
	}
}

func TestExcludedToleratesMissing(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI, "// minval:check-bounce gate=S Demo_Request\nfun f() {}")
	r, err := lint(abiDir, srcDir, map[string]bool{"Demo": true})
	if err != nil {
		t.Fatal(err)
	}
	if !r.ok() || len(r.missing) != 0 || len(r.excludedMissing) != 1 {
		t.Fatalf("want excluded missing and ok, got %+v", r)
	}
}

func TestStaleMarker(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S Demo_Request\n// minval:check-bounce gate=S Demo_Reply\n// minval:check-bounce gate=S Demo_Typo")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.stale) != 1 || !strings.Contains(r.stale[0], "Demo_Typo") {
		t.Fatalf("want stale Demo_Typo, got %+v", r)
	}
}

func TestQualifiedOverridesShared(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S Demo_Request\n"+
			"// minval:check-admission gate=A/static Demo.Demo_Request\n"+
			"// minval:check-bounce gate=S Demo_Reply")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !r.ok() {
		t.Fatalf("want ok, got %+v", r)
	}
	if m, _ := r.tagFor("Demo", "Demo_Request"); m.Category != "check-admission" || m.Gate != "A" {
		t.Fatalf("qualified marker should win, got %+v", m)
	}
}

func TestDuplicateUnqualified(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S Demo_Request\n// minval:check-bounce gate=S Demo_Request\n// minval:check-bounce gate=S Demo_Reply")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.duplicates) != 1 {
		t.Fatalf("want duplicate, got %+v", r)
	}
}

func TestStaleQualified(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S Demo_Request\n// minval:check-bounce gate=S Nope.Demo_Request\n// minval:check-bounce gate=S Demo_Reply")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.stale) != 1 {
		t.Fatalf("want stale qualified marker, got %+v", r)
	}
}

func TestInvalidGate(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=X Demo_Request\n// minval:check-bounce gate=S Demo_Reply")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.invalid) != 1 {
		t.Fatalf("want invalid gate, got %+v", r)
	}
}

func TestInvalidAdmission(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-admission gate=A/maybe Demo_Request\n// minval:check-bounce gate=S Demo_Reply")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.invalid) != 1 {
		t.Fatalf("want invalid admission, got %+v", r)
	}
}

func TestAdmissionRequiresGateA(t *testing.T) {
	abiDir, srcDir := fixture(t, demoABI,
		"// minval:check-bounce gate=S/static Demo_Request\n// minval:check-bounce gate=S Demo_Reply")
	r, err := lint(abiDir, srcDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.ok() || len(r.invalid) != 1 {
		t.Fatalf("want gate=S/static to be invalid, got %+v", r)
	}
}

func TestOutOfScopeIgnored(t *testing.T) {
	other := strings.Replace(demoABI, "link.chain.ton.ccip.Demo", "link.chain.ton.wgram.Demo", 1)
	abiDir, srcDir := fixture(t, other, "fun f() {}")
	if _, err := lint(abiDir, srcDir, nil); err == nil {
		t.Fatal("expected error when no in-scope contracts remain")
	}
}
