package client

type ReaderWriter interface {
	Writer
	Reader
}

// TODO(NONEVM-1460): add interface functions
type Reader interface{}

// TODO(NONEVM-1460): add interface functions
type Writer interface{}
