const net          = require("net");
const util         = require("util");
const EventEmitter = require("events");
const fxNetSocket  = require('fxNetSocket');
const FxConnection = fxNetSocket.netConnection;
const parser       = fxNetSocket.parser;
const utilities    = fxNetSocket.utilities;
const NSLog        = fxNetSocket.logger.getInstance();
const fs           = require('fs');
const path         = require('path');
const cfg          = require('./config.js');
const NetStream    = require('./vp6f/libvp62Cl.js');
util.inherits(FxMediaServer, EventEmitter);
const NODE_CDID    = process.argv[2] | 0;
const isCluster    = !(process.send instanceof Function);
NSLog.configure({
    logFileEnabled:false,
    consoleEnabled:true,
    level:'error',
    dateFormat:'[yyyy-MM-dd hh:mm:ss]',
    fileName:'vp6Srv_'+ NODE_CDID,
    filePath:path.dirname(__dirname)+"/node-videos/historyLog",
    maximumFileSize: 1024 * 1024 * 100});

function FxMediaServer() {
    EventEmitter.call(this);

    this.videoProxies = {};/****/

    this.userAgent = {};
    this.userHTTPAgent = {};
    this.httpConns = 0;

    this.server = this.setupServer();

    this.batchConnStreaming();

    this.setupIPCBridge();

    setInterval(function () {
        fs.writeFileSync("./historyLog/date.txt", new Date().toLocaleTimeString());
    }, 100)
}
FxMediaServer.prototype.setupServer = function () {
    var srv = new FxConnection(8002,{runListen: isCluster, glListener:false, baseEvtShow: false});
    srv.userPingEnabled = false;
    srv.setBinaryType = "arraybuffer";
    srv.on('Listening', function (app) {
        var info = srv.app.address();
        NSLog.log("quiet", "The service has started to address [%s]:%s. ", info.address, info.port);
    });
    srv.on("connection", this.onConnection.bind(this));
    srv.on("httpUpgrade", this.onHTTPConnection.bind(this));
    srv.on("close", function () {});
    return srv;
};
FxMediaServer.prototype.onConnection = function (client) {
    var self      = this;
    /** 播放時間 **/
    client.vts    = 0;
    /** 播放張數 **/
    client.vcount = 0;
    /** 開始時間 **/
    client.vtsStart = new Date().getTime();
    /** 延遲時間 **/
    client.vDuration = 0;

    if (typeof self.userAgent[client.namespace] == "undefined") self.userAgent[client.namespace] = {};
    self.userAgent[client.namespace][client.name] = client;
    client.write(self.videoProxies[client.namespace].fileHeader);
    client.on("disconnect", function (name) {
        self.userAgent[client.namespace][name] = undefined;
        delete self.userAgent[client.namespace][name];
        console.log("disconnect", client.namespace, client.name);
    });
};
FxMediaServer.prototype.onHTTPConnection = function (req, client, head) {
    NSLog.log("quiet", "## http connection ##");
    var _get      = head[0].split(" ");
    var socket    = client.socket;
    var namespace = _get[1].replace("/fxvideo", "");
    namespace = namespace.replace(".flv", "");
    var id        = this.httpConns++;
    var self      = this;
    socket.on("end",function () {
        self.userHTTPAgent[namespace][id] = undefined;
        delete self.userHTTPAgent[namespace][id];
    });
    this.sendHeaders(200, socket, "application/x-binary", this.videoProxies[namespace].fileHeader);
    setTimeout(function () {
        var clients = self.userHTTPAgent[namespace];
        if (typeof clients == "undefined") clients = self.userHTTPAgent[namespace] = {};
        client.socket.namespace = namespace;
        clients[id] = client.socket;
    }, 20);

};
FxMediaServer.prototype.batchConnStreaming = function () {
    var self = this;
    var assign = cfg.assignRule2[NODE_CDID];
    var assignLives = cfg.assignLives;
    var i = 0;
    var len = assign.length;
    var pipeline = function pipeline() {
        var obj = assign[i];

        var liveStreams = assignLives[obj];
        if (typeof liveStreams == "undefined") {
            liveStreams = assignLives["default"];
        }
        for (var j = 0; j < liveStreams["streamName"].length; j++) {
            var streamName = liveStreams["streamName"][j];
            var options = {
                bFMSHost:liveStreams["bFMSHost"],
                bFMSPort:liveStreams["bFMSPort"],
                videoPaths:'/video/' + obj + "/" + streamName
            };
            connectRTMPStream(options, 200*j);
        }

        if (++i < len) setTimeout(pipeline, 100);
        else self.makeSureComplete();
    };

    setTimeout(pipeline, 1000);

    function connectRTMPStream(options, delay) {
        setTimeout(function () {
            NSLog.log("error", "createFMSStream:", options);
            self.createLiveStreaming(options);
        }, delay)
    }
};
FxMediaServer.prototype.createLiveStreaming = function (options) {
    var self      = this;
    var fileName  = options.videoPaths;
    var streaming = new NetStream(options);
    self.videoProxies[fileName] = streaming;
    /** base64 data **/
    // streaming.on("onVideoData", function (data, keyframe, timestamp) {});
    streaming.on("error", function (e) {});
    // streaming.on("naluInfo", function (base64) {});
    /** no flv header data **/
    streaming.on("onFlvSession", function (data) {
        var clients = self.userAgent[fileName]; //self.server.getClients();
        if (typeof clients == "undefined") clients = self.userAgent[fileName] = {};
        self.broadcast(clients, data, fileName);

        clients = self.userHTTPAgent[fileName];
        if (typeof clients == "undefined") clients = self.userHTTPAgent[fileName] = {};
        self.httpBroadcast(clients, data, fileName);

    });
};
FxMediaServer.prototype.broadcast = function (clients, data, fileName) {
    var keys = Object.keys(clients);
    if (keys.length == 0) return;

    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace === fileName)
                socket.write(data);
        }
    }
    keys = null;
};
FxMediaServer.prototype.httpBroadcast = function (clients, data, fileName) {
    var keys = Object.keys(clients);
    if (keys.length == 0) return;

    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if ((socket && socket.writable && !socket.destroyed)) {
            if (socket.namespace === fileName)
                socket.write(data);
        }
    }
    keys = null;
};

FxMediaServer.prototype.sendHeaders = function (code, socket, type, data) {
    var contentType = "text/html";
    var contentLength = 0;
    if (type.constructor === Object) {
        contentType = type['Content-Type'];
        //contentLength = type['Content-Length'];
    }else{
        if (type === 'js') {
            contentType = "application/javascript";
        }else if (type === 'jpeg') {
            contentType = 'image/jpg';
        }else if (type === 'html') {
            contentType = "text/html";
        } else {
            contentType = type;
        }
    }

    // TODO GET Parent Server.app.address().address

    var headers = parser.headers.responseHeader(code, {
        "Host": '127.0.0.1',
        "accept": "*/*",
        "Connection": "Keep-Alive",
        // "Keep-Alive": "timeout=3, max=10",
        "Access-Control-Allow-Headers": "range",
        // "Content-Range":'bytes=0-',
        "Access-Control-Allow-Origin": "*",
        "Content-Type": contentType
    });
    console.log(Buffer.isBuffer(data));
    if (typeof data != "undefined") {

        headers = Buffer.concat([new Buffer(headers), data]);
    }
    //socket.write("Content-Security-Policy: default-src 'self'; img-src *;object-src 'self' http://127.0.0.1; script-src 'self' http://127.0.0.1;\n");
    if (socket != null && typeof socket != 'undefined') socket.write(headers);
};


FxMediaServer.prototype.setupIPCBridge = function () {
    var self = this;
    NSLog.log("debug","setup ipc bridge connection");

    // utilities.autoReleaseGC();

    process.on("SIGQUIT", this.bridgeQuitSignal);
    process.on("disconnect", this.bridgeDisconnect);
    process.on("message", this.bridgeMessageConversion.bind(this));

    process.on("uncaughtException", function (err) {
        NSLog.log("quiet"," ================== uncaughtException start ====================== ");
        NSLog.log("quiet", err.stack);
        NSLog.log("quiet"," ================== uncaughtException ended ====================== ");
    });

};
FxMediaServer.prototype.bridgeQuitSignal = function () {
    NSLog.log("debug", "IPC channel exit -1");
    process.exit(-1);
};
FxMediaServer.prototype.bridgeDisconnect = function () {
    NSLog.log("debug", "sends a QUIT signal (SIGQUIT)");
    process.exit(0);
};
FxMediaServer.prototype.bridgeMessageConversion = function (data, handle) {
    var json = data;
    var socket;
    var server = this.server;
    if (typeof json === 'string') {
    }
    else if (typeof json === 'object') {

        if (data.evt == "c_init") {
            socket = new net.Socket({
                handle:handle,
                allowHalfOpen:server.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
            socket.relatedData = new Buffer(data.data);
            socket.emit('data', socket.relatedData);
            socket.resume();
        }
        else if (data.evt === "c_socket") {
            socket = handle;
            server.app._setupSlave([socket]);
            socket.setKeepAlive(true, 100000);

            socket.fd = handle.fd;
            socket.setTimeout(1000, function () {
                process.stdout.write(String(socket.remoteAddress).split(":")[3] + socket.remotePort +'\n');
                socket.close();
            });
            socket.readable = true;
            socket.writable = true;

            socket.resume();
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
        }
        else if (data.evt === "streamData") {
            this.sendStreamData(data)
        }
        else if (data.evt === "c_equal_division") {
            socket = new net.Socket({
                handle:handle,
                allowHalfOpen:srv.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.resume();
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
        }
        else if (data.evt === "processInfo") {
            process.send({"evt":"processInfo", "data" : {"memoryUsage":process.memoryUsage(),"connections": server.getConnections()}})
        }
    }
    else {
        NSLog.log("error",'out of hand. dismiss message.\n');
    }
};
FxMediaServer.prototype.makeSureComplete = function () {
    if (process.send instanceof Function) {
        process.send({"action":"creationComplete"});
    }
};
module.exports = exports = FxMediaServer;

var nodeMediaServer = new FxMediaServer();