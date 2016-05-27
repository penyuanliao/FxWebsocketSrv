/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const debug = require('debug')('Node:StreamServer'); //debug
const fxNetSocket = require('fxNetSocket');
const clusterConstructor = fxNetSocket.clusterConstructor;
const outputStream = fxNetSocket.stdoutStream;
const parser = fxNetSocket.parser;
const pheaders = parser.headers;
const utilities = fxNetSocket.utilities;
const logger = fxNetSocket.logger;
const daemon = fxNetSocket.daemon;
const cfg = require('../config.js');
const util = require('util');
/** 建立連線 **/
const TCP = process.binding("tcp_wrap").TCP;
const uv = process.binding('uv');
const fs  = require('fs');
const net  = require('net');
const evt = require('events');
const proc = require('child_process');

// heartbeat wait time before failover triggered in a cluster.
const heartbeatInterval = 5000;
const heartbeatThreshold = 12;

/** 多執行緒 **/
var isWorker = ('NODE_CDID' in process.env);
var isMaster = (isWorker === false);

//roundrobin conut
var roundrobinCount = 0;

util.inherits(StreamServer,clusterConstructor);

function StreamServer() {
    this.name = "StreamServer";
    this.author = "Benson.liao";
    this.connections = 0;
    this.initProcessEvent();
    /** 所有視訊stream物件 **/
    this.liveStreams = {};
    this.doWaiting = []; //心跳系統等待次數紀錄
    this.server;
    this.clusters = [];
    this.streamSockets = [];

    this.clusterEnable = false;

}
StreamServer.prototype.onMessage = function (data) {
    StreamServer.super_.prototype.onMessage(data).apply(this,[data]);
};
// ================================= //
//          FFMPEG STREAM            //
// ================================= //
StreamServer.prototype.createLiveStreams = function(fileName) {
    var self = this;
    var sn = fileName;
    var length = sn.length;
    var spawned, _name, i;
    debug('Init createLiveStreams');
    for (i = 0; i < length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            spawned = this.liveStreams[pathname] = new outputStream(sn[i],cfg.stream_proc);
            spawned.name = pathname;
            spawned.on('streamData', swpanedUpdate);
            spawned.on('close', swpanedClosed);
            this.streamHeartbeat(spawned);
            spawned = null;
        }else {
            throw Error("create Live Stream path error." + sn[i]);
        };
    };

    /** ffmpeg stream pull the data of a base64 **/

    function swpanedUpdate(base64) {
        self.doWaiting[this.ffmpeg_pid] = 0;
        var spawnName = this.name;
        self.emit('streamData', spawnName, base64);

    };
    /** ffmpeg stream close **/
    function swpanedClosed(code){

        self.socketSend({'NetStatusEvent': 'NetConnect.Failed'}, this.name);

        //** 監聽到自動關閉,重新啟動 code == 0 **/
        if (1) {
            debug("listen swpaned Closed - ",this.name, " < REBOOTING >");
            self.rebootStream(this,true);
        }

    };

};

/** 心跳檢查ffmpeg **/
StreamServer.prototype.streamHeartbeat = function(spawned) {
    var self = this;
    const waitTime = heartbeatInterval;
    const pid = spawned.ffmpeg_pid.toString();

    if (!pid) {console.error('Child_process create to failure!!!')}

    this.doWaiting[pid]= 0;
    function todo() {
        // debug('stream(%s %s) Heartbeat wait count:%d', spawned.name, pid, doWaiting[pid]);

        if (self.doWaiting[pid] >= heartbeatThreshold) { // One minute
            //TODO pro kill -9 pid
            proc.exec("kill -9 " + pid);
            delete self.doWaiting[pid];
        }else {
            self.doWaiting[pid]++;
            spawned.lookout = setTimeout(todo,waitTime);
        }
    }
    spawned.lookout = setTimeout(todo,waitTime);
}

/** 重啟stream **/
StreamServer.prototype.rebootStream = function(spawned,skip) {
    if ((spawned.running == false && spawned.STATUS >= 2) || skip == true) {
        var streamName = spawned.name.toString();
        clearTimeout(spawned.lookout);
        this.liveStreams[streamName].init();
        this.streamHeartbeat(spawned);
        debug('>> rebootStream:', streamName, this.liveStreams[streamName].ffmpeg_pid);
    };
};
StreamServer.prototype.socketSend = function(handle, spawnName) {

    for (var i = 0; i < this.clusters.length; i++) {
        if (this.clusters[i]) {
            this.clusters[i].send({'handle':handle,'evt':'socketSend','spawnName':spawnName});
        }

    }

};

/**
 * 分流處理
 * @param namespace
 * @returns {undefined}
 */
StreamServer.prototype.assign = function(namespace, cb) {
    var worker = undefined;
    var num = 0;
    var self = this;
    if (!self.clusters) {
        return;
    }

// url_param
    if (cfg.balance === "url_param") {
        cfg.assignRule.asyncEach(function (item, resume) {
            if (item.constructor === String) {
                console.log('string:id:', item);
                if (namespace.search(item) != -1) {
                    if (typeof cb !== 'undefined') {
                        worker = self.clusters[num];
                        if (cb) cb(worker);
                        return;
                    }
                }
            }
            if (item.constructor === Array) {
                var rule,
                    i = 0,
                    cunt = item.length;
                while (i < cunt) {
                    rule = item[i++];

                    if (namespace.search(rule) != -1) {

                        worker = self.clusters[num];

                        console.log('work -', num, self.clusters.length);

                        if (cb) cb(worker);
                        return;
                    }
                }
            }
            num++;
            resume();
        }, function () {
            if (!worker || typeof worker == 'undefined'){
                debug('ERROR::not found Worker Server:', namespace);
                if (cb) cb(worker);
            }else {
            }

        });
    }
    else if (cfg.balance === "roundrobin") {

        worker = this.clusters[roundrobinCount++];

        if (roundrobinCount >= this.clusters.length) {
            roundrobinCount = 0;
        }

        if (cb) cb(worker);
    }else if (cfg.balance === "leastconn") {
        var cluster = this.clusters[namespace][0];

        if (!cluster) {
            console.error('Error not found Cluster server');
            return;
        }

        var stremNum = cluster.length;
        for (var n = 0; n < stremNum; n++) {
            //檢查最小連線數
            if (cluster.nodeInfo.connections < clusters[namespace][n].nodeInfo.connections){
                cluster = clusters[namespace][n];
            }
        }
        if (cb) cb(cluster);
    } else {
        console.error('Error not found Cluster server');
        if (cb) cb(undefined);
    }
};

// ================================= //
//            TCP SERVER             //
// ================================= //
StreamServer.prototype.setupClusterServer2 = function (opt) {

    var self = this;

    var tcp = new fxNetSocket.fxTCP();

    tcp.createServer(opt);

    tcp.on('onRead', function (nread, buffer, handle) {

        debug('Client to use the %s request Connections.', handle.mode,handle.namespace);

        if(handle.mode == 'ws' || handle.mode == 'socket' || handle.mode == 'flashsocket') {
            self.assign(handle.namespace, function (worker) {
                
                if (typeof worker === 'undefined') {
                    handle.close();
                }else{
                    worker.send({'evt':'c_init',data:buffer}, handle,[{ track: false, process: false }]);
                };

            });
        }else if (handle.mode == 'http'){
            var obj = {};
            handle.getsockname(obj);
            debug('The client(%s:%s) try http request but Not Support HTTP procotol.',obj.address, obj.port);
            handle.close();
            handle = null;
        }else {
            console.error('Not found client to use the %s request Connections!!');
            handle.close();
        }

    });

}
/**
 *
 * 建立tcp伺服器不使用node net
 * @param opt
 */
StreamServer.prototype.setupClusterServer = function(opt) {
    if (!opt) {
        opt = {'host':'0.0.0.0', 'port': 8080, 'closeWaitTime': 5000,'backlog':511};
    };
    var self = this;
    var err, tcp_handle;
    try {
        tcp_handle = new TCP();
        err = tcp_handle.bind(opt.host, cfg.appConfig.port);

        if (err) {
            throw new Error(err);
        };

        err = tcp_handle.listen(opt.backlog);

        if (err) {
            throw new Error(err);
        };

        tcp_handle.onconnection = function (err ,handle) {

            if (err) throw new Error("client not connect.");

            handle.onread = onread_url_param;
            handle.readStart(); //讀header封包
            //onread_roundrobin(handle); //平均分配資源
            handle.closeWaiting = setTimeout(function () {
                debug('CLOSE_WAIT - Wait 5 sec timeout.');
                handle.close();
            },opt.closeWaitTime);
        };

        this.server = tcp_handle;
    }
    catch (e) {
        debug('create server error:', e);
        tcp_handle.close();
    };

    /** reload request header and assign **/
    function onread_url_param(nread, buffer) {
        var handle = this;
        // nread > 0 read success
        if (nread < 0) return;

        if (nread === 0) {
            debug('not any data, keep waiting.');
            return;
        };
        // Error, end of file.
        if (nread === uv.UV_EOF) { debug('error UV_EOF: unexpected end of file.'); return;}

        clearTimeout(handle.closeWaiting); //socket error CLOSE_WAIT(passive close)

        var headers = pheaders.onReadTCPParser(buffer);
        var source = headers.source;
        var general = headers.general;
        var isBrowser = (typeof general != 'undefined');
        var mode = "";
        var namespace = undefined;
        if (general) {
            mode = general[0].match('HTTP/1.1') != null ? "http" : mode;
            mode = headers.iswebsocket  ? "ws" : mode;
            namespace = general[1];
        }else
        {
            mode = "socket";
            namespace = buffer.toString('utf8');
            namespace = namespace.replace("\0","");
            console.log('socket - namespace - ', namespace);
            source = namespace;

            /** switch services code start **/


            /** switch services code end**/
        }
        if ((buffer.byteLength == 0 || mode == "socket" || !headers) && !headers.swfPolicy) mode = "socket";
        if (headers.unicodeNull != null && headers.swfPolicy && mode != 'ws') mode = "flashsocket";

        if ((mode === 'ws' && isBrowser) || mode === 'socket' || mode === "flashsocket") {

            self.assign(namespace, function (worker) {

                if (typeof worker === 'undefined') {
                    handle.close();
                }else{
                    worker.send({'evt':'c_init',data:source}, handle,[{ track: false, process: false }]);
                };

            });

        }else if(mode === 'http' && isBrowser)
        {
            var worker = self.clusters[0];

            if (typeof worker === 'undefined') return;
            worker.send({'evt':'c_init',data:source}, handle,[{ track: false, process: false }]);
        }else {
            handle.close();
            handle.readStop();
            handle = null;
            return;
        }

        handle.readStop();
    };



};

// ================================= //
//      Create Child_Process         //
// ================================= //
/**
 * 建立子執行緒
 * @param opt {cluster:(String)<js filename>, clusterNum:(Number)<count>}
 */
StreamServer.prototype.setupCluster = function(opt) {
    if (typeof opt === 'undefined') {
        opt = { 'cluster': '', 'clusterNum': 0 };
    }

    /** cluster start - isMaster **/

    var num = Number(opt.clusterNum);

    if (isMaster && num != 0) { // isMaster
        for (var i = 0; i < num; i++) {

            // file , fork.settings, args
            var env = process.env;
            env.NODE_CDID = i;
            env.PORT = cfg.appConfig.port;
            //var cluster = proc.fork(opt.cluster,{silent:false}, {env:env});
            var cluster = new daemon("" + opt.cluster,{silent:false}, {env:env}); //心跳系統
            cluster.init();
            cluster.name = 'ch_' + i;
            this.clusters.push(cluster);
        };
    };
    /** cluster end - isMaster **/
};

StreamServer.prototype.setupSingleServer = function () {
    var srv = new FxConnection(cfg.appConfig.port);
    srv.on('connection', function (socket) {
        debug('clients:',socket.name);
    });
}

// ================================= //
//        Client Connections         //
// ================================= //
StreamServer.prototype.initSocket = function (handle) {
    //todo new socket
};

StreamServer.prototype.createServer = function (clusterEnable) {
    this.clusterEnable = clusterEnable;
    if (this.clusterEnable) {
        // this.setupClusterServer(cfg.srvOptions);
        this.setupClusterServer2(cfg.srvOptions);
    }else
    {
        // todo single server
    }
};
/**
 * a new connection socket of live stream
 * @param host is specified remote address
 * @param port is specified remote port
 * @param namespace is specified path
 * @returns {*|Socket}
 */
StreamServer.prototype.addStreamSocket = function(host, port, namespace) {
    var self = this;
    var sock = new net.Socket();
    sock.namespace = namespace;
    sock.chunkSize = 0;
    sock.chunkBuffer = undefined;

    sock.connect(port, host, onConnected);
    function onConnected() {
        debug('connected to %s:%s', host, port,namespace);

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

            var json = JSON.parse(data.toString('utf8')).data;
            self.emit('streamData', namespace, json);

        }
    };
    function onEnd() {
        debug('ended.');
    };
    function onDrain() {
        debug('onDrain.');
    };

    return sock;
};
StreamServer.prototype.createClientStream = function(fileName, host , port) {
    var self = this;
    var sn = fileName;
    var length = sn.length;
    var i, _name;
    debug('Init createLiveStreams on %s:%s', host, port);
    for (i = 0; i < length; i++) {

        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);

        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            var socket = this.addStreamSocket(host, port, pathname);
            this.streamSockets.push({'socket':socket,namespace:pathname});
        };

    };
};


module.exports = StreamServer;

