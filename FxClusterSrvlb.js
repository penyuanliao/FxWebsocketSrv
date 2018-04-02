/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const Log = require('debug');
const debug = Log('LiveCluster');
const info = Log('INFO:IPCBridge');
const fxNetSocket = require('fxNetSocket');
const FxConnection = fxNetSocket.netConnection;
//var outputStream = fxNetSocket.stdoutStream;
const parser = fxNetSocket.parser;
var utilities = fxNetSocket.utilities;
//var logger = fxNetSocket.logger;
const fs  = require('fs');
const path = require('path');
const net  = require('net');
const evt = require('events');
const cfg = require('./config.js');
const proc = require('child_process');
/** 多執行緒 **/
var server = null;
var count = 0;
/** 前畫面 **/
var preStream = [];

initizatial();

function FxClusterSrvlb() {

    this.setupIPCBridge();
    makeSureComplete();
}

FxClusterSrvlb.prototype.setupIPCBridge = function () {

    var self = this;

    info("setup ipc bridge connection");

    utilities.autoReleaseGC();

    process.on("SIGQUIT", this.bridgeQuitSignal);
    process.on("disconnect", this.bridgeDisconnect);
    process.on("message", this.bridgeMessageConversion.bind(this));

};
FxClusterSrvlb.prototype.bridgeDisconnect = function () {
    info("sends a QUIT signal (SIGQUIT)");
    process.exit(0);
};
FxClusterSrvlb.prototype.bridgeQuitSignal = function () {
    info("IPC channel exit -1");
    process.exit(-1);
};
FxClusterSrvlb.prototype.bridgeMessageConversion = function (data, handle) {
    var json = data;
    var socket;

    if (typeof json === 'string') {


    }else if (typeof json === 'object') {

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
        else if (data.evt === 'http_chunked') {
            socket = new net.Socket({
                handle:handle,
                allowHalfOpen:server.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.resume();
            socket.server = this.httpStream.app;
            this.httpStream.app.emit("connection", socket);
            socket.emit("connect");
            var d = new Buffer(data.data);
            var len = d.indexOf('\r\n\r\n');
            if (len == -1) len = d.length;
            d = d.slice(0, len);
            socket.emit('data', d);
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
        else if (data.evt === "socketSend") {
            socketSend(data.handle, data.spawnName);
        }
        else if (data.evt === "processInfo") {
            process.send({"evt":"processInfo", "data" : {"memoryUsage":process.memoryUsage(),"connections": server.getConnections()}})
        }else if (data.evt === "sourceStream") {



        }

    }else
    {
        process.stdout.write('out of hand. dismiss message.\n');
    }
};
FxClusterSrvlb.prototype.removeAllEvent = function () {
    process.removeListener("SIGQUIT", this.bridgeQuitSignal);
    process.removeListener("disconnect", this.bridgeDisconnect);
    process.removeListener("message", this.bridgeMessageConversion);
};
FxClusterSrvlb.prototype.sendStreamData = function (json) {
    var spawnName = json.namespace;
    var clients = server.getClients();
    var keys = Object.keys(clients);
    if (count != keys.length) {
        count = keys.length;
        process.stdout.write('clients.count:' + keys.length + '\n');
    }
    //** 載入問題 **/
    if (!preStream[json.namespace]) preStream[json.namespace] = {};
    var stream = preStream[json.namespace];
    var buf_size = Buffer.byteLength(json.data);
    stream.frameMaximum = Math.max(buf_size, stream.frameMaximum);

    if (stream["keyframe"] > 106) {
        stream.PFrame.length = 0;
        stream.frameMaximum = buf_size;
    }
    if (buf_size > 30000 || buf_size*2 > stream.frameMaximum) {

        stream["IFrame"] = {"NetStreamEvent": "NetStreamData",'keyframe': stream["keyframe"], 'data': json.data};
        if (!stream.PFrame) {
            stream["PFrame"] = [];
        }
        stream["keyframe"] = 0;
        stream.PFrame.length = 0;
        // console.log('(PFrame)json.info.keyframe', stream["keyframe"], stream.PFrame.length);
    }
    else if (buf_size < 30000) {

        if (!stream.PFrame) {
            stream["PFrame"] = [];
            stream["keyframe"] = 1;
        }
        stream["keyframe"]+=1;
        // console.log('(IFrame)json.info.keyframe', stream["keyframe"], stream.PFrame.length);
        stream.PFrame.push({"NetStreamEvent": "NetStreamData",'keyframe': stream["keyframe"], 'data': json.data});
    }

    if (keys.length == 0) return;
    for (var i = 0; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace == spawnName) {
                var str = "";
                if (json.data.type == 'Buffer'){
                    str = new Buffer(json.data.data);
                }else{
                    str = JSON.stringify({"NetStreamEvent": "NetStreamData",'type':json.info.sliceType,'keyframe': json.info.keyframe, 'data': json.data});
                }

                //debug('INFO::::%s bytes', Buffer.byteLength(str));
                //!!!! cpu very busy !!!

                //console.log('INFO::::%s bytes(%s)', Buffer.byteLength(str),socket.mode, process.env);
                if (socket.mode == 'socket') {
                    socket.write(str+'\0');
                }else
                {
                    socket.write(str);
                }
            }

        }
    }
    keys = null;
};
/***
 * change video tag
 * @param socket
 * @param assign move process
 */
FxClusterSrvlb.prototype.jumpShip = function (socket, assign) {
    var data      = socket.relatedData.toString();
    var namespace = socket.namespace;
    data.replace(namespace, assign);

    process.send({"evt":"socket_handle", "data": data, 'where':assign}, socket._handle);
    setTimeout(function () {
        socket.destroy();
    },5000);
};
var log = require('fxNodeRtmp').AMFLOG;
FxClusterSrvlb.prototype.createHTTPStreamReceive = function () {
    var httpStream = this.httpStream = new FxConnection(cfg.appConfig.port,{runListen: false});
    httpStream.on('connection', onConnection);
    httpStream.on('message', onMessage);
    httpStream.on('disconnect', onDisconnect);
    httpStream.on('httpUpgrade', onHttpUpgrade);
    httpStream.on('data', onData);

    function onConnection(client) {
        console.log('connection');
    }
    function onMessage(event) {

    }
    function onDisconnect(name) {

    }
    function onHttpUpgrade(req, client, head) {

    }
    function onData(chunk, namespace) {

        var offset  = chunk.indexOf('\r\n\r\n');
        var chunked;
        var data;
        var size;
        if (offset == -1) {
            offset = chunk.indexOf('\r\n');
            chunked = chunk.slice(2,chunk.length);
        }else {
            chunked = chunk.slice(4,chunk.length);
        }
        var end  = chunked.indexOf('\r\n');

        var end2 = data.indexOf('\r\n');
        if (offset < 10) {
            console.log(parseInt(chunk.slice(0, offset).toString(),16), chunk.length, offset);
        }
        /*
        while (offset == -1) {
            offset = chunk.indexOf("\r\n");
            size = parseInt(chunk.slice(0,offset).toString(),16);
            offset+=2;
            data = chunk.slice(offset, offset + size);
            chunk = chunk.slice(offset + size, chunk.length);
        }
        */

        // log.logHex(chunk.slice(0,50));
    }
};


module.exports = exports = FxClusterSrvlb;

new FxClusterSrvlb();

/** cluster ended **/

function initizatial() {

    var srv = new FxConnection(cfg.appConfig.port,{runListen: false});
    setupCluster(srv);
    server = srv;
}

function setupCluster(srv) {

    srv.on('Listening', function (app) {
        debug('Listening...cluster');
    });

    srv.on('connection', function (socket) {
        debug('clients:',socket.name);

        var stream = preStream[socket.namespace];

        if (!stream) return;

        if (!stream.IFrame) return;

        write(socket, preStream[socket.namespace].IFrame);

        if (!stream.PFrame) return;

        for (var i = 0; i < stream.PFrame.length; i++) {
            var obj = stream.PFrame[i];

            if (socket.mode == 'socket') {
                socket.write(JSON.stringify(obj) + '\0');
            }else
            {
                socket.write(JSON.stringify(obj));
            }

        }

    });
    /** socket data event **/
    srv.on('message', function (evt) {
        debug('message :',evt.data);

        try {
            var json = JSON.parse(evt.data);

            if (json.NetStreamEvent === 'getConnections') {
                evt.client.write(JSON.stringify({"NetStreamEvent":"getConnections","data":srv.getConnections()}));
            }

            if (json["event"] == 'PingEvent'){
                evt.client.write(JSON.stringify({"event":"PingEvent","data":json['data']}));
            }else if (json["event"] == "jumpShip") {
                self.jumpShip(evt.client.socket, json["data"]);
            }

        }
        catch (e) {
            evt.client.write(JSON.stringify({"event":"Error.Function"}));
        };
    });
    /** client socket destroy **/
    srv.on('disconnect', function (name) {
        debug('disconnect_fxconnect_client.');
        //socket.removeListener('connection', callback);
    });
    /** verification **/
    function verificationString(str) {
        var regexp = /(video\/[a-zA-Z]*\/video[0-9a-zA-Z]*)/i;
        var val = str.match(regexp);
        if (val !== null && typeof val !== 'undefined' && val[0] !== null) {
            return true;
        }else
            return false;
    }

    /**
     * client socket connection is http connect()
     * @param req: request
     * @param client: client socket
     * @param head: req header
     * **/
    srv.on('httpUpgrade', function (req, client, head) {

        debug('## upgrade ##' , client.name);

        var _get = head[0].split(" ");

        var socket = client.socket;
        console.log('get:::', _get[0]);
        if (_get[1] === "/load-test.html") {
            var file = path.join(__dirname, '/public/views/load-test.html');
            fs.readFile(file, function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }
        else if (_get[1] === "/video.html") {
            var file = path.join(__dirname, '/public/views/Video.html');
            fs.readFile(file, function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }else if (_get[1] === "VP6Fjs/video.html") {
            var file = path.join(__dirname, '/public/views/Video.html');
            fs.readFile(file, function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }
        else if (_get[1].indexOf('.html') != -1) {
            var file = path.join(__dirname, '/public', _get[1]);
            fs.readFile(file, function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }
        else if  (_get[1].indexOf('.png') != -1) {

            var file = path.join(__dirname, '/public', _get[1]);

            var stat = fs.statSync(file);


            socket.setEncoding('binary');

            var fileWriteStream1 = fs.createReadStream(file);
            fileWriteStream1.pipe(socket);
            //successfulHeader(200, socket, { 'Content-Type' : 'image/png'});
        }
        else if (_get[1].indexOf('.css') != -1) {
            var file = path.join(__dirname, '/public', _get[1]);
            fs.readFile(file, function (err, data) {
                successfulHeader(200, socket, "text/css");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }
        else
        {
             if (_get[1] === "/favicon.ico") {
                successfulHeader(200, socket, "image/x-icon");
            }else {
                successfulHeader(200, socket, "js");
            }
            var file = path.join(__dirname, '/public', _get[1]);
            var fsstream = fs.createReadStream(file, {bufferSize: 1024 * 300, end:false});
            var fileLength = 0;
            fsstream.on('open', function () {

                fsstream.pipe(socket);
            });
            process.stdout.write('client:' + (typeof socket === 'undefined') + _get[1] + '\n');
            fsstream.on('data', function (chunk) {
                fileLength += chunk.length;

            });
            fsstream.on('end', function () {
                //var file = Buffer.concat(list).toString();
                debug("%s file size : %d kb",_get[1],fileLength/1024);
                //socket.write("content-length:%d\r\n", fileLength);

                socket.end();

            });
            fsstream.on('error', function (err) {
                debug('fsStream error:', err);
            });

        }

    });

    srv.on('data',function (chunk) {
        console.log('chunk:', chunk.toString());
    });

    /**
     * @param code: response header Status Code
     * @param socket: client socket
     * @param type: content-type
     * */
    function successfulHeader(code, socket, type) {
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
            }else {
                contentType = type;
            }
        }

        // TODO GET Parent Server.app.address().address

        var headers = parser.headers.responseHeader(code, {
            "Host": '127.0.0.1',
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Connection": "Keep-Alive",
            "Keep-Alive": "timeout=3, max=10",
            "Access-Control-Allow-Origin": "*",
            "Content-Type": contentType
        });

        //socket.write("Content-Security-Policy: default-src 'self'; img-src *;object-src 'self' http://127.0.0.1; script-src 'self' http://127.0.0.1;\n");
        if (socket != null && typeof socket != 'undefined') socket.write(headers);
    };
    /**
     * @param code: response header Status Code
     * @param socket: client socket
     * */
    function failureHeader(code, socket) {

        var headers = parser.headers.responseHeader(code, {
            "Connection": "close" });
        socket.write(headers);

    }

};

function socketSend(evt, spawnName) {

    var clients = server.getClients();
    var keys = Object.keys(clients);
    if (keys.length == 0) return;

    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace === spawnName)
                socket.write(JSON.stringify(evt));

            if (socket.mode == 'socket') {
                socket.write('\0');
            }

        }

    }

    keys = null;

}

function write(socket, obj) {
    if (socket.mode == 'socket') {
        socket.write(JSON.stringify(obj) + '\0');
    }else
    {
        socket.write(JSON.stringify(obj));
    }

}

/* ------- ended testing logger ------- */     

process.on('uncaughtException', function (err) {
    console.error(err.stack);
});

function makeSureComplete() {
    if (process.send instanceof Function) {
        process.send({"action":"creationComplete"});
    }
}
