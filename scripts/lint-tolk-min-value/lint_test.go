// SPDX-License-Identifier: BUSL-1.1
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const declarations = `
struct (0x12345678) Request { queryId: uint64; }
type Requests = Request;
contract Demo {
    incomingMessages: Requests
}
`

func fixture(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for file, text := range files {
		path := filepath.Join(root, file)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestMarkerChecks(t *testing.T) {
	for _, tc := range []struct{ name, body, want string }{
		{"extracted value", "// lint:min-value/normal Request — checked\nval minValue = 1;\nassertMinValue(value, minValue, 1);", ""},
		{"caught check", "try {\n// lint:min-value/normal-local Request — local recovery\nval minValue = 1;\nassertMinValue(value, minValue, 1);\n} catch { recover(); }", ""},
		{"nested caught check", "try {\nif (valid) {\n// lint:min-value/normal-local Request local recovery\nassertMinValue(value, 1, 1);\n}\n} /* } */ catch (errorCode) { recover(); }", ""},
		{"uncaught local", "// lint:min-value/normal-local Request local recovery\nassertMinValue(value, 1, 1);", "inside try/catch"},
		{"unrelated catch", "try { complete(); } catch { recover(); }\n// lint:min-value/normal-local Request local recovery\nassertMinValue(value, 1, 1);", "inside try/catch"},
		{"try without catch", "try {\n// lint:min-value/normal-local Request local recovery\nassertMinValue(value, 1, 1);\n}", "inside try/catch"},
		{"multi-hop", "// lint:min-value/multi-hop Request safety and optional admission\nval safety = 1;\nassertMinValue(value, safety, 1);\nval admission = config.resolve(safety);\nassertMinValue(value, admission, 1);", ""},
		{"missing admission", "// lint:min-value/multi-hop Request safety and optional admission\nassertMinValue(value, 1, 1);\n// assertMinValue(value, 2, 1);", "safety and admission"},
		{"recovery", "// lint:min-value/recovery Request unwind an aborted attempt\nrecover();", ""},
		{"non-reject", "// lint:min-value/non-reject Request custody already committed\ncomplete();", ""},
		{"best effort", "// lint:min-value/best-effort Request passive excess receipt only\nkeepCoins();", ""},
		{"gated recovery", "// lint:min-value/recovery Request unwind\nassertMinValue(value, 1, 1);", "must not introduce"},
		{"gated non-reject", "// lint:min-value/non-reject Request committed\nassertMinValue(value, 1, 1);", "must not introduce"},
		{"gated exception", "// lint:min-value/best-effort Request passive receipt\nassertMinValue(value, 1, 1);", "must not introduce"},
		{"unknown group", "// lint:min-value/typo Request some reason", "unknown min-value group"},
		{"legacy checked", "// lint:min-value Request — checked\nassertMinValue(value, 1, 1);", "expected // lint:min-value/<group>"},
		{"legacy unchecked", "// lint:min-value-best-effort Request — committed", "expected // lint:min-value/<group>"},
		{"missing", "complete();", "found 0"},
		{"no description", "// lint:min-value/best-effort Request\ncomplete();", "description"},
		{"empty description", "// lint:min-value/normal Request —\nassertMinValue(value, 1, 1);", "description"},
		{"commented call", "// lint:min-value/normal Request — checked\n// assertMinValue(value, 1, 1);", "no assertMinValue"},
		{"block comment call", "// lint:min-value/normal Request — checked\n/* assertMinValue(value, 1, 1); */", "no assertMinValue"},
		{"string call", "// lint:min-value/normal Request — checked\nval text = \"assertMinValue(value, 1, 1)\";", "no assertMinValue"},
		{"function definition", "// lint:min-value/normal Request — checked\nfun assertMinValue(value: coins) {}", "no assertMinValue"},
		{"block comment tag", "/*\n// lint:min-value/normal Request — checked\nassertMinValue(value, 1, 1);\n*/", "found 0"},
		{"next handler", "// lint:min-value/normal Request — checked\n}\nfun other() { assertMinValue(value, 1, 1);", "no assertMinValue"},
		{"window boundary", "// lint:min-value/normal Request — checked\n\n\n\n\nassertMinValue(value, 1, 1);", ""},
		{"outside window", "// lint:min-value/normal Request — checked\n\n\n\n\n\nassertMinValue(value, 1, 1);", "no assertMinValue"},
		{"duplicate", "// lint:min-value/non-reject Request — first\n// lint:min-value/non-reject Request — second", "found 2"},
		{"conflict", "// lint:min-value/normal Request — first\nassertMinValue(value, 1, 1);\n// lint:min-value/non-reject Request — second", "found 2"},
		{"stale", "// lint:min-value/non-reject Request — committed\n// lint:min-value/non-reject Typo — wrong name", "stale tag Typo"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := fixture(t, map[string]string{"ccip/demo/contract.tolk": declarations + tc.body})
			r, err := lint(root)
			if err != nil {
				t.Fatal(err)
			}
			output := strings.Join(r.diagnostics, "\n")
			if tc.want == "" && output != "" {
				t.Fatal(output)
			}
			if tc.want != "" && !strings.Contains(output, tc.want) {
				t.Fatalf("want %q, got %q", tc.want, output)
			}
		})
	}
}

func TestImportScopedTags(t *testing.T) {
	root := fixture(t, map[string]string{
		"ccip/a/contract.tolk": `import "../../lib/messages"
import "../../lib/handler.tolk"
contract A { incomingMessages: Requests }`,
		"ccip/b/contract.tolk": `import "../../lib/messages"
contract B { incomingMessages: Requests }`,
		"lib/messages.tolk": "struct (0x12345678) Request {}\ntype Requests = Request\nconst NEXT = 1;",
		"lib/handler.tolk": `import "messages"
// lint:min-value/normal Request — shared checked handler
val minValue = 1;
assertMinValue(value, minValue, 1);`,
	})
	r, err := lint(root)
	if err != nil {
		t.Fatal(err)
	}
	if r.contracts != 2 || r.groups["normal"] != 1 {
		t.Fatalf("unexpected report: %+v", r)
	}
	if len(r.diagnostics) != 1 || !strings.Contains(r.diagnostics[0], "(B): Request") {
		t.Fatalf("an unrelated contract's tag must not satisfy B: %v", r.diagnostics)
	}
	// A narrower invocation still follows relative imports outside the scan root.
	r, err = lint(filepath.Join(root, "ccip", "a"))
	if err != nil || len(r.diagnostics) != 0 || r.groups["normal"] != 1 {
		t.Fatalf("%+v, %v", r, err)
	}
}

func TestFailClosed(t *testing.T) {
	for _, tc := range []struct{ name, code, want string }{
		{"missing import", "import \"missing\"\n" + declarations, "import"},
		{"unknown message", "contract Demo { incomingMessages: Missing }", "unresolved message"},
		{"empty messages", "contract Demo { incomingMessages: }", "empty incomingMessages"},
		{"missing messages", "contract Demo { storage: Storage }", "missing or empty"},
		{"unknown generic", "type Reply = Missing<cell>;\ncontract Demo { incomingMessages: Reply }", "unresolved generic"},
		{"cycle", "type A = B;\ntype B = A;\ncontract Demo { incomingMessages: A }", "cyclic"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := fixture(t, map[string]string{"ccip/demo/contract.tolk": tc.code})
			_, err := lint(root)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %s error, got %v", tc.want, err)
			}
		})
	}
	root := t.TempDir()
	if _, err := lint(root); err == nil {
		t.Fatal("zero contracts must not pass")
	}
	if _, err := lint(filepath.Join(root, "missing")); err == nil {
		t.Fatal("missing root must not pass")
	}
}

func TestTransitiveImportsAndGenericMessages(t *testing.T) {
	root := fixture(t, map[string]string{
		"ccip/demo/contract.tolk": `import "../../lib/alias"
contract Demo { incomingMessages: Messages }
// lint:min-value/non-reject Reply — generic callback already committed`,
		"lib/alias.tolk":    "import \"messages\"\ntype Reply = GenericReply<cell>\ntype Messages = Reply;",
		"lib/messages.tolk": "import \"alias\"\nstruct (0x12345678) GenericReply<T> { payload: T; }",
	})
	r, err := lint(root)
	if err != nil || len(r.diagnostics) != 0 || r.groups["non-reject"] != 1 {
		t.Fatalf("%+v, %v", r, err)
	}
}

func TestStaleTagsAreImportScoped(t *testing.T) {
	root := fixture(t, map[string]string{
		"ccip/a/contract.tolk": `struct (1) ARequest {}
struct (2) Request {}
contract A { incomingMessages: ARequest }
// lint:min-value/best-effort ARequest passive receipt
// lint:min-value/non-reject Request stale in this closure`,
		"ccip/b/contract.tolk": declarations + "// lint:min-value/non-reject Request committed in B",
	})
	r, err := lint(root)
	if err != nil || len(r.diagnostics) != 1 || !strings.Contains(r.diagnostics[0], "stale tag Request") {
		t.Fatalf("%+v, %v", r, err)
	}
}
