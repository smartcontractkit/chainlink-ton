package helpers

import (
	"context"
	"fmt"
	"os/exec"
	"path"
	"strings"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func Serialize(msgs []*tlb.InternalMessage) ([][]byte, error) {
	raw := make([][]byte, len(msgs))
	for i, msg := range msgs {
		bytes, err := pack(msg)
		if err != nil {
			return nil, err
		}
		raw[i] = bytes
	}
	return raw, nil
}
func Deserialize(raw [][]byte) ([]*tlb.InternalMessage, error) {
	msgs := make([]*tlb.InternalMessage, len(raw))
	for i, bytes := range raw {
		msg, err := unpack[tlb.InternalMessage](bytes)
		if err != nil {
			return nil, err
		}
		msgs[i] = &msg
	}
	return msgs, nil
}

func unpack[T any](data []byte) (T, error) {
	var decoded T
	cell, err := cell.FromBOC(data)
	if err != nil {
		return decoded, err
	}
	err = tlb.LoadFromCell(&decoded, cell.BeginParse())
	return decoded, err
}

func pack(msg any) ([]byte, error) {
	cell, err := tlb.ToCell(msg)
	if err != nil {
		return nil, err
	}
	return cell.ToBOC(), nil
}

func GetRepoRootDir(ctx context.Context) string {
	res := exec.CommandContext(ctx, "git", "rev-parse", "--show-toplevel")
	stdout, err := res.Output()
	if err != nil {
		panic(fmt.Sprintf("failed to get repo root dir: %s", err))
	}
	rootDir := strings.TrimSpace(string(stdout))
	return rootDir
}

func GetBuildsDir(ctx context.Context) string {
	repoRoot := GetRepoRootDir(ctx)
	return path.Join(repoRoot, "contracts", "build")
}

func GetBuildDir(ctx context.Context, contractPath string) string {
	buildsDir := GetBuildsDir(ctx)
	return path.Join(buildsDir, contractPath)
}
