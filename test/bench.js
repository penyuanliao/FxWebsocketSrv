/**
 * Created by Benson.Liao on 16/1/19.
 */
var WebSocket = require('ws');
var group = [];
var config = appParames();
function bench(cunt) {
    var i = cunt;
    var connected = 0;
    console.log('websocket bench starting');
    while ( i-- > 0){
        //192.168.188.15
        var ws = new WebSocket('ws://127.0.0.1:3000/video/' + config.video + '/video0/');

        ws.on('open', function () {
            //console.log('connected!!.WS');
            ++connected;
            if ((connected %100) == 0) console.log('connected :: ', connected);
            group.push(ws);
        });
        ws.on('message', function (msg) {
            var json = JSON.parse(msg);
            if (json.NetStreamEvent != 'NetStreamData') {
                console.log(json);
            }
            if (json.NetStreamEvent === "getConnections") {
                console.log('getConnections: ', json.data);
            }
        });
        ws.on('error', function (error) {
            console.log('ERROR:', error);
        });
        ws.on('close', function (e) {
            console.log('Close:', e);
        });

    }

};

setTimeout(function () {
    var ws = group[0];
    ws.send(JSON.stringify({"NetStreamEvent":"getConnections"}))
},5000);


bench(40);


function appParames(){
    var args = {};
    process.argv.forEach(function(element, index, arr) {
        // Processing

        if (element === "-p") {
            var port = parseInt(process.argv[index + 1]);

            args["port"] = !isNaN(port) ? port : 8080;
        }else if (element === "-f") {
            var fileName = process.argv[index + 1];
            if (!fileName && typeof fileName != "undefined" && fileName !=0) {
                fileName = "";
                throw "fileName no definition.";
            }
            args["fileName"] = fileName.split(" ");
        }else if (element === "-c") {
            var client = parseInt(process.argv[index + 1]);
            args["client"] = !isNaN(client) ? client : 1;
        }else if (element === "-v") {
            var video = process.argv[index + 1];
            if (!video && typeof video != "undefined" && video !=0) {
                video = "daabc";
                throw "fileName no definition.";
            }
            args["video"] = video;
        }

    });

    return args;
}