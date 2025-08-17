import https from 'https';

import CONSTANTS from './custom_lib/websocket_constants.js';
import METHODS from './custom_lib/websocket_methods.js';
import fs from 'fs';

const serverKey = fs.readFileSync('./certs/create-cert-key.pem');
const serverCert = fs.readFileSync('./certs/create-cert.pem');

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
    #optcode = null; //type of received data
    #masked = false;
    #initialPayloadSizeIndicator = 0;

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
            }
        } while (this.#taskLoop);
    }

    #getInfo() {
        const infoBuffer = this.#consumeHeaders(CONSTANTS.MIN_FRAME_SIZE);
        const firstByte = infoBuffer[0];
        const secondByte = infoBuffer[1];

        // extract WS payload information
        this.#fin = (firstByte & 0b10000000) = 0b10000000; // check if the FIN bit is set
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
}
