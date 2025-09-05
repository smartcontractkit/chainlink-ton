package main

import (
	"context"
	"fmt"
	"os"

	"github.com/docker/docker/client"
	"github.com/spf13/cobra"

	"github.com/smartcontractkit/chainlink-testing-framework/framework"

	de "github.com/smartcontractkit/chainlink-ton/devenv"
)

const (
	LocalWASPLoadDashboard = "http://localhost:3000/d/WASPLoadTests/wasp-load-test?orgId=1&from=1756927942705&to=1756928229431"
	LocalCCIPTONDashboard  = "http://localhost:3000/d/f8a04cef-653f-46d3-86df-87c532300672/ccip-ton-soak-test?orgId=1&refresh=5s"
)

var rootCmd = &cobra.Command{
	Use:   "ton",
	Short: "A CCIP TON local environment tool",
}

var restartCmd = &cobra.Command{
	Use:     "restart",
	Aliases: []string{"r"},
	Args:    cobra.RangeArgs(0, 1),
	Short:   "Restart development environment, remove the containers and volumes, spin them up and apply configuration",
	RunE: func(cmd *cobra.Command, args []string) error {
		var configFile string
		if len(args) > 0 {
			configFile = args[0]
		} else {
			configFile = "env.toml"
		}
		framework.L.Info().Str("Config", configFile).Msg("Reconfiguring development environment")
		_ = os.Setenv("CTF_CONFIGS", configFile)
		_ = os.Setenv("TESTCONTAINERS_RYUK_DISABLED", "true")
		framework.L.Info().Msg("Tearing down the development environment")
		err := framework.RemoveTestContainers()
		if err != nil {
			return fmt.Errorf("failed to clean Docker resources: %w", err)
		}
		_, err = de.NewEnvironment()
		return err
	},
}

var upCmd = &cobra.Command{
	Use:     "up",
	Aliases: []string{"u"},
	Short:   "Spin up the development environment",
	Args:    cobra.RangeArgs(0, 1),
	RunE: func(cmd *cobra.Command, args []string) error {
		var configFile string
		if len(args) > 0 {
			configFile = args[0]
		} else {
			configFile = "env.toml"
		}
		framework.L.Info().Str("Config", configFile).Msg("Creating development environment")
		_ = os.Setenv("CTF_CONFIGS", configFile)
		_ = os.Setenv("TESTCONTAINERS_RYUK_DISABLED", "true")
		_, err := de.NewEnvironment()
		if err != nil {
			return err
		}
		return nil
	},
}

var downCmd = &cobra.Command{
	Use:     "down",
	Aliases: []string{"d"},
	Short:   "Tear down the development environment",
	RunE: func(cmd *cobra.Command, args []string) error {
		framework.L.Info().Msg("Tearing down the development environment")
		err := framework.RemoveTestContainers()
		if err != nil {
			return fmt.Errorf("failed to clean Docker resources: %w", err)
		}
		return nil
	},
}

var obsCmd = &cobra.Command{
	Use:   "obs",
	Short: "Manage the observability stack",
	Long:  "Spin up or down the observability stack with subcommands 'up' and 'down'",
}

var obsUpCmd = &cobra.Command{
	Use:     "up",
	Aliases: []string{"u"},
	Short:   "Spin up the observability stack",
	RunE: func(cmd *cobra.Command, args []string) error {
		remote, _ := rootCmd.Flags().GetBool("remote")
		if remote {
			return fmt.Errorf("remote mode: %v, local observability stack can only be used in 'local' mode", remote)
		}
		if err := framework.ObservabilityUp(); err != nil {
			return fmt.Errorf("observability up failed: %w", err)
		}
		de.Plog.Info().Msgf("TON Dashboard: %s", LocalCCIPTONDashboard)
		de.Plog.Info().Msgf("TON Load Test Dashboard: %s", LocalWASPLoadDashboard)
		return nil
	},
}

var obsDownCmd = &cobra.Command{
	Use:     "down",
	Aliases: []string{"d"},
	Short:   "Spin down the observability stack",
	RunE: func(cmd *cobra.Command, args []string) error {
		remote, _ := rootCmd.Flags().GetBool("remote")
		if remote {
			return fmt.Errorf("remote mode: %v, local observability stack can only be used in 'local' mode", remote)
		}
		return framework.ObservabilityDown()
	},
}

var obsRestartCmd = &cobra.Command{
	Use:     "restart",
	Aliases: []string{"r"},
	Short:   "Restart the observability stack (data wipe)",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := framework.ObservabilityDown(); err != nil {
			return fmt.Errorf("observability down failed: %w", err)
		}
		if err := framework.ObservabilityUp(); err != nil {
			return fmt.Errorf("observability up failed: %w", err)
		}
		de.Plog.Info().Msgf("TON Dashboard: %s", LocalCCIPTONDashboard)
		de.Plog.Info().Msgf("TON Load Test Dashboard: %s", LocalWASPLoadDashboard)
		return nil
	},
}

func init() {
	// observability
	obsCmd.AddCommand(obsRestartCmd)
	obsCmd.AddCommand(obsUpCmd)
	obsCmd.AddCommand(obsDownCmd)
	rootCmd.AddCommand(obsCmd)

	// main env commands
	rootCmd.AddCommand(upCmd)
	rootCmd.AddCommand(restartCmd)
	rootCmd.AddCommand(downCmd)
}

func checkDockerIsRunning() {
	cli, err := client.NewClientWithOpts(client.FromEnv)
	defer cli.Close()
	if err != nil {
		fmt.Println("Can't create Docker client, please check if Docker daemon is running!")
		os.Exit(1)
	}
	_, err = cli.Ping(context.Background())
	if err != nil {
		fmt.Println("Docker is not running, please start Docker daemon first!")
		os.Exit(1)
	}
}

func main() {
	checkDockerIsRunning()
	if len(os.Args) == 2 && (os.Args[1] == "shell" || os.Args[1] == "sh") {
		StartShell()
		return
	}
	if err := rootCmd.Execute(); err != nil {
		de.Plog.Err(err).Send()
		os.Exit(1)
	}
}
