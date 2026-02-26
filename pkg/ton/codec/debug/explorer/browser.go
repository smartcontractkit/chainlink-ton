package explorer

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
)

func openInBrowser(ctx context.Context, targetURL string) error {
	if strings.TrimSpace(targetURL) == "" {
		return errors.New("empty url")
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.CommandContext(ctx, "open", targetURL)
	case "windows":
		cmd = exec.CommandContext(ctx, "rundll32", "url.dll,FileProtocolHandler", targetURL)
	default:
		cmd = exec.CommandContext(ctx, "xdg-open", targetURL)
	}

	return cmd.Start()
}
