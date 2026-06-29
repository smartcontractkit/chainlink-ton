package tonapiwaitlint

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/types"

	"github.com/golangci/plugin-module-register/register"
	"golang.org/x/tools/go/analysis"
)

const (
	linterName     = "tonapiwaitlint"
	tonPackagePath = "github.com/xssnick/tonutils-go/ton"
)

type tonAPIWaitLintSettings struct {
	Methods []string `json:"methods"`
}

type tonAPIWaitLintPlugin struct {
	methods map[string]bool
}

func init() {
	register.Plugin(linterName, newTonAPIWaitLintPlugin)
}

func newTonAPIWaitLintPlugin(rawSettings any) (register.LinterPlugin, error) {
	cfg := tonAPIWaitLintSettings{Methods: []string{"GetAccount", "RunGetMethod"}}
	if rawSettings != nil {
		payload, err := json.Marshal(rawSettings)
		if err != nil {
			return nil, fmt.Errorf("marshal settings: %w", err)
		}
		if err := json.Unmarshal(payload, &cfg); err != nil {
			return nil, fmt.Errorf("unmarshal settings: %w", err)
		}
	}

	methods := make(map[string]bool, len(cfg.Methods))
	for _, method := range cfg.Methods {
		if method != "" {
			methods[method] = true
		}
	}

	return &tonAPIWaitLintPlugin{methods: methods}, nil
}

func (p *tonAPIWaitLintPlugin) BuildAnalyzers() ([]*analysis.Analyzer, error) {
	return []*analysis.Analyzer{{
		Name: linterName,
		Doc:  "checks that selected ton.APIClientWrapped methods are called through WaitForBlock",
		Run:  p.run,
	}}, nil
}

func (p *tonAPIWaitLintPlugin) GetLoadMode() string {
	return register.LoadModeTypesInfo
}

func (p *tonAPIWaitLintPlugin) run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			fn, ok := node.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				return true
			}

			waiterVars := map[types.Object]bool{}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				switch stmt := n.(type) {
				case *ast.AssignStmt:
					recordWaiterAssignments(pass, waiterVars, stmt.Lhs, stmt.Rhs)
				case *ast.ValueSpec:
					lhs := make([]ast.Expr, 0, len(stmt.Names))
					for _, name := range stmt.Names {
						lhs = append(lhs, name)
					}
					recordWaiterAssignments(pass, waiterVars, lhs, stmt.Values)
				case *ast.CallExpr:
					if !p.isFlaggedAPICall(pass, stmt) || isWaitForBlockReceiver(pass, waiterVars, stmt) {
						return true
					}
					selector := stmt.Fun.(*ast.SelectorExpr)
					pass.Reportf(selector.Sel.Pos(), "ton.APIClientWrapped.%s must be called on client.WaitForBlock(block.SeqNo)", selector.Sel.Name)
				}
				return true
			})
			return false
		})
	}

	return nil, nil
}

func recordWaiterAssignments(pass *analysis.Pass, waiterVars map[types.Object]bool, lhs, rhs []ast.Expr) {
	for i, left := range lhs {
		if i >= len(rhs) || !isWaitForBlockCall(pass, rhs[i]) {
			continue
		}
		ident, ok := left.(*ast.Ident)
		if !ok {
			continue
		}
		if obj := pass.TypesInfo.ObjectOf(ident); obj != nil {
			waiterVars[obj] = true
		}
	}
}

func (p *tonAPIWaitLintPlugin) isFlaggedAPICall(pass *analysis.Pass, call *ast.CallExpr) bool {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || !p.methods[selector.Sel.Name] {
		return false
	}

	selection := pass.TypesInfo.Selections[selector]
	if selection == nil {
		return false
	}
	method := selection.Obj()
	return method != nil && method.Pkg() != nil && method.Pkg().Path() == tonPackagePath
}

func isWaitForBlockReceiver(pass *analysis.Pass, waiterVars map[types.Object]bool, call *ast.CallExpr) bool {
	selector := call.Fun.(*ast.SelectorExpr)
	if isWaitForBlockCall(pass, selector.X) {
		return true
	}
	if ident, ok := selector.X.(*ast.Ident); ok {
		return waiterVars[pass.TypesInfo.ObjectOf(ident)]
	}
	return false
}

func isWaitForBlockCall(pass *analysis.Pass, expr ast.Expr) bool {
	call, ok := expr.(*ast.CallExpr)
	if !ok {
		return false
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "WaitForBlock" {
		return false
	}
	selection := pass.TypesInfo.Selections[selector]
	if selection == nil {
		return false
	}
	method := selection.Obj()
	return method != nil && method.Pkg() != nil && method.Pkg().Path() == tonPackagePath
}
