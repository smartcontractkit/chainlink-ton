package debug

import (
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	tt "github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func (n treeNode) ToString() string {
	return n.description + "\n" + strings.Join(n.toTreeLines(""), "\n")
}

func (n treeNode) toTreeLines(prefix string) []string {
	var lines []string

	if n.children != nil {
		for i, value := range *n.children {
			isLastChild := i == len(*n.children)-1
			var connector, nextPrefix string

			if isLastChild {
				connector = "└── "
				nextPrefix = prefix + "    "
			} else {
				connector = "├── "
				nextPrefix = prefix + "│   "
			}

			lines = append(lines, prefix+connector+value.description)
			subLines := value.toTreeLines(nextPrefix)
			lines = append(lines, subLines...)
		}
	}

	return lines
}

type treeNode struct {
	description string
	children    *[]treeNode
}

func (n *treeNode) insertMsg(msg string) *treeNode {
	newNode := &treeNode{
		description: msg,
		children:    &[]treeNode{},
	}
	*n.children = append(*n.children, *newNode)
	return newNode
}

type TreeDiagram struct {
	Actors map[string]string // address -> name
	Root   *treeNode
}

func NewTreeDiagram() DebuggerWriter {
	return &TreeDiagram{
		Actors: make(map[string]string),
		Root:   nil,
	}
}

func (w *TreeDiagram) String() string {
	if w.Root == nil {
		return "no messages"
	}
	return w.Root.ToString()
}

func (w *TreeDiagram) AddActor(address string, contractType deployment.ContractType, name string) {
	if _, exists := w.Actors[address]; !exists {
		if name != "" {
			w.Actors[address] = name
		} else {
			w.Actors[address] = contractType.String()
		}
	}
}

func (w *TreeDiagram) NewSentMessage(msg *tt.SentMessage, info lib.MessageInfo) DebuggerWriter {
	newVar := w.describeInternalMsg(msg.InternalMsg, info, nil)
	return w.insertMsg(newVar)
}

func (w *TreeDiagram) insertMsg(description string) DebuggerWriter {
	if w.Root == nil {
		w.Root = &treeNode{
			description: description,
			children:    &[]treeNode{},
		}
		return w
	}
	newNode := w.Root.insertMsg(description)
	return &TreeDiagram{
		Actors: w.Actors,
		Root:   newNode,
	}
}

func (w *TreeDiagram) NewEvent(msg *tt.OutgoingExternalMessages, info lib.MessageInfo) {
	w.insertMsg(w.describeExternalOutMsg(msg, info))
}

func (w *TreeDiagram) NewReceivedMessage(msg *tt.ReceivedMessage, info lib.TxInfo) DebuggerWriter {
	return w.insertMsg(w.DescribeReceivedMessage(msg, info))
}

func (w *TreeDiagram) DescribeReceivedMessage(m *tt.ReceivedMessage, info lib.TxInfo) string {
	if m.ExternalMsg != nil {
		return w.describeExternalInMsg(m.ExternalMsg, info)
	} else if m.InternalMsg != nil {
		return w.describeInternalMsg(m.InternalMsg, info.Msg, &info.ExitCode)
	}
	return "unknown message type"
}

func (w *TreeDiagram) describeAddr(addr *address.Address) string {
	addrStr := addr.String()
	if name, exists := w.Actors[addrStr]; exists {
		return name
	}
	return addrStr
}

func (w *TreeDiagram) describeExternalInMsg(msg *tlb.ExternalMessageIn, info lib.TxInfo) string {
	bodyDescription := info.Msg.Body().Compact()
	description := fmt.Sprintf("%s, %s{%s}", info.ExitCode, info.Msg.Name(), bodyDescription)
	return fmt.Sprintf("%s --> %s",
		description, w.describeAddr(msg.DstAddr))
}

func (w *TreeDiagram) describeExternalOutMsg(msg *tt.OutgoingExternalMessages, info lib.MessageInfo) string {
	bodyDescription := info.Body().Compact()
	return fmt.Sprintf("event: {%s, %s}", info.Name(), bodyDescription)
}

func (w *TreeDiagram) describeInternalMsg(msg *tlb.InternalMessage, info lib.MessageInfo, exitCode *string) string {
	description := "amount: " + msg.Amount.String()
	if msg.Bounced {
		description += ", bounce"
	}
	if exitCode != nil {
		description += ", " + *exitCode
	}
	description += fmt.Sprintf(", %s{%s}", info.Name(), replaceAddresses(w.Actors, info.Body().Compact()))
	return fmt.Sprintf("%s --> %s",
		description, w.describeAddr(msg.DstAddr))
}

func replaceAddresses(addressMap map[string]string, text string) string {
	for oldAddr, newAddr := range addressMap {
		text = strings.ReplaceAll(text, oldAddr, newAddr)
	}
	return text
}
