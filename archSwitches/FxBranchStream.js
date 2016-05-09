/**
 * Created by Benson.Liao on 2016/5/5.
 */

const StreamServer = require('./StreamServer.js');

var stream = new StreamServer();
const cfg = require('../config.js');

stream.setupCluster(cfg.forkOptions);

if (!cfg.appConfig.fileName) {
    Error('config not found fileName setting.');
    process.exit(0);
    return;
}

if (cfg.broadcast) {

    stream.createLiveStreams(cfg.appConfig.fileName);
}else {
    stream.createClientStream(cfg.appConfig.fileName);
}

stream.createServer(true);

stream.on('streamData', function (name, base64) {

    stream.assign(name, function (worker) {
        if (worker) {
            worker.send({'evt':'streamData','namespace':name,'data':base64});
        }
    });

});