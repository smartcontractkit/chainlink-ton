package sequence

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/TyphonHill/go-mermaid/diagrams/sequence"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	tt "github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

type visualization struct {
	Actors       map[string]string // address -> name
	ActiveActors map[string]*sequence.Actor
	Diagram      *sequence.Diagram
	Format       OutputFmt
}

type OutputFmt int

const (
	OutputFmtURL OutputFmt = iota
	OutputFmtRaw
)

func NewVisualization(fmt OutputFmt) lib.DebuggerVisualization {
	diagram := sequence.NewDiagram()
	diagram.Config.SetMessageAlign("left")
	diagram.Config.SetNoteAlign("left")
	return &visualization{
		Actors:       make(map[string]string),
		ActiveActors: make(map[string]*sequence.Actor),
		Diagram:      diagram,
		Format:       fmt,
	}
}

func (v *visualization) ToString() string {
	diagramStr := v.Diagram.String()
	switch v.Format {
	case OutputFmtURL:
		type objectFormat struct {
			Code string `json:"code"`
		}
		object := objectFormat{
			Code: diagramStr,
		}
		jsonObject, err := json.Marshal(object)
		if err != nil {
			return "failed to marshal diagram to JSON: " + err.Error()
		}
		// Compress with zlib and base64 encode
		buf := bytes.NewBuffer([]byte{})
		w := zlib.NewWriter(buf)
		_, err = w.Write(jsonObject)
		if err != nil {
			return "failed to write to zlib writer: " + err.Error()
		}
		err = w.Close()
		if err != nil {
			return "failed to close zlib writer: " + err.Error()
		}
		zlibEncodedDiagram := base64.URLEncoding.EncodeToString(buf.Bytes())

		mermaidURL := "https://www.mermaidchart.com/play#pako:" + zlibEncodedDiagram
		return mermaidURL
	case OutputFmtRaw:
		return diagramStr
	default:
		return "unknown format"
	}
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
	return v.insertMsg(msg.InternalMsg.SrcAddr, msg.InternalMsg.DstAddr, newVar)
}

func (v *visualization) insertMsg(from, to *address.Address, description string) lib.DebuggerVisualization {
	description = sanitizeString(description)
	switch {
	case from != nil && to != nil:
		v.Diagram.AddMessage(v.actorFromAddr(from), v.actorFromAddr(to), sequence.MessageSolidArrow, description)
	case from != nil && to == nil:
		v.Diagram.AddMessage(v.actorFromAddr(from), sequence.NewActor("unknown", "unknown", sequence.ActorParticipant), sequence.MessageSolidArrow, description)
	case from == nil && to != nil:
		v.Diagram.AddMessage(sequence.NewActor("unknown", "unknown", sequence.ActorParticipant), v.actorFromAddr(to), sequence.MessageSolidArrow, description)
	default:
		v.Diagram.AddMessage(sequence.NewActor("unknown", "unknown", sequence.ActorParticipant), sequence.NewActor("unknown", "unknown", sequence.ActorParticipant), sequence.MessageSolidArrow, description)
	}
	return v
}

func (v *visualization) NewEvent(msg *tt.OutgoingExternalMessages, info lib.MessageInfo) {
	fromActor := v.actorFromAddr(msg.SrcAddr)
	description := v.describeExternalOutMsg(msg, info)
	description = sanitizeString(description)
	v.Diagram.AddNote(sequence.NoteOver, description, fromActor)
}

func (v *visualization) actorFromAddr(addr *address.Address) *sequence.Actor {
	var actor *sequence.Actor
	var ok bool
	name := v.describeAddr(addr)
	id := strings.ReplaceAll(addr.StringRaw(), ":", "_")
	if actor, ok = v.ActiveActors[id]; !ok {
		actor = v.Diagram.AddActor(id, name, sequence.ActorParticipant)
		v.ActiveActors[id] = actor
	}
	return actor
}

func (v *visualization) NewReceivedMessage(msg *tt.ReceivedMessage, info lib.TxInfo) lib.DebuggerVisualization {
	if msg.ExternalMsg != nil {
		return v.insertMsg(nil, msg.ExternalMsg.DstAddr, v.DescribeReceivedMessage(msg, info))
	} else if msg.InternalMsg != nil {
		return v.insertMsg(msg.InternalMsg.SrcAddr, msg.InternalMsg.DstAddr, v.DescribeReceivedMessage(msg, info))
	}
	panic("unknown message type")
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
	bodyDescription := info.Msg.Body().Describe()
	description := fmt.Sprintf("%s<br/>%s{%s}", info.ExitCode, info.Msg.Name(), bodyDescription)
	return description
}

func (v *visualization) describeExternalOutMsg(msg *tt.OutgoingExternalMessages, info lib.MessageInfo) string {
	bodyDescription := info.Body().Describe()
	return fmt.Sprintf("event: {%s<br/>%s}", info.Name(), bodyDescription)
}

func (v *visualization) describeInternalMsg(msg *tlb.InternalMessage, info lib.MessageInfo, exitCode *string) string {
	description := "amount: " + msg.Amount.String()
	if msg.Bounced {
		description += "<br/>bounce"
	}
	if exitCode != nil {
		description += "<br/>" + *exitCode
	}
	description += fmt.Sprintf("<br/>%s{%s}", info.Name(), replaceAddresses(v.Actors, info.Body().Describe()))
	return description
}

func replaceAddresses(addressMap map[string]string, text string) string {
	for oldAddr, newAddr := range addressMap {
		text = strings.ReplaceAll(text, oldAddr, newAddr)
	}
	return text
}
