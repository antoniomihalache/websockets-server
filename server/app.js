import https from 'https';

import CONSTANTS from './custom_lib/websocket_constants.js';
import METHODS from './custom_lib/websocket_methods.js';
import fs from 'fs';

const serverKey = fs.readFileSync('./certs/localhost+2-key.pem');
const serverCert = fs.readFileSync('./certs/localhost+2.pem');

// tasks
const GET_INFO = 1;
const GET_LENGTH = 2;
const GET_MASK_KEY = 3;
const GET_PAYLOAD = 4;
const SEND_ECHO = 5;

// create HTTP web-server object
const httpsServer = https.createServer({ key: serverKey, cert: serverCert }, (req, res) => {
    res.writeHead(200);
    res.end('Hello, From HTTPS server!');
});

httpsServer.listen(CONSTANTS.HTTPS_PORT, () => {
    console.log(`HTTPS server listening on port ${CONSTANTS.HTTPS_PORT}`);
});

// handle errors
CONSTANTS.ERRORS.forEach((errorEvent) => {
    process.on(errorEvent, (err) => {
        console.error(`Error of type ${errorEvent} occurred: ${err}\nStack: ${err.stack ? err.stack : ''}`);
        process.exit(1);
    });
});

httpsServer.on('upgrade', (req, socket, head) => {
    console.log('WebSocket connection attempt detected');
    // grab the required request headers
    const upgradeHeaderCheck = req.headers['upgrade'].toLowerCase() === CONSTANTS.UPGRADE;
    const connectionHeaderCheck = req.headers['connection'].toLowerCase() === CONSTANTS.CONNECTION;
    const methodCheck = req.method === CONSTANTS.METHOD;

    // check the origin
    const origin = req.headers['origin'];
    const originCheck = METHODS.isOriginAllowed(origin);

    // perform a final check that all request headers are okay
    if (METHODS.check(socket, upgradeHeaderCheck, connectionHeaderCheck, methodCheck, originCheck)) {
        upgradeConnection(req, socket, head);
    }
});

function upgradeConnection(req, socket, head) {
    // grab client key
    const clientKey = req.headers['sec-websocket-key'];
    // generate response headers
    let headers = METHODS.createUpgradeHeaders(clientKey);
    socket.write(headers);

    startWebSocketConnection(socket);
}

function startWebSocketConnection(socket) {
    console.log(`Websocket connection established with client port: ${socket.remotePort}`);

    // create a receiver object
    const receiver = new WebSocketReceiver(socket);
    console.log('RECEIVER: ', receiver);

    // listen for data event
    socket.on('data', (chunk) => {
        receiver.processBuffer(chunk);
    });

    socket.on('end', () => {
        console.log(`There will be no more data. The WS connection is closed.`);
    });
}

class WebSocketReceiver {
    #socket;
    #buffersArray = []; // array containing the chunks of data received
    #bufferedBytesLength = 0;
    #taskLoop = false;
    #task = GET_INFO;
    #fin = false;
    #opcode = null; //type of received data
    #masked = false;
    #initialPayloadSizeIndicator = 0;
    #framePayloadLength = 0; // length of one WebSocket frame payload
    #maxPayload = 1024 * 1024; // 1 MiB
    #totalPayloadLength = 0; // total length of the complete message payload (can be made of multiple frames)
    #mask = Buffer.alloc(CONSTANTS.MASK_LENGTH);
    #framesReceived = 0;
    #fragments = [];

    constructor(socket) {
        this.#socket = socket;
    }

    processBuffer(chunk) {
        this.#buffersArray.push(chunk);
        this.#bufferedBytesLength += chunk.length;
        this.#startTaskLoop();
    }

    #startTaskLoop() {
        this.#taskLoop = true;

        do {
            switch (this.#task) {
                case GET_INFO:
                    this.#getInfo();
                    break;
                case GET_LENGTH:
                    this.#getLength();
                    break;
                case GET_MASK_KEY:
                    this.#getMaskKey();
                    break;
                case GET_PAYLOAD:
                    this.#getPayload();
                    break;
            }
        } while (this.#taskLoop);
    }

    #getInfo() {
        // check wheter we have enough bytes in our internal buffer
        if (this.#bufferedBytesLength < CONSTANTS.MIN_FRAME_SIZE) {
            this.#taskLoop = false; // wait for more chunks via the 'data' event on the socket
            return;
        }
        const infoBuffer = this.#consumeHeaders(CONSTANTS.MIN_FRAME_SIZE);
        const firstByte = infoBuffer[0];
        const secondByte = infoBuffer[1];

        // extract WS payload information
        this.#fin = (firstByte & 0b10000000) === 0b10000000; // check if the FIN bit is set
        this.#opcode = firstByte & 0b00001111; // extract the opcode
        this.#masked = (secondByte & 0b10000000) === 0b10000000; // check if the MASK bit is set
        this.#initialPayloadSizeIndicator = secondByte & 0b01111111; // extract the payload size indicator

        // if data is not masked, throw an error
        if (!this.#masked) {
            //TODO: send a close frame back to the client
            throw new Error('Mask is not set by the client. This is not allowed by the WebSocket protocol.');
        }

        this.#task = GET_LENGTH;
    }

    #consumeHeaders(n) {
        this.#bufferedBytesLength -= n; // the goal is get to 0 - consume all buffered bytes
        // if the size of the actual buffer = n, return the entire buffer
        if (this.#buffersArray[0].length === n) {
            return this.#buffersArray.shift();
        }

        if (n < this.#buffersArray[0].length) {
            const infoBuffer = this.#buffersArray[0];
            this.#buffersArray[0] = this.#buffersArray[0].slice(n);
            return infoBuffer.slice(0, n);
        } else {
            throw Error('You cannot extract more data from a ws frame than the actual frame size.');
        }
    }

    #getLength() {
        // extract the length of the WS frame payload (or fragment)
        switch (this.#initialPayloadSizeIndicator) {
            case CONSTANTS.MEDIUM_DATA_FLAG: // 126
                let mediumPayloadLengthBuffer = this.#consumeHeaders(CONSTANTS.MEDIUM_SIZE_CONSPUTION);
                this.#framePayloadLength = mediumPayloadLengthBuffer.readUInt16BE();
                this.#processLength();
                break;
            case CONSTANTS.LARGE_DATA_FLAG: // 127
                let largePayloadLengthBuffer = this.#consumeHeaders(CONSTANTS.LARGE_SIZE_CONSPUTION);
                let bufBigInt = largePayloadLengthBuffer.readBigUInt64BE();
                this.#framePayloadLength = Number(bufBigInt);
                this.#processLength();
                break;
            default:
                // payload is less than 126 bytes
                this.#framePayloadLength = this.#initialPayloadSizeIndicator;
                this.#processLength();
        }
    }

    #processLength() {
        this.#totalPayloadLength += this.#framePayloadLength;
        if (this.#totalPayloadLength > this.#maxPayload) {
            //TODO: send a close frame back to the client
            throw new Error(`Payload size ${this.#framePayloadLength} exceeds the maximum allowed ${this.#maxPayload}`);
        }
        this.#task = GET_MASK_KEY;
    }

    #getMaskKey() {
        this.#mask = this.#consumeHeaders(CONSTANTS.MASK_LENGTH);
        this.#task = GET_PAYLOAD;
    }

    #getPayload() {
        if (this.#bufferedBytesLength < this.#framePayloadLength) {
            this.#taskLoop = false; // wait for more data
            return;
        }

        // full frame received
        this.#framesReceived++;
        // consume the entire frame payload
        let frameMaskedPayloadBuffer = this.#consumePayload(this.#framePayloadLength);

        // unmask the data frame
        let frameUnmaskedPayloadBuffer = METHODS.unmask(frameMaskedPayloadBuffer, this.#mask);

        // close frame
        if (this.#opcode === CONSTANTS.OPCODE_CLOSE) {
            throw new Error('Close frame received - not implemented yet');
        }

        // other frame types
        if ([CONSTANTS.OPCODE_BINARY, CONSTANTS.OPCODE_PING, CONSTANTS.OPCODE_PONG].includes(this.#opcode)) {
            // later I want to define a closure function
            throw new Error('Server has not dealt with a this type of frame ... yet');
        }

        if (frameUnmaskedPayloadBuffer.length) {
            this.#fragments.push(frameUnmaskedPayloadBuffer);
        }

        //check if more frames are expected
        if (!this.#fin) {
            this.#task = GET_INFO;
        } else {
            console.log(`TOTAL FRAMES RECEIVED: ${this.#framesReceived}`);
            console.log(`TOTAL PAYLOAD LENGTH: ${this.#totalPayloadLength}`);
            this.#task = SEND_ECHO;
        }
    }

    #consumePayload(n) {
        this.#bufferedBytesLength -= n; // the goal is get to 0 - consume all buffered bytes

        const payloadBuffer = Buffer.alloc(n);
        let totalBytesRead = 0;

        // read data from the buffers array until we have read n bytes
        while (totalBytesRead < n) {
            const buff = this.#buffersArray[0];
            const bytesToRead = Math.min(n - totalBytesRead, buff.length);
            buff.copy(payloadBuffer, totalBytesRead, 0, bytesToRead);
            totalBytesRead += bytesToRead;

            if (bytesToRead < buff.length) {
                this.#buffersArray[0] = buff.slice(bytesToRead);
            } else {
                this.#buffersArray.shift();
            }
        }

        return payloadBuffer;
    }
}
