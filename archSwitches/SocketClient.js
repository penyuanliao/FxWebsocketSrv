/**
 * Created by Benson.Liao on 2016/6/20.
 */
const net                = require('net');
const util               = require('util');
const fxNetSocket        = require('fxNetSocket');
const debug = require('debug');
const NSLog              = fxNetSocket.logger.getInstance();
const path = require('path');
NSLog.configure({logFileEnabled:true, level:'trace', dateFormat:'[yyyy-MM-dd hh:mm:ss]',filePath:path.dirname(__dirname)+"/historyLog", maximumFileSize: 1024 * 1024 * 100});

// const clusterConstructor = fxNetSocket.clusterConstructor;
// util.inherits(socketClient,clusterConstructor);
/***
 * socket classs
 * @param host <string>IPAddress
 * @param port <number>
 * @param namespace <string>
 * @param cb <function>
 */
function socketClient(host, port, namespace, cb) {



    // this.initProcessEvent(); //初始化process事件
    this.toBufferData = false;
    this.isRetry = false;
    this.trytimeoutObj = 0;
    this.try_conut = 0;
    this.host = host;
    this.port = port;
    this.namespace = namespace;
    this.cb = cb;
    this.init(host,port, namespace);
}
// socketClient.prototype.onMessage = function (data) {
//     socketClient.super_.prototype.onMessage.apply(this,[data]);
// };
socketClient.prototype.init = function (host, port, namespace) {
    NSLog.log('trace','socketClient init');
    var waitTime = 30000;
    var self = this;
    var sock = new net.Socket();
    sock.namespace = namespace;
    sock.chunkSize = 0;
    sock.chunkBuffer = undefined;
    sock.lookout = 0;
    sock.doWaiting = 0;

    sock.on('connect',onConnected);
    sock.on('data',onData);
    sock.on('end', onEnd);
    sock.on('drain',onDrain);
    sock.on('close',onClose);
    sock.on('error', onError);
    sock.connect(port, host);
    // socketHeartbeat(sock);
    this.socket = sock;
    function onConnected() {
        NSLog.log('info','Connected to %s:%s', host, port,namespace);
        sock.write(namespace);
    }
    function onData(chunk) {
        sock.doWaiting = 0;
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

            if (data.length <= 0) return;

            if (self.toBufferData) {
                if (self.cb && self.cb != null) self.cb(data);
            }else {
                try {

                    var json = JSON.parse(data.toString('utf8'));
                    if (json.NetStreamEvent == "NetStreamData") {
                        if (self.cb && self.cb != null) self.cb(json.data);
                    }

                }
                catch (e) {
                    console.log(data.length);
                }
            }
        }//check pos ended
    };
    function onEnd() {
        sock.end();
    };
    function onDrain() {
        debug('onDrain.');
    };
    function onClose() {
        self.tryAgainLater();

    }
    function onError(err) {

        NSLog.log('info','socket(%s) %s', self.namespace, err);
        sock.destroy();
    }
    function socketHeartbeat() {
        function todo() {

            NSLog.log('trace','heartbeat %s:', sock.namespace, sock.doWaiting);

            if (sock.doWaiting >= 6 ) {
                NSLog.log('info' ,'The Socket connect is not responding to client.It need to be reconnect.');
                sock.destroy();
                sock.doWaiting = 0;
            }else {
                sock.doWaiting++;
                sock.lookout = setTimeout(todo, waitTime)
            }
        }

        sock.lookout = setTimeout(todo, waitTime);
    }

};
socketClient.prototype.tryAgainLater = function () {
    var self = this;
    NSLog.log('trace','Connect Stream %s to try again.', self.namespace);

    if (self.trytimeoutObj != 0) clearTimeout(self.trytimeoutObj);
    self.trytimeoutObj = setTimeout(function () {
        self.reconnect();

    },10000);

    if (self.try_conut >= 360) {
        clearTimeout(self.trytimeoutObj);
        clearTimeout(self.socket.lookout);
        self.trytimeoutObj = 0;
    }
};
socketClient.prototype.dealloc = function () {
    this.socket.chunkSize = 0;
    delete this.socket.chunkBuffer;
    this.socket.chunkBuffer = null;
    clearTimeout(this.socket.lookout);
    clearTimeout(this.trytimeoutObj);
    this.socket = null;
};
socketClient.prototype.reconnect = function () {
    var self = this;
    this.socket.chunkSize = 0;
    delete this.socket.chunkBuffer;
    this.socket.chunkBuffer = null;
    clearTimeout(this.socket.lookout);
    clearTimeout(this.trytimeoutObj);
    this.try_conut++;
    // this.socket = null;
    // this.init(this.host, this.port, this.namespace);
    this.socket.connect({"host": this.host, "port": this.port}, function () {
        clearTimeout(self.trytimeoutObj);
        clearTimeout(self.socket.lookout);
    })
};
socketClient.prototype.replaceLine = function (opt) {
    this.host = opt.host;
    this.port = opt.port;

    this.try_conut = 0;

    this.tryAgainLater();
};


module.exports = exports = socketClient;

