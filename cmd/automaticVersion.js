/**
 * Created by Benson.Liao on 2016/7/25.
 */
const fs = require('fs');

fs.readFile('./package.json',function (err, data) {
    if(!err) {
        var info = JSON.parse(data.toString());

        console.log( info.version);

        var version = info["version"].split(".");

        info.version = version[0] + "." + version[1] + "." + (parseInt(version[2]) + 1);

        info.BuildDate = formatDate();
        fs.writeFile('./package.json', JSON.stringify(info, null, "\t"), function (err) {

        })
    }
});

function formatDate() {
    var date = new Date();
    return (date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate() + " - " + date.getHours() + ":" + date.getMinutes());
}