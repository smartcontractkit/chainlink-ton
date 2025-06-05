message(1) Request {
    queryId: Int as uint64;
    value: Int as uint64;
}

contract Bouncer() {
    receive() {
        dump("Bouncer contract initialized");
    }

    receive(msg: Request) {
        process(msg.value);
    }
}

inline fun process(value: Int) {
    if (value == 1) {
        return;
    }
    throw(value);
}
