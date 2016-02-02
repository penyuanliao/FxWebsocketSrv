/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */

var debug = require('debug')('LiveCluster');
var fxNetSocket = require('./fxNetSocket');
var FxConnection = fxNetSocket.netConnection;
var outputStream = fxNetSocket.stdoutStream;
var parser = fxNetSocket.parser;
var utilities = fxNetSocket.utilities;
var logger = fxNetSocket.logger;
var fs  = require('fs');
var net  = require('net');
var evt = require('events');
var cfg = require('./config.js');
var proc = require('child_process');
/** 所有視訊stream物件 **/
var liveStreams = {};
/** 多執行緒 **/
var cluster = require('cluster');
var isWorker = ('NODE_CDID' in process.env);
var isMaster = (isWorker === false);
var server;
var sockets = [];
var _handle = undefined;


var self = this;

var srv = new FxConnection();
setupCluster(srv);
server = srv;
//server.app.listen(3001);

var count = 0;
process.on('message', function(data , handle) {
    var json = data;
    if (typeof data.evt == 'undefined') return;

    if (data.evt === 'streamData') {
        //createLiveStreams();
        var spawnName = json.namespace;
        var clients = server.getClients();
        var keys = Object.keys(clients);
        if (count != keys.length) {
            count = keys.length;
            console.log('clients.count.', keys.length);
        }
        if (keys.length == 0) return;
        for (var i = 0; i < keys.length; i++) {
            var socket = clients[keys[i]];
            if (socket.isConnect == true) {
                if (socket.namespace == spawnName) {
                    var str = JSON.stringify({"NetStreamEvent": "NetStreamData", 'data': json.data});
                    //debug('INFO::::%s bytes', Buffer.byteLength(str));
                    //!!!! cpu very busy !!!
                    socket.write(str);
                }

            }
        }
        keys = null;
    }
        if (data.evt == 'c_equal_division') {

            var socket = new net.Socket({
                handle:handle,
                allowHalfOpen:srv.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.resume();
            socket.server = srv.app;
            server.app.emit("connection", socket);
            socket.emit("connect");

            return;
        }
        if (data.evt == 'c_init') {

            var socket = new net.Socket({
                handle:handle,
                allowHalfOpen:srv.app.allowHalfOpen
            });
            socket.readable = socket.writable = true;
            socket.resume();
            socket.server = srv.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
            socket.emit('data',new Buffer(data.data));
            return;
        }
        if (data == 'c_socket') {

            console.log("maxConnections:",server.maxConnections);

            var socket = handle;
            server.app._setupSlave([socket]);
            socket.setKeepAlive(true, 100000);

            socket.fd = handle.fd;
            socket.setTimeout(1000, function () {
                console.log(String(socket.remoteAddress).split(":")[3], socket.remotePort);
            });
            socket.readable = true;
            socket.writable = true;

            socket.resume();
            socket.server = server.app;
            server.app.emit("connection", socket);
            socket.emit("connect");
            return;
        }
        if (data == 0) {
            return;
        }
        else if ((typeof data.handle != 'undefined') && data.handle === 'socketSend') {
            socketSend(data.evt, data.spawnName);
            return;
        }
});
/*
function createLiveStreams(fileName) {
    var sn = ['rtmp://183.182.79.162:1935/video/daabb/video0/'];
    var spawned,_name;
    for (var i = 0; i < sn.length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            spawned = liveStreams[pathname] = new outputStream(sn[i]);
            spawned.name = pathname;
            spawned.on('streamData', swpanedUpdate);
            //spawned.on('close', swpanedClosed);
            spawned = null;
        }else {
            throw "create Live Stream path error." + sn[i];
        }

    };
};

function swpanedUpdate(base64) {

    var spawnName = this.name;
    var clients = server.getClients();
    var keys = Object.keys(clients);
    if (keys.length == 0) {
        keys = null;
        clients = null;
        return;
    }
    debug('keys:',keys.length);
    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace === spawnName)
                socket.write(JSON.stringify({"NetStreamEvent":"NetStreamData",data:base64}));
        }
    }
    keys = null;
    clients = null;
}
*/


if (isMaster) initizatialSrv();

/** cluster ended **/

function initizatialSrv() {
    /** createLiveStreams **/
        //createLiveStreams(cfg.appConfig.fileName);
    setInterval(observerTotoalUseMem, 60000); // testing code 1.0 min

    //utilities.autoReleaseGC(); //** 手動 1 sec gc

    var srv = new FxConnection(cfg.appConfig.port,{'cluster':4});
    setupCluster(srv);
    server = srv;



    isMaster = false;
}

function setupCluster(srv) {

    srv.on('Listening', function (app) {
        debug('Listening...cluster');
    });

    srv.on('connection', function (socket) {
        debug('clients:',socket.name);
    });
    /** socket data event **/
    srv.on('message', function (data) {
        debug('message :',data);
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

            fs.readFile('./public/views/broadwayPlayer.html', function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);
                socket.end();
                //client.close();
            });
        }
        else if (_get[1] === "/favicon.ico") {
            failureHeader(404, socket, "ico");
            socket.end();
        }
        else
        {
            successfulHeader(200, socket, "js");
            var fsstream = fs.createReadStream("./public" + _get[1], {bufferSize: 1024 * 300, end:false});
            var fileLength = 0;
            fsstream.on('open', function () {
                fsstream.pipe(socket);
            });
            console.log('client:',typeof socket === 'undefined' , _get[1]);
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

        var contentType = type === 'js' ? "application/javascript" : "text/html";

        var headers = parser.headers.responseHeader(code, {
            "Host": srv.app.address().address,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Connection": "Keep-Alive",
            "Keep-Alive": "timeout=3, max=10",
            "Access-Control-Allow-Origin": "*",
            "Content-Type": contentType
        });

        //socket.write("Content-Security-Policy: default-src 'self'; img-src *;object-src 'self' http://127.0.0.1; script-src 'self' http://127.0.0.1;\n");
        socket.write(headers);
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

}

function socketSend(evt, spawnName) {

    var clients = server.getClients();
    var keys = Object.keys(clients);
    if (keys.length == 0) return;

    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace === spawnName)
                socket.write(JSON.stringify(evt));
        }

    }

    keys = null;

}
/* ------- ended testing logger ------- */

process.on('uncaughtException', function (err) {
    console.error(err.stack);
});