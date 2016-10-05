/**
 * Created by Benson.Liao on 2016/6/1.
 */
var net = require('net');
var sock = new net.Socket();
sock.connect('80','103.24.83.239', function () {
    console.log('connection');
    sock.write('/video/daabb/video0/')
    sock.on('data', function (data) {
        console.log(data[data.length-1],data[data.length-2],new Buffer("\0"));
        var _data = data.toString('utf8');
        // var trim = _data.replace(/\0+/g, "");
        // console.log(JSON.parse(trim));
        console.log(data.toString('utf8') + "\n");
    })
});