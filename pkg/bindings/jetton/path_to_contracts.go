package jetton

import (
	"os"
)

// Exposed by nix shell in `nix shell .#contracts`
var PathToContracts = os.Getenv("PATH_CONTRACTS_JETTON")
