package wrappers

import (
	"os"
)

// Exposed by nix shell in `nix shell .#contracts`
var PathContractsJetton = os.Getenv("PATH_CONTRACTS_JETTON")
