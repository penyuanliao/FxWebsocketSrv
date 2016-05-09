/**
 * Created by Benson.Liao on 2016/4/29.
 */
const debug = require('debug')('FxClusterlb'); //debug
const net = require('net');
const fxNetSocket = require('fxNetSocket');
const fxTCP = fxNetSocket.TCP;
const options = {'host':'0.0.0.0', 'port': 8080,'backlog':511};


function FxSwitch() {

    this.service = undefined;

    // this.init();
    this.connectStreamServer('127.0.0.1', 3000, '/video/daabb/video0/');
};


FxSwitch.prototype.init = function () {
    var service = net.createServer(function (socket) {
        debug('CONNECTED:%d:%d',socket.remoteAddress,socket.remotePort);
    });
    this.service = service;
};

FxSwitch.prototype.connectStreamServer = function (host,port, namespace) {

    var sock = new net.Socket();
    sock.chunkSize = 0;
    sock.chunkBuffer = undefined;
    
    sock.connect(port, host, onConnected);
    function onConnected() {
        console.log('connected to %s:%s', host, port);

        sock.write(namespace);

        sock.on('data',onData);
        sock.on('end', onEnd);
        sock.on('drain', onDrain);

    };
    function onData(chunk) {
        if (!sock.chunkBuffer) {
            sock.chunkBuffer = new Buffer(chunk);
        }else {
            sock.chunkBuffer = Buffer.concat([sock.chunkBuffer, chunk], sock.chunkBuffer.length + chunk.length);
        }
        sock.chunkSize += chunk.length;

        var pos = sock.chunkBuffer.indexOf('\u0000');
        if (pos != -1) {
            var data = sock.chunkBuffer.slice(0, pos);
            pos++;//含/0
            sock.chunkSize -= pos;
            sock.chunkBuffer = sock.chunkBuffer.slice(pos, sock.chunkBuffer.length);

        }
    };
    function onEnd() {
        console.log('ended.');
    };
    function onDrain() {
        console.log('onDrain.');
    };

    return sock;
};

new FxSwitch();
