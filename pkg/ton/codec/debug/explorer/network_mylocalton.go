package explorer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// ContainerInspect represents the structure returned by docker inspect
// for the fields needed by mylocalton discovery.
type ContainerInspect struct {
	ID    string `json:"Id"`
	State struct {
		Running bool `json:"Running"`
	} `json:"State"`
	Config struct {
		Image string `json:"Image"`
	} `json:"Config"`
	NetworkSettings struct {
		Ports map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"Ports"`
	} `json:"NetworkSettings"`
}

// findMylocaltonContainer finds a running mylocalton container and returns its ID.
func findMylocaltonContainer(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", "ps", "--format", "{{.ID}}\t{{.Image}}", "--filter", "status=running")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to list docker containers: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) != 2 {
			continue
		}
		containerID := parts[0]
		image := parts[1]

		if strings.Contains(image, "mylocalton-docker") && !strings.Contains(image, "mylocalton-docker-explorer") {
			return containerID, nil
		}
	}

	return "", errors.New("no running mylocalton container found")
}

// inspectContainer runs docker inspect on the given container ID.
func inspectContainer(ctx context.Context, containerID string) (*ContainerInspect, error) {
	cmd := exec.CommandContext(ctx, "docker", "inspect", containerID)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(output), "No such object") || strings.Contains(string(output), "No such container") {
			return nil, fmt.Errorf("container %s does not exist", containerID)
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
	if !inspect.State.Running {
		return nil, fmt.Errorf("container %s exists but is not running", containerID)
	}

	return inspect, nil
}

// getPortMapping extracts the host port that maps to a given container port.
func getPortMapping(inspect *ContainerInspect, containerPort string) (string, error) {
	portKey := containerPort + "/tcp"
	ports, exists := inspect.NetworkSettings.Ports[portKey]
	if !exists || len(ports) == 0 {
		return "", fmt.Errorf("no port mapping found for container port %s", containerPort)
	}

	hostPort := ports[0].HostPort
	if hostPort == "" {
		return "", fmt.Errorf("empty host port mapping for container port %s", containerPort)
	}

	return hostPort, nil
}
