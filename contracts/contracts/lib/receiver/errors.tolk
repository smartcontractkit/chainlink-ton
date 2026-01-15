const RECEIVER_FACILITY_NAME = "com.chainlink.ton.ccip.lib.Receiver";
const RECEIVER_FACILITY_ID = 235;
const RECEIVER_ERROR_CODE = 23500; //FACILITY_ID * 100

enum Receiver_Error {
    Unauthorized = 23500 //FACILITY_ID * 100,
    LowValue,
}