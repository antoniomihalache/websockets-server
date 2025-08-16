import https from 'https';

import CONSTANTS from './custom_lib/websocket_constants.js';
import METHODS from './custom_lib/websocket_methods.js';
import fs from 'fs';

const serverKey = fs.readFileSync('./certs/create-cert-key.pem');
const serverCert = fs.readFileSync('./certs/create-cert.pem');

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

function startWebSocketConnection(socket) {}
