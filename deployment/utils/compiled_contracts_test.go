package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseContractsRef(t *testing.T) {
	tests := []struct {
		name        string
		ref         string
		wantSource  ContractsSource
		wantErrMsg  string
	}{
		// ── empty / invalid ──────────────────────────────────────────
		{
			name:       "empty string returns error",
			ref:        "",
			wantErrMsg: "contracts ref must not be empty",
		},
		{
			name:       "random invalid string returns error",
			ref:        "not-valid!",
			wantErrMsg: "invalid contracts ref",
		},
		{
			name:       "string with spaces returns error",
			ref:        "some spaces here",
			wantErrMsg: "invalid contracts ref",
		},
		{
			name:       "uppercase hex is not matched as bare SHA",
			ref:        "ABCDEF123456",
			wantErrMsg: "invalid contracts ref",
		},

		// ── local ────────────────────────────────────────────────────
		{
			name: "local keyword",
			ref:  "local",
			wantSource: ContractsSource{
				Kind: ContractsSourceKindLocal,
			},
		},
		{
			name: "local with absolute path",
			ref:  "local:/tmp/my-contracts",
			wantSource: ContractsSource{
				Kind: ContractsSourceKindLocal,
				Path: "/tmp/my-contracts",
			},
		},
		{
			name:       "local with relative path returns error",
			ref:        "local:relative/path",
			wantErrMsg: "local path must be absolute",
		},
		{
			name:       "local: with empty path is treated as relative",
			ref:        "local:",
			wantErrMsg: "local path must be absolute",
		},

		// ── sha: prefix ──────────────────────────────────────────────
		{
			name: "sha prefix with valid commit",
			ref:  "sha:054376f21418",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSHA,
				Version: "054376f21418",
			},
		},
		{
			name: "sha prefix with full 40-char sha",
			ref:  "sha:abcdef1234567890abcdef1234567890abcdef12",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSHA,
				Version: "abcdef1234567890abcdef1234567890abcdef12",
			},
		},
		{
			name:       "sha prefix with empty value returns error",
			ref:        "sha:",
			wantErrMsg: "sha: prefix requires a non-empty commit SHA",
		},
		{
			name: "sha prefix accepts non-hex characters",
			ref:  "sha:not-hex-but-accepted",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSHA,
				Version: "not-hex-but-accepted",
			},
		},

		// ── semver ───────────────────────────────────────────────────
		{
			name: "semver without v prefix",
			ref:  "1.6.0",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSemver,
				Version: "1.6.0",
			},
		},
		{
			name: "semver with v prefix",
			ref:  "v1.6.0",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSemver,
				Version: "1.6.0",
			},
		},
		{
			name: "semver with prerelease",
			ref:  "1.0.0-alpha.1",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSemver,
				Version: "1.0.0-alpha.1",
			},
		},
		{
			name: "semver with build metadata",
			ref:  "1.0.0+build.123",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSemver,
				Version: "1.0.0+build.123",
			},
		},
		{
			name: "semver major only (coerced by library)",
			ref:  "2",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSemver,
				Version: "2",
			},
		},
		{
			name: "semver major.minor only",
			ref:  "2.1",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSemver,
				Version: "2.1",
			},
		},

		// ── legacy bare hex SHA ──────────────────────────────────────
		{
			name: "bare hex 6 chars (minimum)",
			ref:  "abcdef",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSHA,
				Version: "abcdef",
			},
		},
		{
			name: "bare hex 12 chars",
			ref:  "054376f21418",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSHA,
				Version: "054376f21418",
			},
		},
		{
			name: "bare hex 40 chars (full SHA)",
			ref:  "abcdef1234567890abcdef1234567890abcdef12",
			wantSource: ContractsSource{
				Kind:    ContractsSourceKindGithubSHA,
				Version: "abcdef1234567890abcdef1234567890abcdef12",
			},
		},
		{
			name:       "hex string too short (5 chars) is invalid",
			ref:        "abcde",
			wantErrMsg: "invalid contracts ref",
		},
		{
			name:       "hex string too long (41 chars) is invalid",
			ref:        "abcdef1234567890abcdef1234567890abcdef123",
			wantErrMsg: "invalid contracts ref",
		},
		{
			name:       "mixed case hex is invalid (uppercase present)",
			ref:        "AbCdEf123456",
			wantErrMsg: "invalid contracts ref",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParseContractsRef(tc.ref)

			if tc.wantErrMsg != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErrMsg)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tc.wantSource.Kind, got.Kind, "Kind mismatch")
			assert.Equal(t, tc.wantSource.Version, got.Version, "Version mismatch")
			assert.Equal(t, tc.wantSource.Path, got.Path, "Path mismatch")
		})
	}
}

func TestRetrieveCompiledContractsInput_Validate(t *testing.T) {
	tests := []struct {
		name       string
		input      RetrieveCompiledContractsInput
		wantErrMsg string
	}{
		{
			name:       "empty version returns error",
			input:      RetrieveCompiledContractsInput{ContractsVersionSha: ""},
			wantErrMsg: "contracts version SHA cannot be empty",
		},
		{
			name:       "whitespace-only version returns error",
			input:      RetrieveCompiledContractsInput{ContractsVersionSha: "   "},
			wantErrMsg: "contracts version SHA cannot be empty",
		},
		{
			name:  "valid version passes",
			input: RetrieveCompiledContractsInput{ContractsVersionSha: "054376f21418"},
		},
		{
			name:  "local version passes",
			input: RetrieveCompiledContractsInput{ContractsVersionSha: "local"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.input.Validate()

			if tc.wantErrMsg != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErrMsg)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestExtractFiles(t *testing.T) {
	t.Run("invalid gzip data returns error", func(t *testing.T) {
		_, err := extractFiles([]byte("not-gzip"), ".json")
		require.Error(t, err)
	})
}
