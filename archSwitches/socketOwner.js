/**
 * Created by Benson.Liao on 2016/5/30.
 */

const events = require('events');
const util = require('util');
const net = require('net');
const fxNetSocket = require('fxNetSocket');
const client = fxNetSocket.wsClient;
const logger = fxNetSocket.logger;
const os = require('os');
const v8 = require('v8');
// var NSLog = logger.getInstance();
// NSLog.configure({logFileEnabled:true, level:'info', dateFormat:'[yyyy-MM-dd hh:mm:ss]', maximumFileSize: 1024 * 1024 * 100});

util.inherits(socketOwner, events.EventEmitter); // 繼承事件

function socketOwner(sockHandle, buffer, app) {

    events.EventEmitter.call(this);

    var self = this;

    console.log('create one socket owner.');
    var socket = new net.Socket({
        handle:sockHandle
    });
    socket.readable = socket.writable = true;
    socket.server = app.server;

    var ws = new client(socket,function () {
        console.log('handshake successful.');
        self.emit('connect');

        ws.on('data', function (data) {
            console.log('Data Event is received ws-packet Stream.');
        });
        ws.on('message', function (msg) {
            console.log('Message is decode ws-packet Stream on:', msg);
            self.controller(msg);
        });
        ws.on('close', function () {
            self.dealloc();
        });
        ws.on('error', function (err) {
            self.dealloc();
        });
    });
    socket.emit("connect");
    socket.emit('data',buffer);
    socket.resume();

    this.ws = ws;
    this.app = app;

};
socketOwner.prototype.dealloc = function () {
    if (typeof this.app != 'undefined') this.app = null;
    if (typeof this.ws != 'undefined') this.ws = null;
    this.emit('close');
};

socketOwner.prototype.controller = function (tell) {

    var app = this.app;
    var ws = this.ws;
    var command = tell.split(" ");

    switch (command[0]) {
        case "/reboot":
            ws.write('reboot main server.');
            app.reboot();
            break;
        case "/restart":
            app.restart(command[1]);
            break;
        case "/memInfo":
            var obj = process.memoryUsage();
            if (typeof command[1] != 'undefined' && command[1] == '-v8') {
                ws.write(v8.getHeapStatistics());
            }else {
                ws.write(JSON.stringify(obj));
            }
            break;
        case "/pid":
            ws.write(this.getPid());
            break;
        case "/os":
            if (typeof command[1] != 'undefined' && command[1] != '-cpus') {
                ws.write(os.cpus());
            }
            break;
        case "/http":

            console.log(app.clusters['/video/daabb/video0/']);

            if (typeof command[1] != 'undefined'){
                console.log(command[1],command[1] == 'false');
                if (command[1] == 'true')
                    app.httpEnabled = true;
                else if (command[1] == 'false')
                    app.httpEnabled = false;
                else
                    argsIncorrect();
            }else {
                argsIncorrect();
            }
            break;
        case "/clusterRestart":
            if (typeof command[1] != 'undefined'){
                var num = parseInt(command[1]);
                if (typeof num == "number"){
                    app.clusterRestart(num);
                }else {
                    argsIncorrect();
                }
            }else {
                argsIncorrect();
            }
            break;
        case "/ffmpegRestart":
            if (typeof command[1] != 'undefined'){
                if (typeof command[1] == "string"){
                    app.ffmpegRestart(command[1]);
                }else {
                    argsIncorrect();
                }
            }else {
                argsIncorrect();
            }
            break;
        case "/connections":
                var conns = app.clusterConnections();
            console.log(conns);
            ws.write(JSON.stringify({'connections':conns}));
            break;

    }
    function argsIncorrect() {
        ws.write("Error running the command parameter is incorrect.")
    }
};

socketOwner.prototype.getPid = function () {
    var len = this.app.clusters.length;
    console.log(len);
    var list = [process.pid];
    for (var i = 0; i < len; i++) {
        var pid = this.app.clusters[i]._cpfpid;
        list.push(pid);
    }
    return list;
};



module.exports = exports = socketOwner;