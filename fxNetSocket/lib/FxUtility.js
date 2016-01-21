/**
 * Created by Benson.Liao on 15/12/22.
 */
var logger = require('./FxLogger.js');
function FxUtility() {

    /* Variables */
    this.js_auto_gc;
    this.js_auto_gc_enabled = false;

    /* Codes */
};
/**
 * action auto gc()
 */
FxUtility.prototype.autoReleaseGC = function () {
    this.js_auto_gc = setInterval(function() {
        gc && gc();

    },1000);
    this.js_auto_gc_enabled = true;
};
/**
 * action auto gc() stop
 * */
FxUtility.prototype.shutDownAutoGC = function () {

    clearInterval(this.js_auto_gc);
    this.js_auto_gc = null;
    this.js_auto_gc_enabled = false;
};

/***
 * aysnc foreach ARRAY.asyncEach(func(item, resume),func())
 * @param iterator
 * @param complete
 */
Array.prototype.asyncEach = function(iterator, complete) {
    var list    = this,
        n       = list.length,
        i       = -1,
        calls   = 0,
        looping = false;

    var iterate = function() {
        calls -= 1;
        i += 1;
        if (i === n) return;
        iterator(list[i], resume);
        if (typeof complete !== 'undefined' && complete !== null && n-1 === i) { complete(); } else { //resume();
         }
    };

    var loop = function() {
        if (looping) return;
        looping = true;
        while (calls > 0) iterate();
        looping = false;
    };

    var resume = function() {
        calls += 1;
        if (typeof setTimeout === 'undefined') loop();
        else setTimeout(iterate, 1);
    };
    resume();
};

module.exports = exports = new FxUtility();


