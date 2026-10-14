// SPDX-License-Identifier: BUSL-1.1
package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// A value-budget marker on an incoming message handler:
//
//	// minval:<category> gate=<S|A|none> A=<static|dynamic|none> [<Contract>.]<Message>
//	// minval.detail: <summary>
//	//   <optional detail, until the comment block ends>
//
// An unqualified marker is a shared default for every contract that declares the
// message. A `<Contract>.<Message>` marker applies only to that contract and takes
// precedence. `gate` and `A` are optional: `gate` defaults from the category and `A`
// defaults to `none`. `A=` qualifies an admission gate (`static` fixed threshold,
// `dynamic` when it depends on the message, e.g. gasLimit). The summary is the text
// after `minval.detail:`; following comment lines are the long-form detail.
var (
	markerHeadRE = regexp.MustCompile(`^minval:([a-z][a-z-]*)(?:\s+gate=([A-Za-z-]+))?(?:\s+A=([A-Za-z-]+))?\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(.*)$`)
	commentRE    = regexp.MustCompile(`^\s*//\s?(.*)$`)
)

// Categories and the gate they imply when `gate=` is omitted.
var defaultGate = map[string]string{
	"check-admission": "A",
	"check-bounce":    "S",
	"check-fail":      "S",
	"recovery":        "none",
	"non-reject":      "none",
	"best-effort":     "none",
}

var (
	validGates      = map[string]bool{"S": true, "A": true, "none": true}
	validAdmissions = map[string]bool{"static": true, "dynamic": true, "none": true}
)

type marker struct {
	Category    string
	Gate        string
	Admission   string // gate=A qualifier: static | dynamic | none
	Contract    string // empty for a shared default
	Message     string
	Description string
	Detail      string
	File        string
	Line        int
}

func (m marker) scope() string {
	if m.Contract == "" {
		return m.Message
	}
	return m.Contract + "." + m.Message
}

// gateLabel renders the gate, annotating an admission with its kind.
func (m marker) gateLabel() string {
	if m.Gate == "A" && m.Admission != "" && m.Admission != "none" {
		return "A (" + m.Admission + ")"
	}
	return m.Gate
}

type contract struct {
	Name     string
	FQN      string
	Messages []string
}

type report struct {
	contracts       []contract
	markers         map[string][]marker // message -> markers
	excluded        map[string]bool     // contracts not yet adopted (missing markers tolerated)
	missing         []string            // "Contract: Message"
	excludedMissing []string            // missing markers in excluded contracts
	duplicates      []string
	invalid         []string
	stale           []string
	total           int
	classified      int
}

// --- ABI ---

type abiIncoming struct {
	BodyTyIdx int `json:"body_ty_idx"`
}

type abiType struct {
	Kind       string `json:"kind"`
	StructName string `json:"struct_name"`
	AliasName  string `json:"alias_name"`
}

type abiDoc struct {
	ContractName string        `json:"contract_name"`
	Description  string        `json:"description"`
	Incoming     []abiIncoming `json:"incoming_messages"`
	UniqueTypes  []abiType     `json:"unique_types"`
}

func inScope(fqn string) bool {
	if !strings.HasPrefix(fqn, "link.chain.ton.ccip.") && !strings.HasPrefix(fqn, "link.chain.ton.mcms.") {
		return false
	}
	for _, bad := range []string{".cct.", ".test.", ".firedrill.", ".lib."} {
		if strings.Contains(fqn, bad) {
			return false
		}
	}
	return true
}

func loadABI(dir string) ([]contract, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out []contract
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		var doc abiDoc
		if err := json.Unmarshal(data, &doc); err != nil {
			return nil, fmt.Errorf("%s: %w", entry.Name(), err)
		}
		if !inScope(doc.Description) {
			continue
		}
		seen := map[string]bool{}
		var messages []string
		for _, in := range doc.Incoming {
			if in.BodyTyIdx < 0 || in.BodyTyIdx >= len(doc.UniqueTypes) {
				continue
			}
			t := doc.UniqueTypes[in.BodyTyIdx]
			name := t.StructName
			if name == "" {
				name = t.AliasName
			}
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			messages = append(messages, name)
		}
		sort.Strings(messages)
		out = append(out, contract{Name: doc.ContractName, FQN: doc.Description, Messages: messages})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// --- Markers ---

func loadMarkers(srcDir string) (map[string][]marker, error) {
	byMessage := map[string][]marker{}
	err := filepath.WalkDir(srcDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == "node_modules" || strings.HasPrefix(entry.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".tolk") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, m := range parseMarkers(string(data), path) {
			byMessage[m.Message] = append(byMessage[m.Message], m)
		}
		return nil
	})
	return byMessage, err
}

func parseMarkers(text, file string) []marker {
	lines := strings.Split(text, "\n")
	var out []marker
	last := -1
	for i := 0; i < len(lines); i++ {
		body, ok := commentBody(lines[i])
		if !ok {
			continue
		}
		switch {
		case strings.HasPrefix(body, "minval.detail:"):
			if last < 0 {
				continue
			}
			if summary := strings.TrimSpace(strings.TrimPrefix(body, "minval.detail:")); summary != "" {
				out[last].Description = summary
			}
			var detail []string
			for j := i + 1; j < len(lines); j++ {
				b, ok := commentBody(lines[j])
				if !ok || strings.HasPrefix(b, "minval:") {
					break
				}
				detail = append(detail, b)
			}
			for len(detail) > 0 && detail[len(detail)-1] == "" {
				detail = detail[:len(detail)-1]
			}
			out[last].Detail = strings.Join(detail, " ")
		case strings.HasPrefix(body, "minval:"):
			head := markerHeadRE.FindStringSubmatch(body)
			if head == nil {
				out = append(out, marker{File: file, Line: i + 1})
				last = len(out) - 1
				continue
			}
			category, gate, admission, target := head[1], head[2], head[3], head[4]
			if gate == "" {
				gate = defaultGate[category]
			}
			if admission == "" {
				admission = "none"
			}
			contractName, message := splitScope(target)
			out = append(out, marker{
				Category:    category,
				Gate:        gate,
				Admission:   admission,
				Contract:    contractName,
				Message:     message,
				Description: strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(head[5]), "—–- \t")),
				File:        file,
				Line:        i + 1,
			})
			last = len(out) - 1
		}
	}
	return out
}

// splitScope splits "<Contract>.<Message>" into its parts; a bare name has no contract.
func splitScope(target string) (contractName, message string) {
	if i := strings.IndexByte(target, '.'); i >= 0 {
		return target[:i], target[i+1:]
	}
	return "", target
}

func commentBody(line string) (string, bool) {
	m := commentRE.FindStringSubmatch(line)
	if m == nil {
		return "", false
	}
	return strings.TrimSpace(m[1]), true
}

// --- Lint ---

func lint(abiDir, srcDir string, exclude map[string]bool) (report, error) {
	contracts, err := loadABI(abiDir)
	if err != nil {
		return report{}, err
	}
	if len(contracts) == 0 {
		return report{}, fmt.Errorf("no in-scope contracts under %s", abiDir)
	}
	byMessage, err := loadMarkers(srcDir)
	if err != nil {
		return report{}, err
	}
	if exclude == nil {
		exclude = map[string]bool{}
	}

	declared := map[string]map[string]bool{}
	allMessages := map[string]bool{}
	for _, c := range contracts {
		declared[c.Name] = map[string]bool{}
		for _, msg := range c.Messages {
			declared[c.Name][msg] = true
			allMessages[msg] = true
		}
	}

	r := report{contracts: contracts, markers: byMessage, excluded: exclude}

	// Marker validation: malformed, invalid gate/admission, stale.
	for msg, tags := range byMessage {
		for _, m := range tags {
			if m.Message == "" || defaultGate[m.Category] == "" {
				r.invalid = append(r.invalid, fmt.Sprintf("%s:%d: malformed marker", m.File, m.Line))
				continue
			}
			if !validGates[m.Gate] {
				r.invalid = append(r.invalid, fmt.Sprintf("%s:%d: invalid gate %q", m.File, m.Line, m.Gate))
			}
			if !validAdmissions[m.Admission] {
				r.invalid = append(r.invalid, fmt.Sprintf("%s:%d: invalid admission %q", m.File, m.Line, m.Admission))
			}
			if m.Admission != "none" && m.Gate != "A" {
				r.invalid = append(r.invalid, fmt.Sprintf("%s:%d: A=%s requires gate=A", m.File, m.Line, m.Admission))
			}
			if !allMessages[msg] {
				r.stale = append(r.stale, fmt.Sprintf("%s:%d: %s not declared by any in-scope contract", m.File, m.Line, m.scope()))
				continue
			}
			if m.Contract != "" && !declared[m.Contract][m.Message] {
				r.stale = append(r.stale, fmt.Sprintf("%s:%d: %s does not declare %s", m.File, m.Line, m.Contract, m.Message))
			}
		}
	}

	// Duplicates: two markers resolving to the same (contract, message).
	for msg, tags := range byMessage {
		shared := 0
		perContract := map[string]int{}
		for _, m := range tags {
			if m.Contract == "" {
				shared++
			} else {
				perContract[m.Contract]++
			}
		}
		if shared > 1 {
			r.duplicates = append(r.duplicates, fmt.Sprintf("%s has %d unqualified markers", msg, shared))
		}
		for c, n := range perContract {
			if n > 1 {
				r.duplicates = append(r.duplicates, fmt.Sprintf("%s.%s has %d markers", c, msg, n))
			}
		}
	}

	// Coverage. Excluded contracts tolerate missing markers.
	for _, c := range contracts {
		for _, msg := range c.Messages {
			r.total++
			if _, ok := r.tagFor(c.Name, msg); ok {
				r.classified++
			} else if exclude[c.Name] {
				r.excludedMissing = append(r.excludedMissing, c.Name+": "+msg)
			} else {
				r.missing = append(r.missing, c.Name+": "+msg)
			}
		}
	}

	sort.Strings(r.missing)
	sort.Strings(r.excludedMissing)
	sort.Strings(r.duplicates)
	sort.Strings(r.invalid)
	sort.Strings(r.stale)
	return r, nil
}

func (r report) ok() bool {
	return len(r.missing) == 0 && len(r.duplicates) == 0 && len(r.invalid) == 0 && len(r.stale) == 0
}

// tagFor resolves the marker for a contract+message: a qualified marker takes
// precedence over the shared unqualified default.
func (r report) tagFor(contractName, msg string) (marker, bool) {
	var shared *marker
	for i := range r.markers[msg] {
		m := r.markers[msg][i]
		if m.Contract == contractName {
			return m, true
		}
		if m.Contract == "" && shared == nil {
			shared = &m
		}
	}
	if shared != nil {
		return *shared, true
	}
	return marker{}, false
}

// --- Generation ---

const generatedBanner = "> Generated from `build/abi` + `// minval` markers. Do not edit by hand.\n"

func (r report) overview() string {
	var b strings.Builder
	b.WriteString("# Value-budget spec (generated)\n\n")
	b.WriteString(generatedBanner)
	fmt.Fprintf(&b, "\nCoverage: **%d/%d** messages classified across %d contracts.\n\n", r.classified, r.total, len(r.contracts))

	b.WriteString("| Contract | Status | Messages | Classified | Missing |\n| --- | --- | ---: | ---: | ---: |\n")
	for _, c := range r.contracts {
		classified, missing := 0, 0
		for _, msg := range c.Messages {
			if _, ok := r.tagFor(c.Name, msg); ok {
				classified++
			} else {
				missing++
			}
		}
		status := "adopted"
		if r.excluded[c.Name] {
			status = "excluded"
		}
		fmt.Fprintf(&b, "| [%s](./%s.md) | %s | %d | %d | %d |\n", c.Name, c.Name, status, len(c.Messages), classified, missing)
	}

	counts := map[string]int{}
	for _, c := range r.contracts {
		for _, msg := range c.Messages {
			if m, ok := r.tagFor(c.Name, msg); ok {
				counts[m.Category]++
			}
		}
	}
	b.WriteString("\n## Categories\n\n| Category | Count |\n| --- | ---: |\n")
	for _, c := range sortedKeys(counts) {
		fmt.Fprintf(&b, "| %s | %d |\n", c, counts[c])
	}

	if gaps := r.gaps(); gaps != "" {
		b.WriteString("\n## Gaps\n\n")
		b.WriteString(gaps)
	}

	b.WriteString("\n## Notes\n\n")
	b.WriteString("- An unqualified marker is a shared default; `<Contract>.<Message>` takes precedence.\n")
	b.WriteString("  Add a qualified marker when a contract needs a different category than the shared default.\n")
	b.WriteString("- `gate=A` is annotated with `A=static` or `A=dynamic`.\n")
	b.WriteString("- `excluded` contracts are not yet adopted: missing markers there are tolerated by the check.\n")
	b.WriteString("- This is a coverage and consistency check, not a semantic proof of funding.\n")
	return b.String()
}

func (r report) contractDoc(c contract) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n`%s`\n\n", c.Name, c.FQN)
	b.WriteString(generatedBanner)
	if r.excluded[c.Name] {
		b.WriteString("\n> Not yet adopted: missing markers are tolerated by the check.\n")
	}
	b.WriteString("\n| Message | Category | Gate | Summary |\n| --- | --- | --- | --- |\n")
	var details []string
	for _, msg := range c.Messages {
		m, ok := r.tagFor(c.Name, msg)
		if !ok {
			fmt.Fprintf(&b, "| `%s` | — | — | **missing marker** |\n", msg)
			continue
		}
		summary := m.Description
		if summary == "" {
			summary = "_(no summary)_"
		}
		fmt.Fprintf(&b, "| `%s` | %s | %s | %s |\n", msg, m.Category, m.gateLabel(), summary)
		if m.Detail != "" {
			details = append(details, fmt.Sprintf("- **`%s`** — %s", msg, m.Detail))
		}
	}
	if len(details) > 0 {
		b.WriteString("\n## Details\n\n")
		b.WriteString(strings.Join(details, "\n"))
		b.WriteString("\n")
	}
	return b.String()
}

func (r report) gaps() string {
	var b strings.Builder
	for _, m := range r.missing {
		fmt.Fprintf(&b, "- missing: %s\n", m)
	}
	for _, d := range r.duplicates {
		fmt.Fprintf(&b, "- duplicate: %s\n", d)
	}
	for _, i := range r.invalid {
		fmt.Fprintf(&b, "- invalid: %s\n", i)
	}
	for _, s := range r.stale {
		fmt.Fprintf(&b, "- stale: %s\n", s)
	}
	return b.String()
}

func sortedKeys(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
