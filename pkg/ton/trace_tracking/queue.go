package trace_tracking

type queue[T any] struct {
	items *[]T
}

func (q *queue[T]) PushAll(items ...T) {
	*q.items = append(*q.items, items...)
}

func (q *queue[T]) Push(item T) {
	*q.items = append(*q.items, item)
}

// Pop removes the first item from the queue and returns it. If the queue is
// empty, it returns the zero value of T and false.
func (q *queue[T]) Pop() (item T, ok bool) {
	if q.IsEmpty() {
		return item, false
	}
	item = (*q.items)[0]
	if len(*q.items) == 1 {
		*q.items = make([]T, 0)
	} else {
		*q.items = (*q.items)[1:] // TODO this could be more efficient by using a ring buffer or a linked list
	}
	return item, true
}

func (q *queue[T]) IsEmpty() bool {
	return len(*q.items) == 0
}

func newEmptyQueue[T any]() *queue[T] {
	newVar := make([]T, 0)
	return &queue[T]{items: &newVar}
}

// IN PLACE: This uses the provided slice as the storage. It is used to modify
// a slice as a queue.
func asQueue[T any](list *[]T) *queue[T] {
	return &queue[T]{items: list}
}
