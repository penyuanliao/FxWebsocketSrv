/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const debug              = require('debug')('Node:StreamServer'); //debug
const path               = require('path');
const util               = require('util');
const fs                 = require('fs');
const dgram              = require('dgram'); // UDP
const fxNetSocket        = require('fxNetSocket');
const clusterConstructor = fxNetSocket.clusterConstructor;
const outputStream       = fxNetSocket.stdoutStream;
const parser             = fxNetSocket.parser;
const pheaders           = parser.headers;
const utilities          = fxNetSocket.utilities;
const daemon             = fxNetSocket.daemon;
const NSLog              = fxNetSocket.logger.getInstance();
var cfg                  = require('../config.js');
var IPSec;
var secPath = path.dirname(__dirname) + "/configfile/SecurityProfile.json";
fs.readFile(secPath, 'utf8', function (err, data) {
    if (err) throw err; // we'll not consider error handling for now
    IPSec = JSON.parse(data);
});
const owner = require('./socketOwner.js');
/** 建立連線 **/
const TCP = process.binding("tcp_wrap").TCP;
const uv = process.binding('uv');
const net = require('net');
const evt = require('events');
const proc = require('child_process');
// heartbeat wait time before failover triggered in a cluster.
const heartbeatInterval = 5000;
const sendWaitClose = 5000;
const heartbeatThreshold = 12;
const adminProtocol = 'admin';
const argFlags = {
    "HLS.m3u8":"vp62",
    "Video/WebM":'vp62',
    "Video/FLV":"FLV"
};


/** 多執行緒 **/
var isWorker = ('NODE_CDID' in process.env);
var isMaster = (isWorker === false);

//roundrobin conut
var roundrobinCount = 0;

util.inherits(StreamServer,clusterConstructor);

function StreamServer() {
    // StreamServer.super_.call(this);
    this.name = "StreamServer";
    this.author = "Benson.liao";
    this.connections = 0; //連線數量
    this.initProcessEvent(); //初始化process事件
    /** 所有視訊stream物件 **/
    this.liveStreams = {};
    /** 心跳系統等待次數紀錄 **/
    this.doWaiting = [];
    this.server; // TCP server listen
    /** 子程序物件 **/
    this.clusters = [];
    /** 橋接層連線socket物件 **/
    this.streamSockets = [];
    /** 管理層socket物件 **/
    this.owners = [];
    /**開啟管理連線**/
    this.ownersEnabled = false;
    /** 廣播層還是橋接層 **/
    this.clusterEnable = false;
    // this.vp6fStream();
    /** 橋接層是否開啟網頁測試 **/
    cfg.httpEnabled = false;
    this.userInofEcho   = {};
    utilities.autoReleaseGC();
};
StreamServer.prototype.onMessage = function (data) {
    StreamServer.super_.prototype.onMessage.apply(this,[data]);
};
// ================================= //
//          FFMPEG STREAM            //
// ================================= //
StreamServer.prototype.createLiveStreams = function(fileName) {
    var self = this;
    var sn = fileName;
    var length = sn.length;
    var spawned, _name, i;
    NSLog.log('info','Init createLiveStreams');
    for (i = 0; i < length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];

            var high = (_name[8].indexOf('hd') != -1);
            var standard = (_name[8].indexOf('sd') != -1);
            var customParams = {
                fps:high ? 30 : 10,
                maxrate:( high ? "800k" : (standard ? "500k" : "300k") )
            };

            spawned = this.liveStreams[pathname] = new outputStream(sn[i],cfg.stream_proc, customParams);
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

    function swpanedUpdate(base64, info) {
        self.doWaiting[this.ffmpeg_pid] = 0;
        var spawnName = this.name;
        self.emit('streamData', spawnName, base64, info);

    };
    /** ffmpeg stream close **/
    function swpanedClosed(code){

        //self.socketSend({'NetStatusEvent': 'NetConnect.Failed'}, this.name);

        //** 監聽到自動關閉,重新啟動 code == 0 **/
        if (1) {
            console.error("listen swpaned Closed - ",this.name, " < REBOOTING >");
            self.rebootStream(this,true);
        }

    }

};

/** 心跳檢查ffmpeg **/
StreamServer.prototype.streamHeartbeat = function(spawned) {
    var self = this;
    const waitTime = heartbeatInterval;
    const pid = spawned.ffmpeg_pid.toString();

    if (!pid) {console.error('Child_process create to failure!!!')}

    this.doWaiting[pid]= 0;
    function todo() {
        // debug('stream(%s %s) Heartbeat wait count:%d', spawned.name, pid, self.doWaiting[pid]);

        if (self.doWaiting[pid] >= heartbeatThreshold) { // One minute
            //TODO pro kill -9 pid
            proc.exec("kill -9 " + pid);
            delete self.doWaiting[pid];
        }else {
            self.doWaiting[pid]++;
            spawned.lookout = setTimeout(todo, waitTime);
        }
    }
    spawned.lookout = setTimeout(todo,waitTime);
};

/** 重啟stream **/
StreamServer.prototype.rebootStream = function(spawned,skip) {
    if ((spawned.running == false && spawned.STATUS >= 2) || skip == true) {
        var streamName = spawned.name.toString();
        clearTimeout(spawned.lookout);
        this.liveStreams[streamName].init();
        this.streamHeartbeat(spawned);
        debug('>> rebootStream:', streamName, this.liveStreams[streamName].ffmpeg_pid);
    }
};
/****/
StreamServer.prototype.socketSend = function(handle, spawnName) {

    for (var i = 0; i < this.clusters.length; i++) {
        if (this.clusters[i]) {
            this.clusters[i][0].send({'handle':handle,'evt':'socketSend','spawnName':spawnName});
        }

    }

};

/**
 * 分流處理
 * @param namespace
 * @returns {undefined}
 */
StreamServer.prototype.assign = function(namespace /* decoder, cb */) {
    var worker = undefined;
    var num = 0;
    var self = this;
    var cb = undefined;
    var decoder = "H264";
    var clusters;
    var rule = cfg.assignRule;
    if (typeof arguments[1] == "function" && arguments[1].constructor == Function) {
        cb = arguments[1];
    }else {
        if (typeof arguments[1] != "undefined") decoder = arguments[1];
        cb = arguments[2];
    }
    if (decoder == "H264") {
        clusters = this.clusters;
    }
    else if (decoder == "FLV") {
        clusters = this.clusters2FLV;
        rule = cfg.assignRule2;
    }
    else {
        clusters = this.clusters2VP6;
    }

    if (!clusters) {
        return;
    }

    // url_param
    if (cfg.balance === "url_param") {

        rule.asyncEach(iteratee, ended);
        
        function iteratee(item, resume) {
            if (item.constructor === String) {
                item = item + "/";
                console.log('string:id:', item);
                if (namespace.search(item) != -1) {
                    if (typeof cb !== 'undefined') {
                        worker = (typeof clusters[num] === "undefined") ? undefined :clusters[num][0];
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
                    rule = item[i++] + "/";
                    if (namespace.search(rule) != -1) {

                        worker = (typeof clusters[num] === "undefined") ? undefined :clusters[num][0];

                        // console.log('work -', num, self.clusters.length);

                        if (cb) cb(worker);
                        return;
                    }
                    console.log(rule, namespace);

                }
            }
            num++;
            resume();
        }
        function ended() {
            if (!worker || typeof worker == 'undefined'){
                debug('ERROR::not found Worker Server:', namespace);
                if (cb) cb(undefined);
            }else {

            }
        }
        
    }
    else if (cfg.balance === "roundrobin") {

        worker = clusters[roundrobinCount++][0];

        if (roundrobinCount >= clusters.length) {
            roundrobinCount = 0;
        }

        if (cb) cb(worker);
    }else if (cfg.balance === "leastconn") {
        var cluster = clusters[0][0];

        if (!cluster) {
            console.error('Error not found Cluster server');
            return;
        }

        var stremNum = cluster.length;
        for (var n = 0; n < stremNum; n++) {
            //檢查最小連線數
            if (cluster.nodeInfo.connections < clusters[n][0].nodeInfo.connections){
                cluster = clusters[n][0];
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

        handle.readStop();
        var remoteInfo = {};
        handle.getpeername(remoteInfo);

        NSLog.log("error",'Client to use the %s request Connections.', handle.mode ,handle.namespace, handle.urlArguments);

        if (handle.wsProtocol == adminProtocol && self.ownersEnabled) {
            self.initSocket(handle, buffer);
            return;
        }
        if (typeof self.userInofEcho[remoteInfo.address] == "undefined") self.userInofEcho[remoteInfo.address] = {tries:0, times:new Date().getTime(), locked:false};
        if ((new Date().getTime() - self.userInofEcho[remoteInfo.address].times) > 60000) {
            var now = new Date().getTime();
            if (self.userInofEcho[remoteInfo.address].tries > 1500) {
                self.userInofEcho[remoteInfo.address].locked = now + 600000;
            }
            var tries = self.userInofEcho[remoteInfo.address].tries;
            self.userInofEcho[remoteInfo.address].times = now;
            self.userInofEcho[remoteInfo.address].tries = 0;
            //開始檢查
            if ((now - self.userInofEcho[remoteInfo.address].locked) > 0) {
                // 10 min locked
                self.userInofEcho[remoteInfo.address].locked = 0;
            } else {
                NSLog.log('error','Client connections count:%s too much...Lucked IP:%s', tries, remoteInfo.address);
                handle.close();
                tcp.handleRelease(handle);
                return;
            }

        }
        self.userInofEcho[remoteInfo.address].tries++;


        if(handle.mode == 'ws' || handle.mode == 'socket' || handle.mode == 'flashsocket') {

            if(handle.namespace.indexOf("policy-file-request") != -1 ) {
                NSLog.log('warning','Clients(%s:%s) not uninvited ... to close().', remoteInfo.address, remoteInfo.port);
                handle.close();
                tcp.handleRelease(handle);
                return;
            }
            if (handle.namespace === "/testline/g1") {
                self.clusters[0][0].send({'evt':'c_init',data:buffer}, handle,{keepOpen:false});
                tcp.waithandleClose(handle,5000);
                return;
            }

            //TODO fms vp6f sample

            //過濾不明的namesapce
            if (handle.namespace.substr(0,1) != "/") {
                handle.close();
                tcp.handleRelease(handle);
                handle = null;
                return;
            };
            // if (handle.namespace === "/video/shane/shane/") {
            //     self.clusters[0][0].send({'evt':'c_init',data:buffer}, handle,{keepOpen:false});
            //     tcp.waithandleClose(handle,5000);
            //     return;
            // }
            var flag = argFlags[handle.urlArguments["d"]];
            console.log("handle.namespace : ", handle.namespace,flag);
            self.assign(handle.namespace, flag , function (worker) {

                if (typeof worker === 'undefined') {
                    handle.close();
                    tcp.handleRelease(handle);
                }else{
                    worker.send({'evt':'c_init',data:buffer}, handle, {keepOpen:false});
                    tcp.waithandleClose(handle,5000);
                };

            });
        }else if (handle.mode == 'http') {
            /*
            if (handle.urlArguments["output"] == "http_chunked") {
                self.assign(handle.namespace, "H264" , function (worker) {

                    if (typeof worker === 'undefined') {
                        handle.close();
                        tcp.handleRelease(handle);
                    }else{
                        worker.send({'evt':'http_chunked',"data":buffer}, handle, {keepOpen:false});
                        tcp.waithandleClose(handle, 5000);
                    }

                });

                return;
            }
            */

            if (cfg.httpEnabled) {
                var worker = self.clusters[0][0];
                if (typeof worker === 'undefined') return;
                worker.send({'evt':'c_init',data:buffer}, handle, {keepOpen:false});
                tcp.waithandleClose(handle,5000);
                return;
            }
            NSLog.log("error", 'The client(%s:%s) try(%s) http request (%s) but Not Support HTTP procotol.', remoteInfo.address, remoteInfo.port, remoteInfo.address + ":" + remoteInfo.port, handle.namespace);
            handle.close();
            tcp.handleRelease(handle);
        }else {
            console.error('Not found client to use the %s request Connections!!', remoteInfo.address, handle.mode);
            handle.close();
            tcp.handleRelease(handle);
        }

    });

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
    var env = process.env;
    var num = 0;
    var mxoss = 0;
    var assign;
    var clusters = [];
    if (typeof opt.cluster == "string") {
        num = Number(opt.clusterNum);
    }else {
        num = Number(opt.cluster.length);
    }

    if (isMaster && num != 0) { // isMaster
        for (var i = 0; i < num; i++) {

            // file , fork.settings, args
            env.NODE_CDID = i;
            if (opt.cluster[i].assign) assign = utilities.trimAny(opt.cluster[i].assign);
            mxoss = opt.cluster[i].mxoss || 2048;
            env.PORT = cfg.appConfig.port;
            if(cfg.broadcast == false)
                env.streamSource = cfg.streamSource.host;
            var cluster = new daemon(opt.cluster,[i],{silent:false, env:env, execArgv:["--nouse-idle-notification","--expose-gc","--max-old-space-size=" + mxoss]}); //心跳系統
            cluster.init();
            cluster.name = assign;
            cluster.tag = 'channel_' + i;
            if (!clusters[i]) {
                clusters[i] = [];
            }
            /*//chnage video namespace
            cluster.emitter.on('socket_handle', function (message, handle) {
                var assign = message["where"];
                for (var j = 0; j < clusters.length; j++) {
                    var next = clusters[j][0];
                    if (next.name.indexOf(assign) != -1) {
                        next.send({'evt':'c_init',data:message["data"]}, handle,{keepOpen:false});
                        return;
                    }
                }

            });
            */
            clusters[i].push(cluster);
        }
    }
    return clusters;
    /** cluster end - isMaster **/
};
StreamServer.prototype.initCluster = function(opt,id) {

    var env = process.env;
    env.NODE_CDID = (typeof id == 'undefined') ? this.clusters.length : id;
    env.PORT = cfg.appConfig.port;
    var cluster = new daemon(opt.cluster,{silent:false}, {env:env});
    cluster.init();
    cluster.tag = 'channel_' + env.NODE_CDID;
    if (!this.clusters[id]) {
        this.clusters[id] = [];
    }
    this.clusters[id][0] = cluster;
};
StreamServer.prototype.setupFMSCluster = function (opt) {
    var env = process.env;
    env.NODE_CDID = (typeof id == 'undefined') ? this.clusters.length : id;
    env.PORT = cfg.appConfig.port;
    var cluster = new daemon(opt.cluster,{silent:false}, {env:env});
    cluster.init();
    cluster.tag = 'channel_' + env.NODE_CDID;
    this.fmsSrv = cluster;
};

StreamServer.prototype.setupSingleServer = function () {
    var srv = new FxConnection(cfg.appConfig.port);
    srv.on('connection', function (socket) {
        debug('clients:',socket.name);
    });
};

// ================================= //
//        Client Connections         //
// ================================= //
StreamServer.prototype.initSocket = function (handle, buf) {
    //TODO Create Amini Socket
    var self = this;
    var sockOwner = new owner(handle, buf, this);
    var out = {};
    handle.getpeername(out);
    var key = out.address + ":" + out.port;
    sockOwner.name = key;
    this.owners[key] = sockOwner;
    sockOwner.on('close', function () {
        delete self.owners[key];
    });
};

StreamServer.prototype.createServer = function (clusterEnable) {
    this.clusterEnable = clusterEnable;
    if (this.clusterEnable) {
        this.setupClusterServer2(cfg.srvOptions);
    }else
    {
        // todo single server
    }
};

StreamServer.prototype.__defineSetter__('httpEnabled', function (enabled) {
   if (typeof enabled == "boolean") {
       cfg.httpEnabled = enabled;

   }
});
StreamServer.prototype.__defineSetter__('loadBalance', function (mode) {

    if (typeof mode === 'undefined' || mode == "" || mode == null) return;

    if (mode == "url_param") {
        cfg.balance = "url_param";
    }else if (mode.toLowerCase() == "roundrobin") {
        cfg.balance = "roundrobin";
    }else if (mode == "leastconn") {
        cfg.balance = "leastconn";
    }
});
StreamServer.prototype.clusterRestart = function (id) {
    if (this.clusters[id][0]) {
        this.clusters[id][0].restart();
    }else {
        this.initCluster(cfg.srvOptions.cluster, id);
    }
};
StreamServer.prototype.clusterConnections = function () {
    var list = [];
    for (var i = 0; i < this.clusters.length; i++) {
        var obj = this.clusters[i][0].nodeInfo.connections;
        list.push(obj);
    }
    return list;
};
StreamServer.prototype.ffmpegRestart = function (name) {
    if (this.liveStreams[name]) {
        const pid = this.liveStreams[name].ffmpeg_pid.toString();
        proc.exec("kill -9 " + pid);
        delete self.doWaiting[pid];
    }else {

    }
};
StreamServer.prototype.replaceSource = function (URL, cb) {

    var _name = URL.toString().match(/^((ws[s]?):\/\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);

    if (_name == null) {
        if (cb) cb('Invalid characters in a URL.');
        return;
    }

    if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
        var pathname = _name[6] + _name[8];
        var ipv4 = _name[3].match(/\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.|$)){4}\b/i);

        if (ipv4 == null) {
            if (cb) cb('you have entered an invalid IP address!');
            return;
        }
        if (typeof _name[4] == 'undefined') _name[4] = 80;
        var leng = this.streamSockets.length;
        for (var i = 0; i < leng; i++) {
            var obj = this.streamSockets[i];
            if (obj.namespace == pathname) {
                obj.socket.replaceLine({host:ipv4, port:_name[4]});
            }

        }
    }
};

module.exports = exports = StreamServer;

