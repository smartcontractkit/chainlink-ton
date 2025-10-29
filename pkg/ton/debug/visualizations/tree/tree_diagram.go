package tree

import (
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

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

type visualization struct {
	Actors map[string]string // address -> name
	Root   *treeNode
}

func NewTreeDiagram() lib.DebuggerVisualization {
	return &visualization{
		Actors: make(map[string]string),
		Root:   nil,
	}
}

func (v *visualization) ToString() string {
	if v.Root == nil {
		return "no messages"
	}
	return v.Root.ToString()
}

func (v *visualization) NewActor(address string, contractType string, name string) {
	if _, exists := v.Actors[address]; !exists {
		if name != "" {
			v.Actors[address] = name
		} else {
			v.Actors[address] = contractType
		}
	}
}

func (v *visualization) NewSentMessage(msg *tt.SentMessage, info lib.MessageInfo) lib.DebuggerVisualization {
	newVar := v.describeInternalMsg(msg.InternalMsg, info, nil)
	return v.insertMsg(newVar)
}

func (v *visualization) insertMsg(description string) lib.DebuggerVisualization {
	if v.Root == nil {
		v.Root = &treeNode{
			description: description,
			children:    &[]treeNode{},
		}
		return v
	}
	newNode := v.Root.insertMsg(description)
	return &visualization{
		Actors: v.Actors,
		Root:   newNode,
	}
}

func (v *visualization) NewEvent(msg *tt.OutgoingExternalMessages, info lib.MessageInfo) {
	v.insertMsg(v.describeExternalOutMsg(msg, info))
}

func (v *visualization) NewReceivedMessage(msg *tt.ReceivedMessage, info lib.TxInfo) lib.DebuggerVisualization {
	return v.insertMsg(v.DescribeReceivedMessage(msg, info))
}

func (v *visualization) DescribeReceivedMessage(m *tt.ReceivedMessage, info lib.TxInfo) string {
	if m.ExternalMsg != nil {
		return v.describeExternalInMsg(m.ExternalMsg, info)
	} else if m.InternalMsg != nil {
		return v.describeInternalMsg(m.InternalMsg, info.Msg, &info.ExitCode)
	}
	return "unknown message type"
}

func (v *visualization) describeAddr(addr *address.Address) string {
	addrStr := addr.String()
	if name, exists := v.Actors[addrStr]; exists {
		return name
	}
	return addrStr
}

func (v *visualization) describeExternalInMsg(msg *tlb.ExternalMessageIn, info lib.TxInfo) string {
	bodyDescription := info.Msg.Body().Compact()
	description := fmt.Sprintf("%s, %s{%s}", info.ExitCode, info.Msg.Name(), bodyDescription)
	return fmt.Sprintf("%s --> %s",
		description, v.describeAddr(msg.DstAddr))
}

func (v *visualization) describeExternalOutMsg(msg *tt.OutgoingExternalMessages, info lib.MessageInfo) string {
	bodyDescription := info.Body().Compact()
	return fmt.Sprintf("event: {%s, %s}", info.Name(), bodyDescription)
}

func (v *visualization) describeInternalMsg(msg *tlb.InternalMessage, info lib.MessageInfo, exitCode *string) string {
	description := "amount: " + msg.Amount.String()
	if msg.Bounced {
		description += ", bounce"
	}
	if exitCode != nil {
		description += ", " + *exitCode
	}
	description += fmt.Sprintf(", %s{%s}", info.Name(), replaceAddresses(v.Actors, info.Body().Compact()))
	return fmt.Sprintf("%s --> %s",
		description, v.describeAddr(msg.DstAddr))
}

func replaceAddresses(addressMap map[string]string, text string) string {
	for oldAddr, newAddr := range addressMap {
		text = strings.ReplaceAll(text, oldAddr, newAddr)
	}
	return text
}
