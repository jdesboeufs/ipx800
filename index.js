/*
** Modules
*/
var events = require('events');
var util = require('util');

var _ = require('lodash');
var request = require('superagent');
var xml2js = require('xml2js');
var debug = require('debug')('ipx800');


/*
** Default options
*/
var defaultOptions = {
    port: 80,
    interval: 100
};


/*
** Helpers
*/
function parseStatus(xmlString, done) {
    xml2js.parseString(xmlString, function(err, result) {
        if (err) return done(err);

        var status = {
            btn: {},
            analog: {}
        };

        _.forEach(result.response, function(value, key) {

            if (key.indexOf('btn') === 0) {
                status.btn[key] = value[0] === 'up';
            }

            if (key.indexOf('analog') === 0) {
                status.analog[key] = parseInt(value[0]);
            }

            if (key === 'version') {
                status.version = value[0];
            }

        });

        done(null, status);
    });
}


/*
** Constructor
*/
function Ipx800(host, options) {
    if (!host) throw new Error('Host is a required property');
    this.options = _.defaults(options || {}, defaultOptions);
    this.options.host = host;

    events.EventEmitter.call(this);
}

util.inherits(Ipx800, events.EventEmitter);


/*
** Methods
*/
Ipx800.prototype.request = function (relativePath) {
    var baseUrl = 'http://' + this.options.host + (this.options.port !== 80 ? ':' + this.options.port : '');
    var req = request.get(baseUrl + relativePath).buffer();
    if (this.options.username) req.auth(this.options.username, this.options.password);
    return req;
};

Ipx800.prototype.getStatus = function (done) {
    this.request('/status.xml').end(function(err, response) {
        if (err) return done(err);
        if (!response.ok) return done(new Error('IPX800 returned an error ' + response.status));

        parseStatus(response.text, done);
    });
};

Ipx800.prototype.updateStatus = function (done) {
    var ipx = this;

    ipx.getStatus(function(err, status) {
        if (err) return done(err);

        function updateInput(type) {
            return function (value, key) {
                if (ipx[type][key] === value) return;
                ipx[type][key] = value;
                ipx.emit('update', key, value);
                debug('%s updated: %s', key, value);
            };
        }

        if (!ipx.version) {
            ipx.btn = status.btn;
            ipx.analog = status.analog;
            ipx.version = status.version;
            ipx.emit('status-updated');
        } else {
            _.forEach(status.btn, updateInput('btn'));
            _.forEach(status.analog, updateInput('analog'));
        }

        done();
    });
};

Ipx800.prototype.listen = function () {
    if (this.running) return;
    this.running = true;
    debug('start listening');
    this.emit('listening');

    var ipx = this;

    function updateStatus() {
        ipx.updateStatus(function(err) {
            if (ipx.running) {
                if (err) ipx.emit('error', err);
                if (ipx.running) setTimeout(updateStatus, ipx.options.interval);
            }
        });
    }

    updateStatus();
};

Ipx800.prototype.stopListening = function () {
    if (!this.running) return;
    this.running = false;
    debug('stop listening');
    this.emit('stop-listening');
};


/*
** Exports
*/
exports.Ipx800 = Ipx800;
