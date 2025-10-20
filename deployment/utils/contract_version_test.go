package utils

import (
	"os"
	"strings"
	"testing"
)

func TestGetContractBuildSHA(t *testing.T) {
	const shaFile = "contract_build_sha"

	data, err := os.ReadFile(shaFile)
	if err != nil {
		t.Skipf("%s not found, skipping test", shaFile)
	}
	expected := strings.TrimSpace(string(data))

	sha := GetContractBuildSHA()
	if sha != expected {
		t.Errorf("expected %s, got %s", expected, sha)
	}
}
