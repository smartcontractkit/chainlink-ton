package utils

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// Sample compiled contract JSON (minimal valid Tolk compiled contract)
const sampleCompiledContractJSON = `{"hash":"1abdc3055251a78f03a2e756a8486c6bb7fd591f7c2ba0878201685a59354120","hashBase64":"Gr3DBVJRp48DoudWqEhsa7f9WR98K6CHggFoWlk1QSA=","hex":"b5ee9c72410217010002cd000114ff00f4a413f4bcf2c80b01020162020c0202c6030903bbd3f123e48041ae584b3126df19c605ae5849f5e489f91c5663f49061f125da89a1ac3ff491f4a1f4906304018510a2a78e0a2be5e805919df4a5f4a825f4a59d93daa9c1ae584cf87a1479c605ae5840aa811ed9c60461081e038e01e5e904060701fe31ed44d001d3bfd3ffd33fd30721c141f28501aa02d718d4f40506d31f31fa4831fa5031fa48d70b0720c202f2458208989680f892f89780402281151807c70516f2f481151903be12f2f4c8cf8588fa5282101e55bbf6cf0b8e17cbbfc901fb0024c0008e1710455f0520c00195814a9cf2f0e0c0029370eba4e0f205e13405006c02c8cbffcb3f21d74920a93802f245ab0220c141f285cf0b07ceccf400c9c8cf8f1800048210c5a40ab3cf0bf771cf0b61ccc970fb00007031d70b0720c202f245f892ed44d0d61ffa48fa50fa48d70b0720c20231f2458200c2885153c70515f2f402c8cefa52fa54fa52cb07c9ed5401fc318b4676f6f648fe1430ed44d0d31f31fa4830f8928200c28802c705f2f48d05d8589bdd5d081d1bc818d85b1b081bdb955c19dc98591960fe1430d33f31d74c93f103e893f103e920da0120fe203023fb048d04d31bd8591a5b99c81b995dc818dbd9194b8b8ba0fe143023d0ed1eed53ed448b4737461738fe14304013080052da21ed5421f90001da0102c8cccbffcec9c8cf8f1800048210a33b498ecf0bf771cf0b61ccc970fb000203a3d20a0b000b20536f3cbc20000f22d4c4b8d8b8c2200201200d160201200e150201200f14020120101302012011120011ae10f6a2686b858fc00033af4576a268698f98fd2418fd2818fd2418eb85839061017922c0005bb057e34216c696e6b2e636861696e2e746f6e2e636369702e746573742e5265636569766572822d4c4b8d8b8c2200019b5c510295394041081f77e5090000bb86858100bf80023bfb5176a268698f98fd2418fd2818fd24184e9046896"}`

// --- ParseCompiledContractsPackageRef tests ---

func TestParseCompiledContractsPackageRef_Local(t *testing.T) {
	ref, err := ParseCompiledContractsPackageRef("local")
	require.NoError(t, err)
	assert.Equal(t, CompiledContractsPackageKindLocal, ref.Kind)
}

func TestParseCompiledContractsPackageRef_LocalWithWhitespace(t *testing.T) {
	ref, err := ParseCompiledContractsPackageRef("  local  ")
	require.NoError(t, err)
	assert.Equal(t, CompiledContractsPackageKindLocal, ref.Kind)
}

func TestParseCompiledContractsPackageRef_AbsPath(t *testing.T) {
	ref, err := ParseCompiledContractsPackageRef("/usr/my-contracts-build")
	require.NoError(t, err)
	assert.Equal(t, CompiledContractsPackageKindAbsPath, ref.Kind)
	assert.Equal(t, "/usr/my-contracts-build", ref.AbsPath)
}

func TestParseCompiledContractsPackageRef_RepoRef(t *testing.T) {
	ref, err := ParseCompiledContractsPackageRef("github.com/smartcontractkit/chainlink-ton@contracts/v1.6.0")
	require.NoError(t, err)
	assert.Equal(t, CompiledContractsPackageKindRepoRef, ref.Kind)
	assert.Equal(t, "github.com", ref.Host)
	assert.Equal(t, "smartcontractkit", ref.Organization)
	assert.Equal(t, "chainlink-ton", ref.Repository)
	assert.Equal(t, "contracts/v1.6.0", ref.Tag)
}

func TestParseCompiledContractsPackageRef_Empty(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot be empty")
}

func TestParseCompiledContractsPackageRef_WhitespaceOnly(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("   ")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot be empty")
}

func TestParseCompiledContractsPackageRef_NoAtSign(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("not-a-valid-ref")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid contracts package ref")
}

func TestParseCompiledContractsPackageRef_EmptyRepo(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("@tag")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "repo path cannot be empty")
}

func TestParseCompiledContractsPackageRef_EmptyTag(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("github.com/org/repo@")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "tag cannot be empty")
}

func TestParseCompiledContractsPackageRef_RepoWithSpaces(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("github.com/org /repo@tag")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "repo path must not contain spaces")
}

func TestParseCompiledContractsPackageRef_TagWithSpaces(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("github.com/org/repo@tag with spaces")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "tag must not contain spaces")
}

func TestParseCompiledContractsPackageRef_TagWithAtSign(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("github.com/org/repo@tag@extra")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "tag must not contain '@'")
}

func TestParseCompiledContractsPackageRef_WrongRepoFormat(t *testing.T) {
	// Only 2 parts instead of 3
	_, err := ParseCompiledContractsPackageRef("github.com/repo@tag")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expected format")
}

func TestParseCompiledContractsPackageRef_TooManyRepoParts(t *testing.T) {
	_, err := ParseCompiledContractsPackageRef("github.com/org/repo/extra@tag")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expected format")
}

func TestParseCompiledContractsPackageRef_EmptyHostOrgOrRepo(t *testing.T) {
	// Use empty segment in the middle (host//repo)
	_, err := ParseCompiledContractsPackageRef("host//repo@tag")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "must be non-empty")
}

// --- RetrieveCompiledContractsInput.Validate tests ---

func TestValidate_NilInput(t *testing.T) {
	var input *RetrieveCompiledContractsInput
	err := input.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "input cannot be nil")
}

func TestValidate_ValidLocal(t *testing.T) {
	input := &RetrieveCompiledContractsInput{Package: "local"}
	err := input.Validate()
	require.NoError(t, err)
}

func TestValidate_ValidRepoRef(t *testing.T) {
	input := &RetrieveCompiledContractsInput{
		Package: "github.com/smartcontractkit/chainlink-ton@contracts/v1.6.0",
	}
	err := input.Validate()
	require.NoError(t, err)
}

func TestValidate_InvalidPackage(t *testing.T) {
	input := &RetrieveCompiledContractsInput{Package: ""}
	err := input.Validate()
	require.Error(t, err)
}

// --- AssetNameFromReleaseTag tests ---

func TestAssetNameFromReleaseTag(t *testing.T) {
	tests := []struct {
		name     string
		tag      string
		expected string
	}{
		{
			name:     "standard release tag with slashes",
			tag:      "contracts/v1.6.0",
			expected: "contracts-v1.6.0.tar.gz",
		},
		{
			name:     "tag without slashes",
			tag:      "v1.0.0",
			expected: "v1.0.0.tar.gz",
		},
		{
			name:     "tag with multiple slashes",
			tag:      "a/b/c",
			expected: "a-b-c.tar.gz",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := AssetNameFromReleaseTag(tc.tag)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// --- shouldIncludeRootFile tests ---

func TestShouldIncludeRootFile(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		suffix   string
		expected bool
	}{
		{
			name:     "matching suffix",
			filename: "Router.compiled.json",
			suffix:   ".compiled.json",
			expected: true,
		},
		{
			name:     "non-matching suffix",
			filename: "Router.txt",
			suffix:   ".compiled.json",
			expected: false,
		},
		{
			name:     "nested path rejected",
			filename: "subdir/Router.compiled.json",
			suffix:   ".compiled.json",
			expected: false,
		},
		{
			name:     "dotdot path rejected",
			filename: "../Router.compiled.json",
			suffix:   ".compiled.json",
			expected: false,
		},
		{
			name:     "empty name",
			filename: "",
			suffix:   ".compiled.json",
			expected: false,
		},
		{
			name:     "dot only",
			filename: ".",
			suffix:   ".compiled.json",
			expected: false,
		},
		{
			name:     "package metadata file always included",
			filename: PackageMetadataFile,
			suffix:   ".compiled.json",
			expected: true,
		},
		{
			name:     "empty suffix matches any root file",
			filename: "anyfile.txt",
			suffix:   "",
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := shouldIncludeRootFile(tc.filename, tc.suffix)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// --- readLimited tests ---

func TestReadLimited_WithinLimit(t *testing.T) {
	data := []byte("hello world")
	reader := bytes.NewReader(data)
	result, err := readLimited(reader, 100, "test")
	require.NoError(t, err)
	assert.Equal(t, data, result)
}

func TestReadLimited_ExceedsLimit(t *testing.T) {
	data := []byte("hello world, this is a long string")
	reader := bytes.NewReader(data)
	_, err := readLimited(reader, 5, "test")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds size limit")
}

func TestReadLimited_ExactlyAtLimit(t *testing.T) {
	data := []byte("12345")
	reader := bytes.NewReader(data)
	result, err := readLimited(reader, 5, "test")
	require.NoError(t, err)
	assert.Equal(t, data, result)
}

func TestReadLimited_EmptyReader(t *testing.T) {
	reader := bytes.NewReader(nil)
	result, err := readLimited(reader, 100, "test")
	require.NoError(t, err)
	assert.Empty(t, result)
}

// --- GetArtifactsFromLocalDir tests ---

func TestGetArtifactsFromLocalDir_ReadsMatchingFiles(t *testing.T) {
	dir := t.TempDir()

	// Create matching files
	require.NoError(t, os.WriteFile(filepath.Join(dir, "Router.compiled.json"), []byte(`{"hex":"aabb"}`), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "OnRamp.compiled.json"), []byte(`{"hex":"ccdd"}`), 0o644))

	// Create non-matching file
	require.NoError(t, os.WriteFile(filepath.Join(dir, "README.md"), []byte("readme"), 0o644))

	artifacts, err := GetArtifactsFromLocalDir(dir, ".compiled.json")
	require.NoError(t, err)
	assert.Len(t, artifacts, 2)

	names := make(map[string]bool)
	for _, a := range artifacts {
		names[a.Filename] = true
	}
	assert.True(t, names["Router.compiled.json"])
	assert.True(t, names["OnRamp.compiled.json"])
}

func TestGetArtifactsFromLocalDir_SkipsDirectories(t *testing.T) {
	dir := t.TempDir()

	require.NoError(t, os.Mkdir(filepath.Join(dir, "subdir.compiled.json"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "Router.compiled.json"), []byte(`{"hex":"aa"}`), 0o644))

	artifacts, err := GetArtifactsFromLocalDir(dir, ".compiled.json")
	require.NoError(t, err)
	assert.Len(t, artifacts, 1)
	assert.Equal(t, "Router.compiled.json", artifacts[0].Filename)
}

func TestGetArtifactsFromLocalDir_IncludesPackageMetadata(t *testing.T) {
	dir := t.TempDir()

	require.NoError(t, os.WriteFile(filepath.Join(dir, PackageMetadataFile), []byte(`{"version":"1.0"}`), 0o644))

	artifacts, err := GetArtifactsFromLocalDir(dir, ".compiled.json")
	require.NoError(t, err)
	assert.Len(t, artifacts, 1)
	assert.Equal(t, PackageMetadataFile, artifacts[0].Filename)
}

func TestGetArtifactsFromLocalDir_NonExistentDir(t *testing.T) {
	_, err := GetArtifactsFromLocalDir("/non/existent/dir", ".compiled.json")
	require.Error(t, err)
}

func TestGetArtifactsFromLocalDir_EmptyDir(t *testing.T) {
	dir := t.TempDir()

	artifacts, err := GetArtifactsFromLocalDir(dir, ".compiled.json")
	require.NoError(t, err)
	assert.Empty(t, artifacts)
}

// --- extractFiles tests ---

func createTarGz(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	for name, data := range files {
		hdr := &tar.Header{
			Name:     name,
			Mode:     0o600,
			Size:     int64(len(data)),
			Typeflag: tar.TypeReg,
		}
		require.NoError(t, tw.WriteHeader(hdr))
		_, err := tw.Write(data)
		require.NoError(t, err)
	}

	require.NoError(t, tw.Close())
	require.NoError(t, gw.Close())
	return buf.Bytes()
}

func TestExtractFiles_MatchingSuffix(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"Router.compiled.json":  []byte(`{"hex":"aa"}`),
		"OffRamp.compiled.json": []byte(`{"hex":"bb"}`),
		"README.md":             []byte("readme"),
	})

	artifacts, err := extractFiles(tarGz, ".compiled.json")
	require.NoError(t, err)
	assert.Len(t, artifacts, 2)
}

func TestExtractFiles_NestedFilesSkipped(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"subdir/Router.compiled.json": []byte(`{"hex":"aa"}`),
		"Router.compiled.json":        []byte(`{"hex":"bb"}`),
	})

	artifacts, err := extractFiles(tarGz, ".compiled.json")
	require.NoError(t, err)
	assert.Len(t, artifacts, 1)
	assert.Equal(t, "Router.compiled.json", artifacts[0].Filename)
}

func TestExtractFiles_EmptySuffixMatchesAll(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"file1.txt":  []byte("a"),
		"file2.json": []byte("b"),
	})

	artifacts, err := extractFiles(tarGz, "")
	require.NoError(t, err)
	assert.Len(t, artifacts, 2)
}

func TestExtractFiles_InvalidGzip(t *testing.T) {
	_, err := extractFiles([]byte("not gzip"), ".json")
	require.Error(t, err)
}

func TestExtractFiles_IncludesPackageMetadataFile(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		PackageMetadataFile:    []byte(`{"version":"1.0"}`),
		"Router.compiled.json": []byte(`{"hex":"aa"}`),
	})

	artifacts, err := extractFiles(tarGz, ".compiled.json")
	require.NoError(t, err)
	assert.Len(t, artifacts, 2)
}

// --- verifyDeployableCodeHash tests ---

func TestVerifyDeployableCodeHash_NilCell(t *testing.T) {
	err := verifyDeployableCodeHash(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "deployer code cell is nil")
}

// --- getBytesFromURL tests ---

func TestGetBytesFromURL_Success(t *testing.T) {
	expected := []byte("hello server")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(expected)
	}))
	defer server.Close()

	result, err := getBytesFromURL(context.Background(), server.URL)
	require.NoError(t, err)
	assert.Equal(t, expected, result)
}

func TestGetBytesFromURL_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("internal error"))
	}))
	defer server.Close()

	_, err := getBytesFromURL(context.Background(), server.URL)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "responded with an error")
}

func TestGetBytesFromURL_ContextCancelled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data"))
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := getBytesFromURL(ctx, server.URL)
	require.Error(t, err)
}

// --- DownloadArtifacts tests ---

func TestDownloadArtifacts_Success(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"ccip.test.receiver.compiled.json": []byte(sampleCompiledContractJSON),
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/myorg/myrepo/releases/download/myrelease/myasset.tar.gz", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(tarGz)
	}))
	defer server.Close()

	original := githubBaseURL
	githubBaseURL = server.URL
	t.Cleanup(func() { githubBaseURL = original })

	out, err := DownloadArtifacts(context.Background(), DownloadArtifactsInput{
		Organization:        "myorg",
		Repository:          "myrepo",
		Release:             "myrelease",
		Asset:               "myasset.tar.gz",
		FilesSuffixToFilter: contractsFileNameSuffix,
	})
	require.NoError(t, err)
	require.Len(t, out.Artifacts, 1)
	assert.Equal(t, "ccip.test.receiver.compiled.json", out.Artifacts[0].Filename)
}

func TestDownloadArtifacts_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("not found"))
	}))
	defer server.Close()

	original := githubBaseURL
	githubBaseURL = server.URL
	t.Cleanup(func() { githubBaseURL = original })

	_, err := DownloadArtifacts(context.Background(), DownloadArtifactsInput{
		Organization:        "myorg",
		Repository:          "myrepo",
		Release:             "myrelease",
		Asset:               "myasset.tar.gz",
		FilesSuffixToFilter: contractsFileNameSuffix,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to download contracts")
}

func TestDownloadArtifacts_NoMatchingArtifacts(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"README.md": []byte("readme"),
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(tarGz)
	}))
	defer server.Close()

	original := githubBaseURL
	githubBaseURL = server.URL
	t.Cleanup(func() { githubBaseURL = original })

	_, err := DownloadArtifacts(context.Background(), DownloadArtifactsInput{
		Organization:        "myorg",
		Repository:          "myrepo",
		Release:             "myrelease",
		Asset:               "myasset.tar.gz",
		FilesSuffixToFilter: contractsFileNameSuffix,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no artifacts found")
}

// --- compiledContractsFromArtifacts tests ---

func TestCompiledContractsFromArtifacts_ValidContract(t *testing.T) {
	artifacts := []Artifact{
		{
			Filename: "ccip.test.receiver.compiled.json",
			Data:     []byte(sampleCompiledContractJSON),
		},
	}

	result, err := compiledContractsFromArtifacts(artifacts, nil, "local")
	require.NoError(t, err)
	assert.Contains(t, result, state.TonReceiver)
	assert.Equal(t, state.TonReceiver, result[state.TonReceiver].Type)
	assert.Equal(t, "local", result[state.TonReceiver].PackageRef)
	assert.NotNil(t, result[state.TonReceiver].Code)
}

func TestCompiledContractsFromArtifacts_FilteredContracts(t *testing.T) {
	artifacts := []Artifact{
		{
			Filename: "ccip.test.receiver.compiled.json",
			Data:     []byte(sampleCompiledContractJSON),
		},
	}

	// Only request TonReceiver
	result, err := compiledContractsFromArtifacts(artifacts, []ds.ContractType{state.TonReceiver}, "local")
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Contains(t, result, state.TonReceiver)
}

func TestCompiledContractsFromArtifacts_UnknownContractType(t *testing.T) {
	artifacts := []Artifact{
		{
			Filename: "ccip.test.receiver.compiled.json",
			Data:     []byte(sampleCompiledContractJSON),
		},
	}

	_, err := compiledContractsFromArtifacts(artifacts, []ds.ContractType{"NonExistent"}, "local")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown contractType")
}

func TestCompiledContractsFromArtifacts_NoMatchingArtifacts(t *testing.T) {
	artifacts := []Artifact{
		{
			Filename: "Unknown.compiled.json",
			Data:     []byte(sampleCompiledContractJSON),
		},
	}

	result, err := compiledContractsFromArtifacts(artifacts, nil, "local")
	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestCompiledContractsFromArtifacts_InvalidJSON(t *testing.T) {
	artifacts := []Artifact{
		{
			Filename: "ccip.test.receiver.compiled.json",
			Data:     []byte("not valid json"),
		},
	}

	_, err := compiledContractsFromArtifacts(artifacts, nil, "local")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse compiled contract")
}

func TestCompiledContractsFromArtifacts_EmptyArtifacts(t *testing.T) {
	result, err := compiledContractsFromArtifacts(nil, nil, "local")
	require.NoError(t, err)
	assert.Empty(t, result)
}

// --- Integration-like tests using local dir + compiled artifacts ---

func TestGetArtifactsFromLocalDir_ThenCompile(t *testing.T) {
	dir := t.TempDir()

	require.NoError(t, os.WriteFile(
		filepath.Join(dir, "ccip.test.receiver.compiled.json"),
		[]byte(sampleCompiledContractJSON),
		0o644,
	))

	artifacts, err := GetArtifactsFromLocalDir(dir, contractsFileNameSuffix)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)

	compiled, err := compiledContractsFromArtifacts(artifacts, nil, dir)
	require.NoError(t, err)
	assert.Contains(t, compiled, state.TonReceiver)
}

func TestExtractFiles_ThenCompile(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"ccip.test.receiver.compiled.json": []byte(sampleCompiledContractJSON),
	})

	artifacts, err := extractFiles(tarGz, contractsFileNameSuffix)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)

	compiled, err := compiledContractsFromArtifacts(artifacts, nil, "test-ref")
	require.NoError(t, err)
	assert.Contains(t, compiled, state.TonReceiver)
}

// --- contractsMapping coverage ---

func TestContractsMappingCompleteness(t *testing.T) {
	// Verify all mapped contract types have non-empty compiled version keys
	for ct, meta := range contractsMapping {
		assert.NotEmpty(t, string(ct), "contract type should not be empty")
		assert.NotEmpty(t, meta.CompiledVersionKey, "compiled version key should not be empty for %s", ct)
		assert.True(t, strings.HasSuffix(meta.CompiledVersionKey, contractsFileNameSuffix),
			"compiled version key %q for %s should end with %s", meta.CompiledVersionKey, ct, contractsFileNameSuffix)
	}
}

// --- readLimited with error reader ---

type errorReader struct{}

func (e *errorReader) Read(p []byte) (int, error) {
	return 0, io.ErrUnexpectedEOF
}

func TestReadLimited_ReaderError(t *testing.T) {
	_, err := readLimited(&errorReader{}, 100, "test")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "error while read")
}
