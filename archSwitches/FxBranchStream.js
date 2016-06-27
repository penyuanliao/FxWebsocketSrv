/**
 * Created by Benson.Liao on 2016/5/5.
 */

const StreamServer = require('./StreamServer.js');
const cfg = require('../config.js');
const path = require('path');
const NSLog              = require('fxNetSocket').logger.getInstance();
NSLog.configure({logFileEnabled:true, level:'trace', dateFormat:'[yyyy-MM-dd hh:mm:ss]',filePath:path.dirname(__dirname)+"/historyLog", maximumFileSize: 1024 * 1024 * 100});
var stream = new StreamServer();
stream.setupCluster(cfg.forkOptions);

if (!cfg.appConfig.fileName) {
    throw Error('config not found fileName setting.');
    process.exit(0);
    return;
}

if (cfg.broadcast) {
    console.log("create LiveStream");
    stream.createLiveStreams(cfg.appConfig.fileName);
}else {
    console.log("create ClientStream");
    stream.createClientStream(cfg.appConfig.fileName,cfg.streamSource.host, cfg.streamSource.port);
    
}

stream.createServer(true);

stream.on('streamData', function (name, base64) {

    if (cfg.balance === "roundrobin") {
        for (var i = 0; i < stream.clusters.length; i++) {
            var cluster = stream.clusters[i][0];
            if (cluster) {
                cluster.send({'evt':'streamData','namespace':name,'data':base64});
            }else {
                throw Error("The cluster(assigned to " + name + ") was not found on this Server.");
            }
        }
    }else {
        stream.assign(name, function (cluster) {
            if (cluster) {
                cluster.send({'evt':'streamData','namespace':name,'data':base64});
            }else {
                throw Error("The cluster(assigned to " +  name + ") was not found on this Server.");
            }
        });
    }

});

/* ------- ended testing logger ------- */

process.on('uncaughtException', function (err) {
    console.error(err.stack);
});