/**
 * Created by Benson.Liao on 2016/7/22.
 */
/* ************************************************************************
 SINGLETON CLASS DEFINITION
 ************************************************************************ */
var events = require('events');
var util = require('util');
util.inherits(FxDelegate, events.EventEmitter); // 繼承事件

function FxDelegate() {
    events.EventEmitter.call(this);
}

FxDelegate.instance = null;

/**
 * Singleton getInstance definition
 * @return singleton class
 */
FxDelegate.getInstance = function () {
    if(this.instance === null) {
        this.instance = new FxDelegate();
    }
    return this.instance;
};
module.exports = exports = FxDelegate.getInstance();