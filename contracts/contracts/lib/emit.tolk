/// Sends an external message with a given body.
fun emit<T>(topic: int, body: T) {
    val emitMsg = createExternalLogMessage({
        dest: ExtOutLogBucket { topic: topic },
        body: body
        });
    emitMsg.send(SEND_MODE_REGULAR);
}

