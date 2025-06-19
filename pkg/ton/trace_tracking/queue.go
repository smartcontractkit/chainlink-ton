package trace_tracking

type Queue[T any] struct {
	items *[]T
}

func (q *Queue[T]) PushAll(items ...T) {
	*q.items = append(*q.items, items...)
}

func (q *Queue[T]) Push(item T) {
	*q.items = append(*q.items, item)
}

// Pop removes the first item from the queue and returns it. If the queue is
// empty, it returns the zero value of T and false.
func (q *Queue[T]) Pop() (item T, ok bool) {
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

func (q *Queue[T]) IsEmpty() bool {
	return len(*q.items) == 0
}

func NewEmptyQueue[T any]() *Queue[T] {
	newVar := make([]T, 0)
	return &Queue[T]{items: &newVar}
}

// IN PLACE: This uses the provided slice as the storage. It is used to modify
// a slice as a queue.
func AsQueue[T any](list *[]T) *Queue[T] {
	return &Queue[T]{items: list}
}
