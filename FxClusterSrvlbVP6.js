/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const Log          = require('debug');
const debug        = Log('LiveCluster');
const info         = Log('INFO:IPCBridge');
const fxNetSocket  = require('fxNetSocket');
const FxConnection = fxNetSocket.netConnection;
const parser       = fxNetSocket.parser;
const utilities    = fxNetSocket.utilities;
const NSLog        = fxNetSocket.logger.getInstance();
const fs           = require('fs');
const path         = require('path');
const net          = require('net');
const cfg          = require('./config.js');
const NetStream    = require('./vp6f/libvp62Cl.js');
const NODE_CDID    = process.argv[2];
NSLog.configure({
    logFileEnabled:true,
    consoleEnabled:true,
    level:'error',
    dateFormat:'[yyyy-MM-dd hh:mm:ss]',
    fileName:'vp6Srv_'+ NODE_CDID,
    filePath:path.dirname(__dirname)+"/node-videos/historyLog",
    maximumFileSize: 1024 * 1024 * 100});
/** 多執行緒 **/
var server = null;
var count = 0;
/** 前畫面 **/
var preStream = [];
var naluInfoFrame = [];


function FxClusterRTMP() {

    this.initizatial();

    this.videoGroup = [];

    this.setupIPCBridge();

    this.setupLivePlaylists();

}

FxClusterRTMP.prototype.setupIPCBridge = function () {

    var self = this;

    info("setup ipc bridge connection");

    utilities.autoReleaseGC();

    process.on("SIGQUIT", this.bridgeQuitSignal);
    process.on("disconnect", this.bridgeDisconnect);
    process.on("message", this.bridgeMessageConversion.bind(this));

};
FxClusterRTMP.prototype.bridgeDisconnect = function () {
    info("sends a QUIT signal (SIGQUIT)");
    process.exit(0);
};
FxClusterRTMP.prototype.bridgeQuitSignal = function () {
    info("IPC channel exit -1");
    process.exit(-1);
};
FxClusterRTMP.prototype.bridgeMessageConversion = function (data, handle) {
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
FxClusterRTMP.prototype.removeAllEvent = function () {
    process.removeListener("SIGQUIT", this.bridgeQuitSignal);
    process.removeListener("disconnect", this.bridgeDisconnect);
    process.removeListener("message", this.bridgeMessageConversion);
};
FxClusterRTMP.prototype.sendStreamData = function (json) {
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

    if (json.keyframe == 0x14 || json.keyframe == 0x17) {

        // stream["KeyFrame"] = {"NetStreamEvent": "NetStreamData",'keyframe': json.keyframe+1,"d":'m3u8', 'data': json.data};
        stream["KeyFrame"] = {"NetStreamEvent": "NetStreamData",'t':json.ts, 'data': json.data};
        if (!stream.IFrame) stream["IFrame"] = [];
        stream.IFrame = [];
        // console.log('(PFrame)json.info.keyframe', stream["keyframe"], stream.PFrame.length);
    }
    else if (json.keyframe == 0x24 || json.keyframe == 0x27) {

        if (!stream.IFrame) stream["IFrame"] = [];

        // console.log('(IFrame)json.info.keyframe', stream["keyframe"], stream.PFrame.length);
        // stream.IFrame.push({"NetStreamEvent": "NetStreamData",'keyframe': json.keyframe+1,"d":'m3u8', 'data': json.data});
        stream.IFrame.push({"NetStreamEvent": "NetStreamData",'t': json.ts, 'data': json.data});
    }

    if (keys.length == 0) return;
    for (var i = 0; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace == spawnName) {
                var str = "";
                if (json.data.type == 'Buffer'){
                    str = new Buffer(json.data.data);
                } else {
                    // str = JSON.stringify({"NetStreamEvent": "NetStreamData",'keyframe': json.keyframe+1,"d":'m3u8', 'data': json.data});
                    str = JSON.stringify({"NetStreamEvent": "NetStreamData",'t':json.ts,'data': json.data});
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
FxClusterRTMP.prototype.setupLivePlaylists = function() {
    var self = this;
    var CDID = NODE_CDID;
    var assign = cfg.assignRule[CDID];
    var assignLives = cfg.assignLives;

    for (var i = 0; i < assign.length; i++) {
        var obj = assign[i];

        var liveStreams = assignLives[obj];
        if (typeof liveStreams == "undefined") {
            liveStreams = assignLives["default"];
        }
        for (var j = liveStreams["streamName"].length - 1; j >= 0; j--) {
            var streamName = liveStreams["streamName"][j]; //
            var options = {
                bFMSHost:liveStreams["bFMSHost"],
                bFMSPort:liveStreams["bFMSPort"],
                videoPaths:'/video/' + obj + "/" + streamName
            };
            connectRTMPStream(options, 200*i);
        }

    }

    function connectRTMPStream(options, delay) {
        setTimeout(function () {
            NSLog.log("error", "createFMSStream:", options);
            self.createFMSStream(options);
        }, delay)
    }
    // next week 3;
    var d = new Date();
    d.setDate(d.getDate() - d.getDay() + 10);
    d.setHours(11);
    var waitWeek = d.getTime() - (new Date().getTime());
    setTimeout(function () {
        self.automaticMaintenance();
    }, waitWeek);
};

FxClusterRTMP.prototype.automaticMaintenance = function () {
    NSLog.log("warning", "automatic Maintenance...");
    var time = new Date();
    var keys = Object.keys(this.videoGroup);
    var key,stream,i;
    if (time.getDay() == 3 && time.getHours() >= 11 ) {
        // this.setupLivePlaylists();
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            stream = this.videoGroup[key];
            if (typeof stream == "undefined" && typeof stream["rtmp"] == "undefined" && stream["rtmp"].writable == false) {
                NSLog.log("error", "[Check] %s is Stop ~~~~~~~~~~~~", stream["rtmp"].name);
            }
        }
    }

};

/**
 * create socket connect to fms server
 * @param options {object}
 */
FxClusterRTMP.prototype.createFMSStream = function (options) {
    var fileName = options.videoPaths;
    var self = this;
    var s = self.videoGroup[fileName] = new NetStream(options);
    s.on('onVideoData', function (data, keyframe, timestamp) {
        self.sendStreamData({'evt':'streamData', 'namespace':fileName, "keyframe":keyframe, "muxer":s.muxer, "ts": timestamp, "data":data})
    });
    s.on('error', function (e) {
        // s.removeAllListeners();
        // s = undefined;
        // self.vClient(fileName);
    });
    s.on("naluInfo", function (base64) {
        naluInfoFrame[fileName] = base64;
    });

};
/** init 80 listen server communicate with webSocket, socket, flashSocket **/
FxClusterRTMP.prototype.initizatial = function () {
    var srv = new FxConnection(cfg.appConfig.port,{runListen: false});
    setupCluster(srv);
    server = srv;
};

module.exports = exports = FxClusterRTMP;
/** start server **/
var cluster = new FxClusterRTMP();

function setupCluster(srv) {

    srv.on('Listening', function (app) {
        debug('Listening...cluster');
    });
    srv.setBinaryType = "arraybuffer";
    // srv.setContentEncode = "br";
    srv.on('connection', function (client) {
        debug('clients:',client.name, client.wsProtocol);
        client.write(JSON.stringify({"NetStreamEvent":"NetConnect.Success","detail":client.namespace + "-" + NODE_CDID}));
        // client.binaryType = "arraybuffer";
        //H264 avc1 NALU INFO
        if (typeof naluInfoFrame[client.namespace] != "undefined") {
            client.write(JSON.stringify({"NetStreamEvent":"NetStreamData","keyframe":17,"data":naluInfoFrame[client.namespace]}));
        }


        var stream = preStream[client.namespace];

        if (!stream) return;

        if (!stream.KeyFrame) return;
        client.write(JSON.stringify(preStream[client.namespace].KeyFrame));

        if (!stream.IFrame) return;

        for (var i = 0; i < stream.IFrame.length; i++) {
            var obj = stream.IFrame[i];
            client.write(JSON.stringify(obj));
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
            }

        }
        catch (e) {
            evt.client.write(JSON.stringify({"event":"Error.Function"}));
        };
    });
    /** client socket destroy **/
    srv.on('disconnect', function (socket) {
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
        if (_get[1] === "/") {
            var file = path.join(__dirname, '/public/views/load-test.html');
            fs.readFile(file, function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }
        if (_get[1] === "/video.html") {
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

/* ------- ended testing logger ------- */

process.on('uncaughtException', function (err) {
    NSLog.log('error',err.stack);
});


