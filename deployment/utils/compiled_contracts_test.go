package utils //nolint:revive,nolintlint

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
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

// --- isValidRootFile tests ---

func TestIsValidRootFile(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		expected bool
	}{
		{
			name:     "compiled json file",
			filename: "Router.compiled.json",
			expected: true,
		},
		{
			name:     "other file type",
			filename: "Router.txt",
			expected: true,
		},
		{
			name:     "nested path rejected",
			filename: "subdir/Router.compiled.json",
			expected: false,
		},
		{
			name:     "dotdot path rejected",
			filename: "../Router.compiled.json",
			expected: false,
		},
		{
			name:     "empty name",
			filename: "",
			expected: false,
		},
		{
			name:     "dot only",
			filename: ".",
			expected: false,
		},
		{
			name:     "package metadata file",
			filename: PackageMetadataFile,
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := isValidRootFile(tc.filename)
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

// --- extractFilesToDir tests ---

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

func TestExtractFilesToDir_AllRootFiles(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"Router.compiled.json":  []byte(`{"hex":"aa"}`),
		"OffRamp.compiled.json": []byte(`{"hex":"bb"}`),
		"README.md":             []byte("readme"),
	})

	dir := t.TempDir()
	require.NoError(t, extractFilesToDir(tarGz, dir))

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Len(t, entries, 3)
}

func TestExtractFilesToDir_NestedFilesSkipped(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		"subdir/Router.compiled.json": []byte(`{"hex":"aa"}`),
		"Router.compiled.json":        []byte(`{"hex":"bb"}`),
	})

	dir := t.TempDir()
	require.NoError(t, extractFilesToDir(tarGz, dir))

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Len(t, entries, 1)
	assert.Equal(t, "Router.compiled.json", entries[0].Name())
}

func TestExtractFilesToDir_InvalidGzip(t *testing.T) {
	dir := t.TempDir()
	err := extractFilesToDir([]byte("not gzip"), dir)
	require.Error(t, err)
}

func TestExtractFilesToDir_IncludesPackageMetadataFile(t *testing.T) {
	tarGz := createTarGz(t, map[string][]byte{
		PackageMetadataFile:    []byte(`{"version":"1.0"}`),
		"Router.compiled.json": []byte(`{"hex":"aa"}`),
	})

	dir := t.TempDir()
	require.NoError(t, extractFilesToDir(tarGz, dir))

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Len(t, entries, 2)
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

// --- readPackageMetadata tests ---

func TestReadPackageMetadata_WithValidFile(t *testing.T) {
	dir := t.TempDir()
	meta := `{"version":"1.6.3","contracts":{"link.chain.ton.ccip.Router":{"path":"Router.compiled.json","version":"1.6.3"}}}`
	require.NoError(t, os.WriteFile(filepath.Join(dir, PackageMetadataFile), []byte(meta), 0o600))

	result, err := LoadPackageMetadata(dir)
	require.NoError(t, err)
	assert.Equal(t, "1.6.3", result.Version)
	const rtType = bindings.TypeRouter
	require.Contains(t, result.Contracts, rtType)
	assert.Equal(t, "Router.compiled.json", result.Contracts[rtType].Path)
	assert.Equal(t, "1.6.3", result.Contracts[rtType].Version)
}

func TestReadPackageMetadata_MissingFileUsesFallback(t *testing.T) {
	dir := t.TempDir()
	result, err := LoadPackageMetadata(dir)
	require.NoError(t, err)
	assert.Equal(t, defaultPackageMetadata, result)
}

func TestReadPackageMetadata_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, PackageMetadataFile), []byte("not json"), 0o600))

	_, err := LoadPackageMetadata(dir)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse")
}

// --- ReadCompiledContract tests ---

// writePkgDir creates a temporary package directory with the given contracts-pkg.json content
// and the sample compiled contract file for TypeTestReceiver.
func writePkgDir(t *testing.T, pkgMeta *ContractPackageMetadata) string {
	t.Helper()
	dir := t.TempDir()

	metaBytes, err := json.Marshal(pkgMeta)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, PackageMetadataFile), metaBytes, 0o600))

	entry := pkgMeta.Contracts[bindings.TypeTestReceiver]
	require.NoError(t, os.WriteFile(filepath.Join(dir, entry.Path), []byte(sampleCompiledContractJSON), 0o600))

	return dir
}

func testReceiverMeta(version string) *ContractPackageMetadata {
	return &ContractPackageMetadata{
		Version: version,
		Contracts: map[tvm.FullyQualifiedName]ContractEntryMetadata{
			bindings.TypeTestReceiver: {Path: "ccip.test.receiver.compiled.json", Version: version},
		},
	}
}

func TestReadCompiledContract_ValidContract(t *testing.T) {
	dir := writePkgDir(t, testReceiverMeta("1.6.3"))

	contract, err := ReadCompiledContract(ton.ContractMetadata{Package: "local", ID: bindings.TypeTestReceiver}, dir, nil)
	require.NoError(t, err)
	assert.Equal(t, bindings.TypeTestReceiver, contract.Metadata.ID)
	assert.Equal(t, "local", contract.Metadata.Package)
	assert.Equal(t, "1.6.3", contract.Version.String())
	assert.NotNil(t, contract.Code)
}

func TestReadCompiledContract_UsesProvidedMetadata(t *testing.T) {
	dir := t.TempDir()
	// Write the contract file directly (no contracts-pkg.json needed because we pass meta inline)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "ccip.test.receiver.compiled.json"), []byte(sampleCompiledContractJSON), 0o600))

	meta := testReceiverMeta("1.6.5")
	contract, err := ReadCompiledContract(ton.ContractMetadata{Package: "local", ID: bindings.TypeTestReceiver}, dir, meta)
	require.NoError(t, err)
	assert.Equal(t, "1.6.5", contract.Version.String())
}

func TestReadCompiledContract_UnknownFQN(t *testing.T) {
	dir := writePkgDir(t, testReceiverMeta("1.6.3"))

	_, err := ReadCompiledContract(ton.ContractMetadata{Package: "local", ID: "link.chain.ton.ccip.NonExistent"}, dir, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found in package metadata")
}

func TestReadCompiledContract_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	meta := testReceiverMeta("1.6.3")
	metaBytes, err := json.Marshal(meta)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, PackageMetadataFile), metaBytes, 0o600))
	// Write invalid JSON for the contract file
	require.NoError(t, os.WriteFile(filepath.Join(dir, "ccip.test.receiver.compiled.json"), []byte("not valid json"), 0o600))

	_, err = ReadCompiledContract(ton.ContractMetadata{Package: "local", ID: bindings.TypeTestReceiver}, dir, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse compiled contract")
}

func TestReadCompiledContract_InvalidVersionInMetadata(t *testing.T) {
	dir := t.TempDir()
	meta := &ContractPackageMetadata{
		Version: "1.6.3",
		Contracts: map[tvm.FullyQualifiedName]ContractEntryMetadata{
			bindings.TypeTestReceiver: {Path: "ccip.test.receiver.compiled.json", Version: "not-a-version"},
		},
	}
	metaBytes, err := json.Marshal(meta)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, PackageMetadataFile), metaBytes, 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "ccip.test.receiver.compiled.json"), []byte(sampleCompiledContractJSON), 0o600))

	_, err = ReadCompiledContract(ton.ContractMetadata{Package: "local", ID: bindings.TypeTestReceiver}, dir, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid version")
}

// --- DownloadArtifacts disk-cache tests ---

func serveTarGz(t *testing.T, files map[string][]byte) *httptest.Server {
	t.Helper()
	tarGzData := createTarGz(t, files)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(tarGzData)
	}))
}

func TestDownloadArtifacts_ExtractsToDisk(t *testing.T) {
	server := serveTarGz(t, map[string][]byte{
		PackageMetadataFile:    []byte(`{"version":"1.0"}`),
		"Router.compiled.json": []byte(`{"hex":"aa"}`),
	})
	defer server.Close()

	// Override the base URL to point at our test server.
	origBase := githubBaseURL
	githubBaseURL = server.URL
	defer func() { githubBaseURL = origBase }()

	pkgsDir := t.TempDir()
	in := DownloadArtifactsOpts{
		Host:         githubDomain,
		Organization: "org",
		Repository:   "repo",
		Release:      "v1.0.0",
		Asset:        "v1.0.0.tar.gz",
		PkgsDir:      pkgsDir,
	}

	path, err := DownloadArtifacts(context.Background(), in)
	require.NoError(t, err)
	assert.NotEmpty(t, path)

	// Verify files were extracted.
	_, err = os.Stat(filepath.Join(path, PackageMetadataFile))
	require.NoError(t, err)
	_, err = os.Stat(filepath.Join(path, "Router.compiled.json"))
	require.NoError(t, err)
}

func TestDownloadArtifacts_CacheHit(t *testing.T) {
	// Pre-create the expected destination directory.
	pkgsDir := t.TempDir()
	in := DownloadArtifactsOpts{
		Host:         githubDomain,
		Organization: "org",
		Repository:   "repo",
		Release:      "v1.0.0",
		Asset:        "v1.0.0.tar.gz",
		PkgsDir:      pkgsDir,
	}

	destDir, err := packageDestDir(in)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(destDir, 0o755))

	// No server running — a network call would fail, proving we hit the cache.
	path, err := DownloadArtifacts(context.Background(), in)
	require.NoError(t, err)
	assert.Equal(t, destDir, path)
}

func TestDownloadArtifacts_InvalidHost(t *testing.T) {
	in := DownloadArtifactsOpts{
		Host:         "evil.example.com",
		Organization: "org",
		Repository:   "repo",
		Release:      "v1.0.0",
		Asset:        "v1.0.0.tar.gz",
	}
	_, err := DownloadArtifacts(context.Background(), in)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expected")
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

// --- sanitizePackageName tests ---

func TestSanitizePackageName(t *testing.T) {
	assert.Equal(t, "org-repo_contracts_v1.6.0", sanitizePackageName("org-repo_contracts/v1.6.0"))
	assert.Equal(t, "org_repo_tag", sanitizePackageName("org@repo@tag"))
}
