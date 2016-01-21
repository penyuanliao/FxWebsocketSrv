/**
 * Created by Benson.Liao on 16/1/19.
 */
var WebSocket = require('ws');
var group = [];

function bench(cunt) {
    var i = cunt;
    var connected = 0;
    console.log('websocket bench starting');
    while ( i-- > 0){
        //192.168.188.15
        var ws = new WebSocket('ws://127.0.0.1:3000/video/daabc/video0/');

        ws.on('open', function () {
            //console.log('connected!!.WS');
            ++connected;
            if ((connected %100) == 0) console.log('connected :: ', connected);
        });
        ws.on('message', function (data, flags) {
            console.log('data: ', data.length);
        });
        ws.on('error', function (error) {
            console.log('ERROR:', error);
        });
        ws.on('close', function (e) {
            console.log('Close:', e);
        });
        group.push(ws);
    }

};

//var config = appParames();

bench(200);


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
        }

    });

    return args;
}