/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const debug = require('debug')('FxClusterlb');
const fxNetSocket = require('./fxNetSocket');
const FxConnection = fxNetSocket.netConnection;
const outputStream = fxNetSocket.stdoutStream;
const parser = fxNetSocket.parser;
const utilities = fxNetSocket.utilities;
const logger = fxNetSocket.logger;
/** 建立連線 **/
const TCP = process.binding("tcp_wrap").TCP;
const fs  = require('fs');
const net  = require('net');
const evt = require('events');
const cfg = require('./config.js');
const proc = require('child_process');
/** 所有視訊stream物件 **/
var liveStreams = {};
/** 多執行緒 **/
var cluster = require('cluster');
var isWorker = ('NODE_CDID' in process.env);
var isMaster = (isWorker === false);
var server;
var clusters = [];

if (isMaster) initizatialSrv();

/** cluster ended **/
function initizatialSrv() {
    /** createLiveStreams **/
    createLiveStreams(cfg.appConfig.fileName);
    setInterval(observerTotoalUseMem, 60000); // testing code 1.0 min

    utilities.autoReleaseGC(); //** 手動 1 sec gc

    // 1. setup child process fork
    setupCluster(cfg.forkOptions);
    // 2. create listen 80 port server
    createServer(cfg.srvOptions);

}
/**
 * 建立tcp伺服器不使用node net
 * @param opt
 */
function createServer(opt) {
    if (typeof opt === 'undefined') {
        opt = {'host':'0.0.0.0', 'port': 8080,'backlog':511};
    };

    var srv = new TCP();
    srv.bind(opt.host, cfg.appConfig.port);
    srv.listen(opt.backlog);

    srv.onconnection = function (err ,handle) {

        if (err) throw new Error("client not connect.");

        handle.onread = onread_load_balance;
        handle.readStart();
        //onread_equal_division(handle);
    };

    server = srv;
}
/** srv Equal Division **/
function onread_equal_division(client_handle) {
    var worker = clusters.shift();
    worker.send({'evt':'c_equal_division'}, client_handle,[{ track: false, process: false }]);
    clusters.push(worker);
};
/**  **/
function onread_load_balance(nread, buffer) {
    var handle = this;
    if (nread < 0) return;

    //if (!Buffer.isBuffer(buffer)) buffer = new Buffer(buffer,'utf8');

    var request_headers = buffer.toString('utf8');
    var lines = request_headers.split("\r\n");
    // [?=\/] 結尾不包含
    var httpTag = lines[0].toString().match(/^GET (.+)[\/]? HTTP\/\d\.\d$/i);
    var isBrowser = typeof httpTag != 'undefined';
    var mode = "net";
    mode = request_headers.match('HTTP/1.1')  != null  ? "http" : mode;
    mode = request_headers.match('websocket') != null  ? "ws"   : mode;

    if (mode === 'ws' && isBrowser) {

        var worker = redundancy(httpTag[1]);
        if (typeof worker === 'undefined') { handle.close(); };

        worker.send({'evt':'c_init',data:request_headers}, handle,[{ track: false, process: false }]);

    }else if(mode === 'http' && isBrowser)
    {
        var worker = clusters[0];

        if (typeof worker === 'undefined') return;
        worker.send({'evt':'c_init',data:request_headers}, handle,[{ track: false, process: false }]);
    }
};

function setupCluster(opt) {
    if (typeof opt === 'undefined') {
        opt = { 'cluster': '', 'num': 0 };
    }

    /** cluster start - isMaster **/

    var num = Number(opt.num);

    if (isMaster && num != 0) { // isMaster
        for (var i = 0; i < num; i++) {

            // file , fork.settings, args
            var env = process.env;
            env.NODE_CDID = i;
            var cluster = proc.fork(opt.cluster,{silent:false}, {env:env});
            cluster.name = 'ch_' + i;
            clusters.push(cluster);
        };
    };
    /** cluster end - isMaster **/
}
/**
 * 分流處理
 * @param namespace
 * @returns {undefined}
 */
function redundancy(namespace){
    var worker = undefined;
    var maximum = clusters.length-1;
    var stremNum = cfg.appConfig.fileName.length;
    var avg = parseInt(maximum / stremNum);
    var num = 0;

    if (namespace.search('daabb') != -1) worker = clusters[++num];
    if (namespace.search('daabc') != -1) worker = clusters[++num];
    if (namespace.search('daabd') != -1) worker = clusters[++num];
    if (namespace.search('daabg') != -1) worker = clusters[++num];
    if (namespace.search('daabh') != -1) worker = clusters[++num];
    if (namespace.search('daabdg') != -1) worker = clusters[++num];
    if (namespace.search('daabdh') != -1) worker = clusters[++num];

    return worker;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - //
// STREAM //
function createLiveStreams(fileName) {
    var sn = fileName;
    var spawned,_name;
    for (var i = 0; i < sn.length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            spawned = liveStreams[pathname] = new outputStream(sn[i]);
            spawned.name = pathname;
            spawned.on('streamData', swpanedUpdate);
            spawned.on('close', swpanedClosed);
            spawned = null;
        }else {
            throw "create Live Stream path error." + sn[i];
        }

    };
};
/** 重啟stream **/
function rebootStream(spawned,skip) {
    if ((spawned.running == false && spawned.STATUS >= 2) || skip == true) {
        debug('>>rebootStream:', spawned.name);
        var spawn = liveStreams[spawned.name] = new outputStream( "rtmp://" + cfg.videoDomainName + spawned.name);
        spawn.idx = spawned.idx;
        spawn.name = spawned.name;
        spawn.on('streamData', swpanedUpdate);
        spawn.on('close', swpanedClosed);
        spawned.removeListener('streamData', swpanedUpdate);
        spawned.removeListener('close', swpanedClosed);
        spawned = null;
    }
}
/** ffmpeg stream pull the data of a base64 **/

function swpanedUpdate(base64) {
    var spawnName = this.name;
    //console.log('ffmpeg stream pull the data of a base64');
    //for (var i = 1; i < clusters.length; i++) {
    //    clusters[i].send({'evt':'streamData','namespace':spawnName,'data':base64});
    //
    //}

    var worker = redundancy(spawnName);
    worker.send({'evt':'streamData','namespace':spawnName,'data':base64});

};

function socketSend(evt, spawnName) {

    for (var i = 0; i < clusters.length; i++) {
        if (clusters[i]) {
            clusters[i].send({'handle':'socketSend','evt':evt,'spawnName':spawnName});
        }

    }

}

/* ------- start testing logger ------- */
/** ffmpeg stream close **/
function swpanedClosed(code){

    socketSend({'NetStatusEvent': 'NetConnect.Failed'}, this.name);


    //** 監聽到自動關閉,重新啟動 code == 0 **/
    if (1) {
        debug("listen swpaned Closed - ",this.name, " < REBOOTING >");
        rebootStream(this,true);
    }

    logger.reachabilityWithHostName(cfg.videoDomainName);

};
/** 觀察記憶體使用狀況 **/
function observerTotoalUseMem() {

    var keys = Object.keys(liveStreams);
    var pids = [];
    keys.asyncEach(function(element, resume) {
        resume();
        pids.push(liveStreams[element].ffmpeg.pid);
    }, function() {
        logger.logTotalMemoryUsage(pids);
    });

}
/* ------- ended testing logger ------- */

process.on('uncaughtException', function (err) {
    console.error(err.stack);
});