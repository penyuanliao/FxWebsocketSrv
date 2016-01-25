/**
 * Created by Benson.Liao on 2015/11/20.
 */
"use strict";
var debug = require('debug')('Connect');
var crypto = require("crypto");
var tls = require('tls'), // SSL certificate
    fs = require('fs');
var net = require('net');
var util = require('util');
var events = require('events');

var fxSocket = require('./FxSocket.js');

var logger = require('./FxLogger.js');

var fxStatus = require('./FxEnum.js').fxStatus;

var clients = []; // 紀錄使用者

var clusterJS = "FxLiveStreamSrvCluster.js";

util.inherits(FxConnection, events.EventEmitter); // 繼承事件

// todo enum event dispach

/**
 * initialize net.socket
 * @param port
 * @param option
 * @constructor
 **/
function FxConnection(port, option){

    /* Variables */

    events.EventEmitter.call(this);

    var self = this;
    this.self = self;
    this.clusters = []; // all child process group

    var app = this.app = net.createServer();

    /* Codes */

    var cb = function () {
        debug('Listening on ' + app.address().port);

        self.emit("Listening", app);


    }


    this.server = this.app.listen(port, cb);

    this.app.on('connection', function(socket) {

        var client = new fxSocket(socket);
        // First one, do check connected.
        socket.once('data', function (data) {
            var mode = findOutSocketConnected(client, data, self);
            logger.debug("[Connection] Client through Server for mode " + mode);

            if (mode != fxStatus.http)
            {
                client.isConnect = true;
                addUpdateData(mode);
                // debug("[INFO] Add client mode:",client.mode);
                clients[client.name] = client; //TODO 二維分組namespace物件
            } else {
                //var http = data.toString('utf8');
                //client.close();
            };

        });
        /**
         * 確定連線後連線資料事件並傳出data事件
         * @param mode 型態(fxStatus)
         */
        function addUpdateData(mode) {

            socket.on('data', function (chunk) {

                var data = chunk;

                if (mode === fxStatus.websocket) {
                    var obj = client.read(chunk);
                    data = obj.msg;
                    if(obj.opcode == 8)
                    {
                        self.clientDestroy(client);
                    }
                }

                self.emit("message", data);
            });

        };

        socket.on('close',  sockDidClosed);
        socket.on('end',    sockDidEnded);
        socket.on('error',  sockDidErrored);

    });

    function sockDidClosed() {
        debug('LOG::SOCKET WILL CLOSED : COUNT(%d)',Object.keys(clients).length -1);

        var socket = this;
        var index = clients.indexOf(socket.name);
        var removeItem;
        if (index > -1) removeItem = index.splice(index, 1);
        delete clients[socket.name];
        self.emit('disconnect', removeItem);

    };

    function sockDidEnded() {
        debug('LOG::SOCKET ENDED');
        var socket = this;
        socket.end();
    };

    function sockDidErrored(e) {
        debug('LOG::SOCKET ERROR');
        self.emit('error', e);
    };

};
FxConnection.prototype.clientDestroy = function (client) {
    client.write(JSON.stringify({"NetStatusEvent":"Connect.Closed"}));
    client.close();
};
FxConnection.prototype.eventDispatch = function (client,evt) {

    if (typeof client !== 'undefined' && client !== null) return;

    // Connect.Success 1
    // Connect.Rejected 2
    // Connect.AppReboot 3
    // Connect.AppShutdown 4
    // Connect.Closed 5
    // Connect.Failed 6

    if (typeof evt === 'number') {
        var e = "";
        if (evt == 1) {
            e = "Success";
        }else if (evt == 2) {
            e = "Success";
        }else if (evt == 3) {
            e = "AppReboot";
        }else if (evt == 4) {
            e = "AppShutdown";
        }else if (evt == 5) {
            e = "Closed";
        }else if (evt == 6) {
            e = "Failed";
        }
        client.write(JSON.stringify({"NetStatusEvent":e}));


    }else
    {
        client.write(JSON.stringify(evt));
    }

};
/***
 * only accepts secure connections
 * @param option : {"key":"public key", "cert": "public cert"}
 * @constructor
 */
FxConnection.prototype.FxTLSConnection = function (option){
    //https server only deff need a certificate file.
    var loadKey = fs.readFileSync('keys/skey.pem');
    var loadcert = fs.readFileSync('keys/scert.pem');
    var options = {
        key : loadKey,
        cert: loadcert
    };

    var self = this.self;

    tls.createServer(options, function (socket) {
        debug('TLS Client connection established.');

        // Set listeners
        socket.on('readable', function () {
            debug('TRACE :: Readable');

        });

        var client = new fxSocket(socket);
        socket.on('data', function (data) {
            debug('::TRACE DATA ON STL CLIENT');
            sockDidData(client, data, self);
        });

    }).listen(8081);

}

var findOutSocketConnected = function (client, chunk, self) {
    //var socket = this;
    var request_headers = chunk.toString('utf8');
    var lines = request_headers.split("\r\n");
    // [?=\/] 結尾不包含
    var httpTag = lines[0].toString().match(/^GET (.+)[\/]? HTTP\/\d\.\d$/i);
    httpTag = (httpTag == null) ? lines[0].toString().match(/^GET (.+) HTTP\/\d\.\d$/i) + "/" : httpTag; // WS protocol namespace endpoint no '/'
    // FLASH SOCKET \0
    var unicodeNull = request_headers.match(/\0/g); // check endpoint
    var swfPolicy = request_headers.match("<policy-file-request/>") == null; // Flash Policy
    var iswebsocket = request_headers.match('websocket') != null; // Websocket Protocol

    //debug('LOG::Data received: ');

    if (unicodeNull != null && swfPolicy && client.mode != 'ws') {
        debug('[SOCKET_NET_CONNECTED]:');
        client.mode = fxStatus.flashSocket;

        self.emit('message', client.read(request_headers));

    }else if (iswebsocket) {
        debug('[WEBSOCKET_CONNECTED]');

        client.mode = 'ws';

        if (typeof httpTag[0] != "undefined") client.namespace = httpTag[1]; // GET stream namespace

        client.handeshake(chunk);
        // -- WELCOME TO BENSON WEBSOCKET SOCKET SERVER -- //
        client.write(JSON.stringify({"NetStatusEvent": "NetConnect.Success"}));

        self.emit('connection', client); //

        return fxStatus.websocket;
    }
    else if (client.mode === fxStatus.websocket)
    {
        debug('[WEBSOCKET_ROGER]');
        // check is a websocket framing

        var str = client.read(chunk);
        var opcode = client.protocol.opcode;

        debug("PROTOCOL::", opcode);
    }else
    {
        debug('[OTHER CONNECTED]');

        if (httpTag.length != 0 && iswebsocket == false)
        {
            client.mode = fxStatus.http;

            self.emit("httpUpgrade", request_headers, client, lines);

            return fxStatus.http;
        }
    }

};

/***
 * 計算使用者數量
 * @returns {*}
 */
FxConnection.prototype.clientsCount = function () {
    if (clients === null) return 0;

    var keys = Object.keys(clients);

    return keys.length;
};

FxConnection.prototype.getClients = function (namespace) {
    if (typeof namespace === 'undefined' || namespace == null ) return clients;

    // output array
    // TODO 不確定這樣寫法要不要留
    var keys = Object.keys(clients);
    var groups = [];
    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace === namespace)
                groups.push(socket);
        }
    }
    return groups;

};

module.exports = FxConnection;

// unit test //

//var s = new FxConnection(8080);
//s.FxTLSConnection(null);
//s.on('connection', function (socket) {
//    debug('clients:',socket.name);
//    debug(s.clientsCount());
//});
//s.on('message', function (data) {
//    debug("TRACE",data);
//});
//s.on('disconnect', function (socket) {
//    debug('disconnect_fxconnect_client.')
//});

