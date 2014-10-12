// `dyio.extra_namespaces.neuronrobotics_dyio` namespace
// =====================================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');
var packet = require('../packet');

// This namespace provides the require "glue"
// to use RPCs in the 'bcs.pid' namespace.

var NRDyIONamespace = function () {
  this.root = 'neuronrobotics.dyio';

  this.parsers = {
    _rev: function (src) {
      return {};
    },

    _pwr: {
      is_rpc: true,
      get: function (src) {
        return {
          voltage: src.bytes(2, 3).toInt(),
          banks: src.bytes(0, 1).map_each(function (bank) {
            var b = bank.byte(0).toInt();
            switch (b) {
              case 1:
                return 'regulated';
              case 0:
                var v = src.bytes(2, 3).toInt();
                return (v < 5000 ? 'unpowered' : 'powered');
              default:
                return 'powered';
            }
          })
        };
      },

      critical: function (src) {
        return {
          voltage: src.bytes(2, 3).toInt(),
          banks: src.bytes(0, 1).map_each(function (bank) {
            var b = bank.byte(0).toInt();
            switch (b) {
              case 1:
                return 'regulated';
              case 0:
                var v = src.bytes(2, 3).toInt();
                return (v < 5000 ? 'unpowered' : 'powered');
              default:
                return 'powered';
            }
          })
        };
      }
    },

    info: {
      is_rpc: true,
      get: function (src) {
        return { name: src.bytes().toString() };
      },
      critical: function (src) {
        return { name: src.bytes().toString() };
      }
    }/*,

    _mac: function (src) {

    }*/
  };

  this.builders = {
    info: {
      is_rpc: true,
      get: function (bldr) {},
      critical: function (bldr, name) {
        var len = name.length;
        if (len > 16) len = 16;
        var buff = new Buffer(len);
        buff.write(name, 'ascii');
        bldr.bytes(0, len).fromBuffer();
      }
    },
    _pwr: {
      is_rpc: true,
      get: function (bldr) {},
      critical: function (bldr, brownout_detection) {
        bldr.byte(0).fromBool(brownout_detection);
      }
    }
  };

  this.send_methods = {
    _rev: 'get',
    _pwr: ['get', 'critical'],
    info: ['get', 'critical'],
    _mac: 'critical',
  };

  this.recv_methods = {
    // responses to sent packets
    _rev: { get: 'post' },
    _pwr: { get: 'post', critical: 'post' },
    info: { get: 'post', critical: 'post' },
    _mac: { critical: 'post' },
  };
};

util.inherits(NRDyIONamespace, BowlerNamespace);

module.exports = new NRDyIONamespace();
