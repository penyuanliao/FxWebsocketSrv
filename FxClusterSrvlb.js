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

initizatial();

function FxClusterSrvlb() {

    this.setupIPCBridge();

};

FxClusterSrvlb.prototype.setupIPCBridge = function () {

    var self = this;

    info("setup ipc bridge connection");

    utilities.autoReleaseGC();

    process.on("SIGQUIT", this.bridgeQuitSignal);
    process.on("disconnect", this.bridgeDisconnect);
    process.on("message", this.bridgeMessageConversion.bind(this));

    if (process.env.streamSource) this.addClient();
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

    if (typeof json === 'string') {


    }else if (typeof json === 'object') {

        if (data.evt == "c_init") {
            var socket = new net.Socket({
                handle:handle,
                allowHalfOpen:server.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.resume();
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
            socket.emit('data',new Buffer(data.data));
            return;
        }
        else if (data.evt === "c_socket") {
            var socket = handle;
            server.app._setupSlave([socket]);
            socket.setKeepAlive(true, 100000);

            socket.fd = handle.fd;
            socket.setTimeout(1000, function () {
                process.stdout.write(String(socket.remoteAddress).split(":")[3] + socket.remotePort +'\n');
            });
            socket.readable = true;
            socket.writable = true;

            socket.resume();
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
            return;
        }
        else if (data.evt === "streamData") {

            this.sendStreamData(data)

        }
        else if (data.evt === "c_equal_division") {
            var socket = new net.Socket({
                handle:handle,
                allowHalfOpen:srv.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.resume();
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");

            return;
        }
        else if (data.evt === "socketSend") {
            socketSend(data.handle, data.spawnName);
            return;
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
    if (keys.length == 0) return;
    for (var i = 0; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace == spawnName) {
                var str = "";
                if (json.data.type == 'Buffer'){
                    str = new Buffer(json.data.data);
                }else{
                    str = JSON.stringify({"NetStreamEvent": "NetStreamData", 'data': json.data});
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
}
var socketClient = require('./archSwitches/socketClient.js');
FxClusterSrvlb.prototype.vClient = function (fileName) {
    var self = this;
    var client = new net.Socket();
    var soucre = {}
    soucre.host = process.env.streamSource;
    soucre.port = 80;
    // console.log('CONNECTED TO: ' + soucre.host + ':' + soucre.port,fileName);
    var sock = new socketClient( soucre.host, soucre.port, fileName, function (data) {
        self.sendStreamData({'evt':'streamData','namespace':fileName,'data':data});
    });
};

FxClusterSrvlb.prototype.addClient = function() {

    var cdid = process.env.NODE_CDID;
    var assgin = cfg.assignRule[cdid];
    var list = [];
    for (var i = 0; i < assgin.length; i++) {
        var obj = assgin[i];

        list.push('/video/'+ obj +'/video0/');
        list.push('/video/'+ obj +'/video1/');
        list.push('/video/'+ obj +'/videosd/');
        if (obj == 'daacb' || obj === 'daagb') {
            list.push('/video/'+ obj +'/video2/');
        }

    }
    for (var j = 0; j < list.length; j++) {
        var obj = list[j];
        this.vClient(obj);

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
            var file = path.join(__dirname, '/public/views/broadwayPlayer.html');
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
    console.error(err.stack);
});


