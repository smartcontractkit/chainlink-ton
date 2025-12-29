package main

import (
	"fmt"
	"hash/crc32"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// structWithOpcode represents a struct definition with an opcode
type structWithOpcode struct {
	name   string
	opcode uint32
	line   string
	loc    location
}

type location struct {
	filePath string
	row      int
	column   int
}

// findTolkFilesInDir recursively finds all .tolk files in the given directory
func findTolkFilesInDir(root string) ([]string, error) {
	var tolkFiles []string

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasSuffix(info.Name(), ".tolk") {
			tolkFiles = append(tolkFiles, path)
		}
		return nil
	})

	return tolkFiles, err
}

// findFilesFromPatterns finds files matching the given patterns
// Supports glob patterns, directories, and individual files
func findFilesFromPatterns(patterns []string) ([]string, error) {
	fileSet := make(map[string]bool)
	var files []string

	for _, pattern := range patterns {
		// Check if it's a directory
		info, err := os.Stat(pattern)
		if err == nil && info.IsDir() {
			// It's a directory, find all .tolk files recursively
			dirFiles, err := findTolkFilesInDir(pattern)
			if err != nil {
				return nil, fmt.Errorf("error finding files in directory %s: %w", pattern, err)
			}
			for _, f := range dirFiles {
				if !fileSet[f] {
					fileSet[f] = true
					files = append(files, f)
				}
			}
		} else if err == nil && !info.IsDir() {
			// It's a file, add it directly
			if !fileSet[pattern] {
				fileSet[pattern] = true
				files = append(files, pattern)
			}
		} else {
			// Try as glob pattern
			matches, err := filepath.Glob(pattern)
			if err != nil {
				return nil, fmt.Errorf("invalid pattern %s: %w", pattern, err)
			}
			if len(matches) == 0 {
				fmt.Fprintf(os.Stderr, "Warning: Pattern %s matched no files\n", pattern)
				continue
			}
			for _, match := range matches {
				info, err := os.Stat(match)
				if err != nil {
					continue
				}
				if info.IsDir() {
					// If glob matched a directory, find all .tolk files in it
					dirFiles, err := findTolkFilesInDir(match)
					if err != nil {
						return nil, fmt.Errorf("error finding files in directory %s: %w", match, err)
					}
					for _, f := range dirFiles {
						if !fileSet[f] {
							fileSet[f] = true
							files = append(files, f)
						}
					}
				} else {
					// It's a file
					if !fileSet[match] {
						fileSet[match] = true
						files = append(files, match)
					}
				}
			}
		}
	}

	return files, nil
}

// parseStructsWithOpcodes parses a file and finds all structs with opcodes
func parseStructsWithOpcodes(filePath string) ([]structWithOpcode, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	var structs []structWithOpcode
	lines := strings.Split(string(content), "\n")

	// Regex to match: struct (0xHEXVALUE) StructName
	// Captures the hex value and struct name
	re := regexp.MustCompile(`struct\s+\(0x([0-9a-fA-F]+)\)\s+(\w+)`)

	// Track line numbers for skip comments
	skipNextStruct := false

	for i, line := range lines {
		// Check for skip validation comment
		if strings.Contains(line, "oplint:skip") {
			skipNextStruct = true
			continue
		}

		matches := re.FindStringSubmatch(line)
		if len(matches) >= 3 {
			// Skip this struct if the previous line had a skip comment
			if skipNextStruct {
				skipNextStruct = false
				continue
			}

			hexStr := matches[1]
			structName := matches[2]

			// Parse hex string to uint32
			opcode, err := strconv.ParseUint(hexStr, 16, 32)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Warning: Failed to parse opcode in %s line %d: %v\n", filePath, i+1, err)
				continue
			}

			structs = append(structs, structWithOpcode{
				name:   structName,
				opcode: uint32(opcode),
				line:   matches[0],
				loc: location{
					filePath: filePath,
					row:      i + 1,
					column:   strings.Index(line, matches[0]) + len("struct (") + 1,
				},
			})
		}

		// Reset skip flag if we didn't find a struct
		if !re.MatchString(line) && skipNextStruct {
			// Keep the flag if the line is empty or a comment continuation
			trimmed := strings.TrimSpace(line)
			if trimmed != "" && !strings.HasPrefix(trimmed, "//") {
				skipNextStruct = false
			}
		}
	}

	return structs, nil
}

// calculateCRC32 calculates the CRC32 checksum of a string
func calculateCRC32(s string) uint32 {
	return crc32.ChecksumIEEE([]byte(s))
}

// validateStructOpcodes validates that opcodes match CRC32 of struct names
func validateStructOpcodes(structs []structWithOpcode) []string {
	var errors []string

	for _, s := range structs {
		expectedCRC := calculateCRC32(s.name)
		if s.opcode != expectedCRC {
			errors = append(errors, fmt.Sprintf(
				"%s: struct '%s' has opcode 0x%08x but expected 0x%08x (CRC32 of '%s')\n  Line: %s",
				fmtLocation(s.loc),
				s.name,
				s.opcode,
				expectedCRC,
				s.name,
				s.line,
			))
		} else {
			fmt.Printf("✓ Valid %s (0x%08x) | %s\n", s.name, s.opcode, fmtLocation(s.loc))
		}
	}

	return errors
}

func fmtLocation(loc location) string {
	return fmt.Sprintf("%s:%d:%d", loc.filePath, loc.row, loc.column)
}

// fixStructOpcodes automatically fixes incorrect opcodes in files
func fixStructOpcodes(structs []structWithOpcode) error {
	// Group structs by file
	fileStructs := make(map[string][]structWithOpcode)
	for _, s := range structs {
		expectedCRC := calculateCRC32(s.name)
		if s.opcode != expectedCRC {
			fileStructs[s.loc.filePath] = append(fileStructs[s.loc.filePath], s)
		}
	}

	if len(fileStructs) == 0 {
		fmt.Println("No fixes needed - all opcodes are correct!")
		return nil
	}

	fixCount := 0
	for filePath, structs := range fileStructs {
		content, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", filePath, err)
		}

		fileContent := string(content)
		modified := false

		for _, s := range structs {
			expectedCRC := calculateCRC32(s.name)
			oldPattern := fmt.Sprintf("struct (0x%08x) %s", s.opcode, s.name)
			// Also try uppercase hex
			oldPatternUpper := fmt.Sprintf("struct (0x%08X) %s", s.opcode, s.name)
			newPattern := fmt.Sprintf("struct (0x%08x) %s", expectedCRC, s.name)

			if strings.Contains(fileContent, oldPattern) {
				fileContent = strings.Replace(fileContent, oldPattern, newPattern, 1)
				modified = true
				fmt.Printf("Fixed %s: 0x%08x -> 0x%08x\n", s.name, s.opcode, expectedCRC)
				fixCount++
			} else if strings.Contains(fileContent, oldPatternUpper) {
				fileContent = strings.Replace(fileContent, oldPatternUpper, newPattern, 1)
				modified = true
				fmt.Printf("Fixed %s: 0x%08X -> 0x%08x\n", s.name, s.opcode, expectedCRC)
				fixCount++
			}
		}

		if modified {
			err = os.WriteFile(filePath, []byte(fileContent), 0644)
			if err != nil {
				return fmt.Errorf("failed to write %s: %w", filePath, err)
			}
			fmt.Printf("  ✓ Updated %s\n", filePath)
		}
	}

	fmt.Printf("\n✅ Fixed %d struct opcodes\n", fixCount)
	return nil
}

func main() {
	var fixMode bool
	args := os.Args[1:]

	// Parse flags
	if len(args) == 1 && (args[0] == "--help" || args[0] == "-h") {
		printHelp()
	}
	for i := 0; i < len(args); i++ {
		if args[i] == "--fix" || args[i] == "-f" {
			fixMode = true
			args = append(args[:i], args[i+1:]...)
			i--
		}
	}

	if len(args) == 0 {
		args = []string{"."}
	}

	patterns := args

	fmt.Printf("Searching for .tolk files matching %d pattern(s)...\n", len(patterns))

	// Find all .tolk files matching the patterns
	tolkFiles, err := findFilesFromPatterns(patterns)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error finding .tolk files: %v\n", err)
		os.Exit(1)
	}

	if len(tolkFiles) == 0 {
		fmt.Println("No .tolk files found")
		os.Exit(0)
	}

	fmt.Printf("Found %d .tolk files\n\n", len(tolkFiles))

	// Parse all structs with opcodes
	var allStructs []structWithOpcode
	for _, file := range tolkFiles {
		structs, err := parseStructsWithOpcodes(file)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error parsing %s: %v\n", file, err)
			continue
		}
		allStructs = append(allStructs, structs...)
	}

	fmt.Printf("Found %d structs with opcodes\n\n", len(allStructs))

	if len(allStructs) == 0 {
		fmt.Println("No structs with opcodes found")
		os.Exit(0)
	}

	// Fix mode: automatically correct opcodes
	if fixMode {
		fmt.Println("Fix mode enabled - correcting opcodes...")
		fmt.Println()
		if err := fixStructOpcodes(allStructs); err != nil {
			fmt.Fprintf(os.Stderr, "Error fixing opcodes: %v\n", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// Validate opcodes
	errors := validateStructOpcodes(allStructs)

	if len(errors) > 0 {
		fmt.Printf("❌ Found %d validation errors:\n\n", len(errors))
		for _, err := range errors {
			fmt.Println(err)
			fmt.Println()
		}
		fmt.Printf("\n💡 To automatically fix these, run with --fix flag:\n")
		fmt.Printf("   %s --fix %s\n", os.Args[0], strings.Join(patterns, " "))
		os.Exit(1)
	}

	fmt.Println("✅ All struct opcodes are valid!")
}

func printHelp() {
	fmt.Fprintf(os.Stderr, "Usage: %s [--fix|-f] <pattern> [pattern...]\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "Examples:\n")
	fmt.Fprintf(os.Stderr, "  %s ./contracts                    # directory\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "  %s contracts/**/*.tolk            # glob pattern\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "  %s file1.tolk file2.tolk          # specific files\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "  %s contracts/ pkg/                # multiple directories\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "Options:\n")
	fmt.Fprintf(os.Stderr, "  --fix, -f  Automatically fix incorrect opcodes\n")
	os.Exit(1)
}
