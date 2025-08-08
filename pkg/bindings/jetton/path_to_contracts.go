package jetton

import (
	"os"
)

// Exposed by default nix shell
var PathToContracts = os.Getenv("PATH_CONTRACTS_JETTON")
