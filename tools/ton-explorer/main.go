package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	explorerImage = "ghcr.io/neodix42/mylocalton-docker-explorer:latest"
	explorerPort  = "8080"
	explorerName  = "ton-explorer"
)

type ContainerInspect struct {
	ID    string `json:"Id"`
	State struct {
		Running bool `json:"Running"`
	} `json:"State"`
	Config struct {
		Image string `json:"Image"`
	} `json:"Config"`
	Mounts []struct {
		Type        string `json:"Type"`
		Name        string `json:"Name"`
		Source      string `json:"Source"`
		Destination string `json:"Destination"`
	} `json:"Mounts"`
	NetworkSettings struct {
		IPAddress string `json:"IPAddress"`
		Networks  map[string]struct {
			IPAddress string `json:"IPAddress"`
			NetworkID string `json:"NetworkID"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

func main() {
	containerID := flag.String("container", "", "Container ID of running mylocalton instance (required)")
	port := flag.String("port", explorerPort, "Local port to expose explorer (default: 8080)")
	stopFlag := flag.Bool("stop", false, "Stop the explorer container")
	flag.Parse()

	ctx := context.Background()

	if *stopFlag {
		if err := stopExplorer(ctx); err != nil {
			log.Fatalf("Failed to stop explorer: %v", err)
		}
		return
	}

	if *containerID == "" {
		flag.Usage()
		log.Fatal("\nError: --container flag is required")
	}

	// Inspect the mylocalton container first (before stopping explorer)
	inspect, err := inspectContainer(ctx, *containerID)
	if err != nil {
		log.Fatalf("Failed to inspect container %s: %v", *containerID, err)
	}

	// Check if explorer is already running (after confirming container is valid)
	if isExplorerRunning(ctx) {
		log.Println("Explorer is already running. Stopping it first...")
		if err := stopExplorer(ctx); err != nil {
			log.Printf("Warning: failed to stop existing explorer: %v", err)
		}
		time.Sleep(2 * time.Second)
	}

	// Verify it's a mylocalton container
	if !strings.Contains(inspect.Config.Image, "mylocalton-docker") {
		log.Fatalf("Container %s is not a mylocalton-docker container (image: %s)", *containerID, inspect.Config.Image)
	}

	// Get the network name and IP
	networkName := getNetworkName(inspect)
	if networkName == "" {
		log.Fatalf("Could not determine network for container %s", *containerID)
	}

	mylocaltonIP := getContainerIP(inspect)
	if mylocaltonIP == "" {
		log.Fatalf("Could not determine IP address for container %s", *containerID)
	}

	// Get the volume name for /usr/share/data
	volumeName := getDataVolumeName(inspect)
	if volumeName == "" {
		log.Fatalf("Could not find shared-data volume in container %s", *containerID)
	}

	// Format container ID for display
	displayID := inspect.ID
	if len(displayID) > 12 {
		displayID = displayID[:12]
	}

	log.Printf("Found mylocalton container:")
	log.Printf("  Container ID: %s", displayID)
	log.Printf("  Image: %s", inspect.Config.Image)
	log.Printf("  Network: %s", networkName)
	log.Printf("  IP Address: %s", mylocaltonIP)
	log.Printf("  Data Volume: %s", volumeName)

	// Start the explorer
	if err := startExplorer(ctx, networkName, mylocaltonIP, volumeName, *port); err != nil {
		// Try to clean up if container was created but failed to start
		_ = stopExplorer(ctx)
		log.Fatalf("Failed to start explorer: %v", err)
	}

	log.Printf("\nOK: Blockchain Explorer started successfully!")
	log.Printf("   Access it at: http://localhost:%s/last", *port)
	log.Printf("\n   To stop the explorer, run:")
	log.Printf("   %s --stop\n", os.Args[0])
}

func inspectContainer(ctx context.Context, containerID string) (*ContainerInspect, error) {
	cmd := exec.CommandContext(ctx, "docker", "inspect", containerID)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Check if container doesn't exist
		if strings.Contains(string(output), "No such object") || strings.Contains(string(output), "No such container") {
			return nil, fmt.Errorf("container %s does not exist\nHint: The container may have been removed. Check with: docker ps -a", containerID)
		}
		return nil, fmt.Errorf("docker inspect failed: %w\nOutput: %s", err, string(output))
	}

	var inspects []ContainerInspect
	if err := json.Unmarshal(output, &inspects); err != nil {
		return nil, fmt.Errorf("failed to parse docker inspect output: %w", err)
	}

	if len(inspects) == 0 {
		return nil, fmt.Errorf("container %s not found", containerID)
	}

	inspect := &inspects[0]

	// Validate the container is running
	if !inspect.State.Running {
		return nil, fmt.Errorf("container %s exists but is not running\nHint: Start the container first with: docker start %s", containerID, containerID)
	}

	return inspect, nil
}

func getNetworkName(inspect *ContainerInspect) string {
	// Prefer non-default networks (bridge, host, none)
	var fallback string
	for name := range inspect.NetworkSettings.Networks {
		if name == "" {
			continue
		}
		// Return first non-default network found
		if name != "bridge" && name != "host" && name != "none" {
			return name
		}
		// Keep first network as fallback
		if fallback == "" {
			fallback = name
		}
	}
	return fallback
}

func getContainerIP(inspect *ContainerInspect) string {
	for _, network := range inspect.NetworkSettings.Networks {
		if network.IPAddress != "" {
			return network.IPAddress
		}
	}
	return ""
}

func getDataVolumeName(inspect *ContainerInspect) string {
	for _, mount := range inspect.Mounts {
		if mount.Destination == "/usr/share/data" {
			// Return the volume name (for named volumes) or source (for bind mounts)
			if mount.Name != "" {
				return mount.Name
			}
			return mount.Source
		}
	}
	return ""
}

func isExplorerRunning(ctx context.Context) bool {
	cmd := exec.CommandContext(ctx, "docker", "ps", "-q", "-f", "name="+explorerName)
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return len(strings.TrimSpace(string(output))) > 0
}

func stopExplorer(ctx context.Context) error {
	cmd := exec.CommandContext(ctx, "docker", "rm", "-f", explorerName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// If container doesn't exist, that's fine
		if strings.Contains(string(output), "No such container") {
			log.Println("Explorer container not found (already stopped)")
			return nil
		}
		return fmt.Errorf("failed to stop explorer: %w, output: %s", err, output)
	}
	log.Println("OK: Explorer stopped successfully")
	return nil
}

func startExplorer(ctx context.Context, networkName, mylocaltonIP, volumeName, port string) error {
	log.Println("\nStarting blockchain explorer...")

	// Use the official explorer image and mount the same volume as mylocalton container
	// Environment variables:
	// - SERVER_PORT: port the explorer listens on
	// - FILE_SERVER_IP: IP of the mylocalton container (file server)
	// - FILE_SERVER_PORT: port of the file server (8000)
	args := []string{
		"run",
		"-d",
		"--name", explorerName,
		"--network", networkName,
		"-e", "SERVER_PORT=" + explorerPort,
		"-e", "FILE_SERVER_IP=" + mylocaltonIP,
		"-e", "FILE_SERVER_PORT=8000",
		"-p", fmt.Sprintf("%s:%s", port, explorerPort),
		"-v", volumeName + ":/usr/share/data",
		explorerImage,
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to start explorer container: %w, output: %s", err, output)
	}

	// Wait for explorer to be ready
	log.Println("Waiting for explorer to be ready...")
	time.Sleep(3 * time.Second)

	// Verify it's running
	checkCmd := exec.CommandContext(ctx, "docker", "ps", "-f", "name="+explorerName, "--format", "{{.Status}}")
	statusOutput, err := checkCmd.Output()
	if err != nil {
		return fmt.Errorf("failed to verify explorer status: %w", err)
	}

	if !strings.Contains(string(statusOutput), "Up") {
		// Check logs if it failed
		logsCmd := exec.CommandContext(ctx, "docker", "logs", explorerName)
		logs, _ := logsCmd.Output()
		return fmt.Errorf("explorer container failed to start. Logs:\n%s", string(logs))
	}

	return nil
}
