// SPDX-License-Identifier: BUSL-1.1
package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const checkWindow = 5

var policyGroups = []string{"multi-hop", "normal", "normal-local", "recovery", "non-reject", "best-effort"}

var (
	tokenRE    = regexp.MustCompile(`(?s)"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/`)
	importRE   = regexp.MustCompile(`(?m)^\s*import\s+"([^"]+)"`)
	contractRE = regexp.MustCompile(`(?s)\bcontract\s+(\w+)\s*\{([^}]*)\}`)
	incomingRE = regexp.MustCompile(`\bincomingMessages\s*:`)
	aliasRE    = regexp.MustCompile(`(?m)^\s*type\s+(\w+)\s*=`)
	declRE     = regexp.MustCompile(`(?m)^\s*(?:type|struct|enum|fun|get|const|global|contract|import|tolk|@)\b`)
	structRE   = regexp.MustCompile(`(?m)^\s*struct\s+(?:\([^)]*\)\s*)?(\w+)`)
	nameRE     = regexp.MustCompile(`^[A-Za-z_]\w*$`)
	fieldRE    = regexp.MustCompile(`^\w+\s*:`)
	markerRE   = regexp.MustCompile(`^\s*//\s*lint:min-value/(\S+)\s+(\w+)(?:\s+(.*))?\s*$`)
	tagRE      = regexp.MustCompile(`^\s*//\s*lint:min-value\b`)
	assertRE   = regexp.MustCompile(`^\s*assertMinValue\s*\(`)
	tryRE      = regexp.MustCompile(`\btry\s*\{`)
	catchRE    = regexp.MustCompile(`^\s*catch\b`)
	// Binding-only contracts whose onInternalMessage deliberately throws.
	exempt = map[string]bool{"TokenPool": true, "CCIPReceiver": true}
)

type marker struct {
	file, name, group, reason string
	line                      int
}

type lineRange struct {
	first, last int
}

type source struct {
	file        string
	code        []string
	imports     []string
	aliases     map[string]string
	structs     map[string]bool
	markers     []marker
	caught      []lineRange
	diagnostics []string
	contracts   []contract
}

type contract struct {
	name  string
	types []string
}

type report struct {
	contracts                    int
	groups                       map[string]int
	classifications, diagnostics []string
}

// mask preserves line numbers while excluding comments and, optionally, string literals.
func mask(text string, lineComments, literals bool) string {
	return tokenRE.ReplaceAllStringFunc(text, func(token string) string {
		if strings.HasPrefix(token, "//") && !lineComments {
			return token
		}
		if !strings.HasPrefix(token, "/") && !literals {
			return token
		}
		return strings.Map(func(r rune) rune {
			if r == '\n' {
				return r
			}
			return ' '
		}, token)
	})
}

func load(file string, cache map[string]*source) (*source, error) {
	if s := cache[file]; s != nil {
		return s, nil
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	text := string(data)
	code := mask(text, true, true)
	s := &source{file: file, code: strings.Split(code, "\n"), caught: caughtBlocks(code), aliases: map[string]string{}, structs: map[string]bool{}}
	for _, match := range importRE.FindAllStringSubmatch(mask(text, true, false), -1) {
		if strings.HasPrefix(match[1], "@") {
			continue
		} // bundled standard-library imports
		target := filepath.Clean(filepath.Join(filepath.Dir(file), match[1]))
		if filepath.Ext(target) == "" {
			target += ".tolk"
		}
		if filepath.Ext(target) == ".tolk" {
			s.imports = append(s.imports, target)
		}
	}
	for _, match := range structRE.FindAllStringSubmatch(code, -1) {
		s.structs[match[1]] = true
	}
	for _, match := range aliasRE.FindAllStringSubmatchIndex(code, -1) {
		rhs := code[match[1]:]
		end := len(rhs)
		if i := strings.IndexByte(rhs, ';'); i >= 0 {
			end = i
		}
		if next := declRE.FindStringIndex(rhs); next != nil && next[0] < end {
			end = next[0]
		}
		s.aliases[code[match[2]:match[3]]] = strings.TrimSpace(rhs[:end])
	}
	for _, match := range contractRE.FindAllStringSubmatch(code, -1) {
		body := match[2]
		field := incomingRE.FindStringIndex(body)
		if field == nil {
			s.contracts = append(s.contracts, contract{name: match[1]})
			continue
		}
		var parts []string
		for _, line := range strings.Split(body[field[1]:], "\n") {
			line = strings.TrimSpace(line)
			if fieldRE.MatchString(line) {
				break
			}
			parts = append(parts, line)
		}
		s.contracts = append(s.contracts, contract{match[1], splitTypes(strings.Join(parts, " "))})
	}
	for i, line := range strings.Split(mask(text, false, true), "\n") {
		if match := markerRE.FindStringSubmatch(line); match != nil {
			reason := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(match[3]), "—"))
			s.markers = append(s.markers, marker{file: file, name: match[2], group: match[1], reason: reason, line: i + 1})
		} else if tagRE.MatchString(line) {
			s.diagnostics = append(s.diagnostics, fmt.Sprintf("%s:%d: expected // lint:min-value/<group> <Message> <description>", file, i+1))
		}
	}
	cache[file] = s
	return s, nil
}

func splitTypes(expression string) []string {
	var names []string
	for _, part := range strings.Split(expression, "|") {
		if part = strings.TrimSpace(part); part != "" {
			names = append(names, part)
		}
	}
	return names
}

func closure(file string, cache map[string]*source, seen map[string]bool) ([]*source, error) {
	if seen[file] {
		return nil, nil
	}
	seen[file] = true
	s, err := load(file, cache)
	if err != nil {
		return nil, err
	}
	result := []*source{s}
	for _, target := range s.imports {
		children, err := closure(target, cache, seen)
		if err != nil {
			return nil, fmt.Errorf("%s: import %s: %w", file, target, err)
		}
		result = append(result, children...)
	}
	return result, nil
}

// Resolve union aliases within this contract's import closure. Generic message aliases keep
// their concrete alias name (the name used by dispatch) rather than their generic parameters.
func expand(name string, sources []*source, visiting map[string]bool) ([]string, error) {
	if visiting[name] {
		return nil, fmt.Errorf("cyclic message alias %s", name)
	}
	visiting[name] = true
	defer delete(visiting, name)
	for _, s := range sources {
		if rhs, ok := s.aliases[name]; ok {
			if strings.Contains(rhs, "<") && !strings.Contains(rhs, "|") {
				base := strings.TrimSpace(rhs[:strings.IndexByte(rhs, '<')])
				for _, imported := range sources {
					if imported.structs[base] {
						return []string{name}, nil
					}
				}
				return nil, fmt.Errorf("unresolved generic message type %s", base)
			}
			var result []string
			for _, child := range splitTypes(rhs) {
				messages, err := expand(child, sources, visiting)
				if err != nil {
					return nil, err
				}
				result = append(result, messages...)
			}
			return result, nil
		}
	}
	if !nameRE.MatchString(name) {
		return nil, fmt.Errorf("unsupported message type %q", name)
	}
	for _, s := range sources {
		if s.structs[name] {
			return []string{name}, nil
		}
	}
	return nil, fmt.Errorf("unresolved message type %s", name)
}

// Brace matching only establishes an enclosing try/catch, not the correctness of its recovery.
func caughtBlocks(code string) []lineRange {
	tries := map[int]bool{}
	for _, match := range tryRE.FindAllStringIndex(code, -1) {
		tries[match[1]-1] = true
	}
	type block struct {
		line  int
		isTry bool
	}
	var stack []block
	var caught []lineRange
	line := 1
	for i := 0; i < len(code); i++ {
		switch code[i] {
		case '\n':
			line++
		case '{':
			stack = append(stack, block{line, tries[i]})
		case '}':
			if len(stack) == 0 {
				continue
			}
			b := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if b.isTry && catchRE.MatchString(code[i+1:]) {
				caught = append(caught, lineRange{b.line, line})
			}
		}
	}
	return caught
}

func checksNear(s *source, m marker) int {
	count := 0
	for i := m.line; i < len(s.code) && i < m.line+checkWindow; i++ {
		line := strings.TrimSpace(s.code[i])
		if strings.HasPrefix(line, "}") {
			break
		} // do not borrow a check from the next handler
		if assertRE.MatchString(line) {
			count++
		}
	}
	return count
}

func validatePolicy(s *source, m marker) string {
	checks := checksNear(s, m)
	switch m.group {
	case "multi-hop":
		if checks < 2 {
			return "multi-hop requires safety and admission assertMinValue calls within five lines in this handler"
		}
	case "normal", "normal-local":
		if checks == 0 {
			return "no assertMinValue call within five lines in this handler"
		}
		if m.group == "normal-local" {
			for _, b := range s.caught {
				if b.first <= m.line && m.line < b.last {
					return ""
				}
			}
			return "normal-local requires the tagged check inside try/catch for local recovery"
		}
	case "recovery", "non-reject", "best-effort":
		if checks != 0 {
			return m.group + " must not introduce a nearby assertMinValue gate"
		}
	default:
		return fmt.Sprintf("unknown min-value group %q; expected %s", m.group, strings.Join(policyGroups, ", "))
	}
	return ""
}

func inScope(file string) bool {
	p := filepath.ToSlash(file)
	if strings.Contains(p, "/ccip/cct/") || strings.Contains(p, "/test/") {
		return false
	}
	return strings.Contains(p, "/ccip/") || strings.Contains(p, "/mcms/") || strings.Contains(p, "/lib/receiver/")
}

func lint(root string) (report, error) {
	r := report{groups: map[string]int{}}
	root, err := filepath.Abs(root)
	if err != nil {
		return r, err
	}
	var files []string
	err = filepath.WalkDir(root, func(file string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == "node_modules" || strings.HasPrefix(entry.Name(), ".") {
				return filepath.SkipDir
			}
		} else if strings.HasSuffix(file, ".tolk") && inScope(file) {
			files = append(files, file)
		}
		return nil
	})
	if err != nil {
		return r, err
	}
	cache := map[string]*source{}
	used := map[string]bool{}
	visitedSources := map[string]bool{}
	visitedMarkers := map[string]marker{}
	for _, file := range files {
		s, err := load(file, cache)
		if err != nil {
			return r, err
		}
		for _, c := range s.contracts {
			if exempt[c.name] {
				continue
			}
			r.contracts++
			if len(c.types) == 0 {
				return r, fmt.Errorf("%s: missing or empty incomingMessages for %s", file, c.name)
			}
			sources, err := closure(file, cache, map[string]bool{})
			if err != nil {
				return r, err
			}
			markers := map[string][]marker{}
			for _, imported := range sources {
				if !visitedSources[imported.file] {
					r.diagnostics = append(r.diagnostics, imported.diagnostics...)
					visitedSources[imported.file] = true
				}
				for _, m := range imported.markers {
					markers[m.name] = append(markers[m.name], m)
					visitedMarkers[fmt.Sprintf("%s:%d", m.file, m.line)] = m
				}
			}
			messages := map[string]bool{}
			for _, name := range c.types {
				expanded, err := expand(name, sources, map[string]bool{})
				if err != nil {
					return r, fmt.Errorf("%s (%s): %w", file, c.name, err)
				}
				for _, msg := range expanded {
					messages[msg] = true
				}
			}
			for msg := range messages {
				tags := markers[msg]
				for _, m := range tags {
					used[fmt.Sprintf("%s:%d", m.file, m.line)] = true
				}
				if len(tags) != 1 {
					r.diagnostics = append(r.diagnostics, fmt.Sprintf("%s (%s): %s requires exactly one import-scoped tag; found %d", file, c.name, msg, len(tags)))
					continue
				}
				m := tags[0]
				where := fmt.Sprintf("%s:%d (%s, %s)", m.file, m.line, c.name, msg)
				if m.reason == "" {
					r.diagnostics = append(r.diagnostics, where+": tag requires a description")
				} else if problem := validatePolicy(cache[m.file], m); problem != "" {
					r.diagnostics = append(r.diagnostics, where+": "+problem)
				} else {
					r.groups[m.group]++
					r.classifications = append(r.classifications, where+": "+m.group+" — "+m.reason)
				}
			}
		}
	}
	if r.contracts == 0 {
		return r, fmt.Errorf("no in-scope contracts found under %s", root)
	}
	for where, m := range visitedMarkers {
		if !used[where] {
			r.diagnostics = append(r.diagnostics, where+": stale tag "+m.name)
		}
	}
	sort.Strings(r.diagnostics)
	sort.Strings(r.classifications)
	return r, nil
}
